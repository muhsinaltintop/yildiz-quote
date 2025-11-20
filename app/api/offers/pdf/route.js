// app/api/offers/pdf/route.js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PDFDocument, StandardFonts } from 'pdf-lib';

// Türkçe karakterleri WinAnsi'ye uygun hale getir
function sanitizeText(text = '') {
  const map = {
    'ı': 'i',
    'İ': 'I',
    'ş': 's',
    'Ş': 'S',
    'ğ': 'g',
    'Ğ': 'G',
    'ç': 'c',
    'Ç': 'C',
    'ö': 'o',
    'Ö': 'O',
    'ü': 'u',
    'Ü': 'U',
  };

  return text.replace(/[ıİşŞğĞçÇöÖüÜ]/g, (ch) => map[ch] || ch);
}

export async function GET(req) {
  const db = getDb();

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'id parametresi gerekli' },
        { status: 400 }
      );
    }

    console.log('PDF route offerId:', id);

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
      console.error('Offer not found in DB for id:', id);
      return NextResponse.json(
        { error: 'Offer not found' },
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

    const coverTitle = tpl?.cover_title || 'Teklif';
    const coverNote = tpl?.cover_note || '';
    const notesHtml = tpl?.notes_html || '';
    const paymentHtml = tpl?.payment_instructions_html || '';

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

    // 4) PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const offerDate = new Date(offer.offer_date).toLocaleDateString('tr-TR');
    const validUntil = offer.valid_until
      ? new Date(offer.valid_until).toLocaleDateString('tr-TR')
      : '';

    /* --- 1. Sayfa: Kapak --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText(sanitizeText(coverTitle), {
        x: 50,
        y: height - 100,
        size: 18,
        font: fontBold,
      });

      page.drawText(sanitizeText(`Tarih: ${offerDate}`), {
        x: 50,
        y: height - 130,
        size: 12,
        font,
      });

      if (coverNote) {
        page.drawText(sanitizeText(coverNote), {
          x: 50,
          y: height - 160,
          size: 11,
          font,
          maxWidth: width - 100,
        });
      }

      if (validUntil) {
        page.drawText(
          sanitizeText(`Gecerlilik Tarihi: ${validUntil}`),
          {
            x: 50,
            y: height - 190,
            size: 11,
            font,
          }
        );
      }

      if (offer.client_name) {
        page.drawText(
          sanitizeText(`Musteri: ${offer.client_name}`),
          {
            x: 50,
            y: height - 220,
            size: 11,
            font,
          }
        );
      }
    }

    /* --- 2. Sayfa: Ücret Tablosu --- */
    {
      const page = pdfDoc.addPage();
      const { width, height } = page.getSize();

      page.drawText(
        sanitizeText('Ucret Tablosu - E-2 Vizesi Basvurusu'),
        {
          x: 50,
          y: height - 80,
          size: 16,
          font: fontBold,
        }
      );

      let y = height - 120;
      page.drawText(sanitizeText('Hizmet'), {
        x: 50,
        y,
        size: 12,
        font: fontBold,
      });
      page.drawText(sanitizeText('Ucret (USD)'), {
        x: width - 150,
        y,
        size: 12,
        font: fontBold,
      });

      y -= 20;

      const includedItems = items.filter((i) => i.is_included === 1);

      includedItems.forEach((item) => {
        if (y < 80) return;
        page.drawText(sanitizeText(item.label), {
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

      page.drawText(
        sanitizeText('Notlar – E-2 Antlasmali Yatirimci Statusu'),
        {
          x: 50,
          y: height - 80,
          size: 16,
          font: fontBold,
        }
      );

      const notesPlain = sanitizeText(
        notesHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );

      const maxWidth = width - 100;
      const fontSize = 11;
      let y = height - 110;

      const words = notesPlain.split(' ');
      let line = '';
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
        page.drawText(sanitizeText(ln), {
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

      page.drawText(sanitizeText('Odeme Talimati'), {
        x: 50,
        y: height - 80,
        size: 16,
        font: fontBold,
      });

      const paymentPlain = sanitizeText(
        paymentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      );

      const maxWidth = width - 100;
      const fontSize = 11;
      let y = height - 110;

      const words = paymentPlain.split(' ');
      let line = '';
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
        page.drawText(sanitizeText(ln), {
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
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="offer-${id}.pdf"`,
      },
    });
  } catch (err) {
    console.error('PDF route error:', err);
    return NextResponse.json(
      { error: 'PDF oluşturulurken hata oluştu' },
      { status: 500 }
    );
  }
}
