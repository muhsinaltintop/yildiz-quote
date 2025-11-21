// app/api/offers/pdf/route.js
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { PDFDocument } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

// Fontları cache'leyelim
let regularFontBytesPromise = null;
let boldFontBytesPromise = null;

async function getFontBytes() {
  if (!regularFontBytesPromise) {
    regularFontBytesPromise = fs.readFile(
      path.join(process.cwd(), "public", "fonts", "OpenSans-Regular.ttf")
    );
    boldFontBytesPromise = fs.readFile(
      path.join(process.cwd(), "public", "fonts", "OpenSans-Bold.ttf")
    );
  }

  const [regular, bold] = await Promise.all([
    regularFontBytesPromise,
    boldFontBytesPromise,
  ]);

  return { regular, bold };
}

// HTML -> düz metin
function htmlToPlain(text = "") {
  return text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function GET(req) {
  const db = getDb();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "id parametresi gerekli" },
        { status: 400 }
      );
    }

    console.log("PDF route offerId:", id);

    // 1) Offer
    const [[offer]] = await db.query(
      `
      SELECT 
        id,
        template_id,
        offer_date,
        valid_until,
        language,
        client_name,
        client_email
      FROM offers
      WHERE id = ?
      `,
      [id]
    );

    if (!offer) {
      console.error("Offer not found in DB for id:", id);
      return NextResponse.json(
        { error: "Offer not found" },
        { status: 404 }
      );
    }

    // 2) Template + translation
    const [[tpl]] = await db.query(
      `
      SELECT 
        t.id,
        t.code,
        tt.cover_title,
        tt.cover_note,
        tt.notes_html,
        tt.payment_instructions_html
      FROM offer_templates t
      LEFT JOIN offer_template_translations tt
        ON tt.template_id = t.id AND tt.locale = ?
      WHERE t.id = ?
      LIMIT 1
      `,
      [offer.language, offer.template_id]
    );

    const coverTitle = tpl?.cover_title || "Teklif";
    const coverNote = tpl?.cover_note || "";
    const notesHtml = tpl?.notes_html || "";
    const paymentHtml = tpl?.payment_instructions_html || "";

    // 3) Ücret kalemleri
    const [items] = await db.query(
      `
      SELECT label, price_usd, quantity, is_included
      FROM offer_items
      WHERE offer_id = ?
      ORDER BY id
      `,
      [id]
    );

    // 4) PDF + custom font
    const pdfDoc = await PDFDocument.create();

    // ÖNEMLİ: custom font için fontkit kaydet
    pdfDoc.registerFontkit(fontkit);

    const { regular, bold } = await getFontBytes();
    const font = await pdfDoc.embedFont(regular, { subset: true });
    const fontBold = await pdfDoc.embedFont(bold, { subset: true });

    const offerDate = new Date(offer.offer_date).toLocaleDateString("tr-TR");
    const validUntil = offer.valid_until
      ? new Date(offer.valid_until).toLocaleDateString("tr-TR")
      : "";

    /* --- 1. Sayfa: Kapak --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText(coverTitle || "Teklif", {
        x: 50,
        y: height - 100,
        size: 18,
        font: fontBold,
      });

      page.drawText(`Tarih: ${offerDate}`, {
        x: 50,
        y: height - 130,
        size: 12,
        font,
      });

      if (coverNote) {
        page.drawText(coverNote, {
          x: 50,
          y: height - 160,
          size: 11,
          font,
          maxWidth: width - 100,
        });
      }

      if (validUntil) {
        page.drawText(`Geçerlilik Tarihi: ${validUntil}`, {
          x: 50,
          y: height - 190,
          size: 11,
          font,
        });
      }

      if (offer.client_name) {
        page.drawText(`Müşteri: ${offer.client_name}`, {
          x: 50,
          y: height - 220,
          size: 11,
          font,
        });
      }
    }

    /* --- 2. Sayfa: Ücret Tablosu --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText("Ücret Tablosu - E-2 Vizesi Başvurusu", {
        x: 50,
        y: height - 80,
        size: 16,
        font: fontBold,
      });

      let y = height - 120;
      page.drawText("Hizmet", {
        x: 50,
        y,
        size: 12,
        font: fontBold,
      });
      page.drawText("Ücret (USD)", {
        x: width - 150,
        y,
        size: 12,
        font: fontBold,
      });

      y -= 20;

      const includedItems = items.filter((i) => i.is_included === 1);

      includedItems.forEach((item) => {
        if (y < 80) return;
        page.drawText(item.label || "", {
          x: 50,
          y,
          size: 11,
          font,
        });
        page.drawText(`${Number(item.price_usd).toFixed(2)}`, {
          x: width - 150,
          y,
          size: 11,
          font,
        });
        y -= 18;
      });
    }

    /* --- 3. Sayfa: Notlar --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText("Notlar – E-2 Anlaşmalı Yatırımcı Statüsü", {
        x: 50,
        y: height - 80,
        size: 16,
        font: fontBold,
      });

      const notesPlain = htmlToPlain(notesHtml);
      const maxWidth = width - 100;
      const fontSize = 11;
      let y = height - 110;

      const words = notesPlain.split(" ");
      let line = "";
      const lines = [];

      words.forEach((w) => {
        const testLine = line ? `${line} ${w}` : w;
        const widthPixels = font.widthOfTextAtSize(testLine, fontSize);
        if (widthPixels > maxWidth) {
          if (line) lines.push(line);
          line = w;
        } else {
          line = testLine;
        }
      });
      if (line) lines.push(line);

      lines.forEach((ln) => {
        if (y < 50) return;
        page.drawText(ln, {
          x: 50,
          y,
          size: fontSize,
          font,
        });
        y -= 14;
      });
    }

    /* --- 4. Sayfa: Ödeme Talimatı --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText("Ödeme Talimatı", {
        x: 50,
        y: height - 80,
        size: 16,
        font: fontBold,
      });

      const paymentPlain = htmlToPlain(paymentHtml);

      const maxWidth = width - 100;
      const fontSize = 11;
      let y = height - 110;

      const words = paymentPlain.split(" ");
      let line = "";
      const lines = [];

      words.forEach((w) => {
        const testLine = line ? `${line} ${w}` : w;
        const widthPixels = font.widthOfTextAtSize(testLine, fontSize);
        if (widthPixels > maxWidth) {
          if (line) lines.push(line);
          line = w;
        } else {
          line = testLine;
        }
      });
      if (line) lines.push(line);

      lines.forEach((ln) => {
        if (y < 50) return;
        page.drawText(ln, {
          x: 50,
          y,
          size: fontSize,
          font,
        });
        y -= 14;
      });
    }

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="offer-${id}.pdf"`,
      },
    });
  } catch (err) {
    console.error("PDF route error:", err);
    return NextResponse.json(
      { error: "PDF oluşturulurken hata oluştu" },
      { status: 500 }
    );
  }
}
