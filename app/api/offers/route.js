// app/api/offers/route.js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req) {
  const db = getDb();

  try {
    const body = await req.json();

    // Frontend’den beklediğimiz alanlar (isimleri kendi formuna göre güncelle):
    const {
      templateId,
      language,
      clientName,
      clientEmail,
      offerDate,
      validUntil,
      items, // [{ label, priceUsd, quantity, isIncluded }, ...]
    } = body;

    if (!templateId || !language) {
      return NextResponse.json(
        { error: 'templateId ve language zorunludur' },
        { status: 400 }
      );
    }

    // 1) Teklif kaydı
    const [result] = await db.query(
      `
      INSERT INTO offers
        (template_id, offer_date, valid_until, language, client_name, client_email)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        templateId,
        offerDate || new Date(),
        validUntil || null,
        language,
        clientName || null,
        clientEmail || null,
      ]
    );

    const offerId = result.insertId;

    // 2) Ücret kalemleri (varsa)
    if (Array.isArray(items) && items.length > 0) {
      const values = items.map((item) => [
        offerId,
        item.label,
        item.priceUsd,
        item.quantity ?? 1,
        item.isIncluded ? 1 : 0,
      ]);

      await db.query(
        `
        INSERT INTO offer_items
          (offer_id, label, price_usd, quantity, is_included)
        VALUES ?
        `,
        [values]
      );
    }

    // 3) Frontend’e geri dön – PDF için bu id kullanılacak
    return NextResponse.json(
      {
        id: offerId,
        message: 'Offer created successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/offers error:', err);
    return NextResponse.json(
      { error: 'Teklif oluşturulurken bir hata oluştu' },
      { status: 500 }
    );
  }
}
