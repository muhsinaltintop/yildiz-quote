// app/api/templates/[code]/services/route.js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(req, { params }) {
  const { code } = params;
  const body = await req.json();
  const { locale = 'tr', items = [] } = body;

  if (!items.length) {
    return NextResponse.json(
      { error: 'items boş olamaz' },
      { status: 400 }
    );
  }

  const db = getDb();

  try {
    // 1) Template id
    const [[tmpl]] = await db.query(
      'SELECT id FROM offer_templates WHERE code = ? LIMIT 1',
      [code]
    );

    if (!tmpl) {
      return NextResponse.json(
        { error: 'Template bulunamadı' },
        { status: 404 }
      );
    }

    const templateId = tmpl.id;

    // 2) Kalemler
    for (let idx = 0; idx < items.length; idx++) {
      const item = items[idx];
      const sortOrder = item.sortOrder || idx + 1;
      const price = Number(item.priceUsd || 0);
      const label = item.label || '';

      if (item.templateServiceId) {
        // Mevcut kalemi güncelle
        await db.query(
          `
          UPDATE template_services
          SET default_price_usd = ?, sort_order = ?
          WHERE id = ? AND template_id = ?
          `,
          [price, sortOrder, item.templateServiceId, templateId]
        );

        if (item.serviceId) {
          await db.query(
            `
            INSERT INTO service_translations
              (service_id, locale, label, default_price_usd)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
              label = VALUES(label),
              default_price_usd = VALUES(default_price_usd)
            `,
            [item.serviceId, locale, label, price]
          );
        }
      } else {
        // Yeni kalem
        const svcCode = `svc_${code}_${Date.now()}_${idx}`;

        const [svcRes] = await db.query(
          `INSERT INTO services (code, is_active) VALUES (?, 1)`,
          [svcCode]
        );
        const newServiceId = svcRes.insertId;

        await db.query(
          `
          INSERT INTO service_translations
            (service_id, locale, label, default_price_usd)
          VALUES (?, ?, ?, ?)
          `,
          [newServiceId, locale, label, price]
        );

        await db.query(
          `
          INSERT INTO template_services
            (template_id, service_id, default_price_usd, sort_order, default_checked)
          VALUES (?, ?, ?, ?, 1)
          `,
          [templateId, newServiceId, price, sortOrder]
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: 'Ücret tablosu kaydedilemedi' },
      { status: 500 }
    );
  }
}
