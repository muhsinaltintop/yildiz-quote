// app/api/templates/[code]/route.js
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req, { params }) {
  const { code } = await params;
  const { searchParams } = new URL(req.url);
  const locale = searchParams.get('locale') || 'tr';

  const db = getDb();

  // 1) Template + translation
  const [templates] = await db.query(
    `
    SELECT 
      t.id,
      t.code,
      t.default_validity_days,
      tt.name,
      tt.cover_title,
      tt.cover_note,
      tt.notes_html,
      tt.payment_instructions_html
    FROM offer_templates t
    LEFT JOIN offer_template_translations tt
      ON tt.template_id = t.id AND tt.locale = ?
    WHERE t.code = ?
    LIMIT 1
    `,
    [locale, code]
  );

  if (!templates.length) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const template = templates[0];

  // 2) Template services + labels
  const [items] = await db.query(
    `
    SELECT 
      ts.id AS template_service_id,
      s.id AS service_id,
      st.label,
      COALESCE(ts.default_price_usd, st.default_price_usd) AS price_usd,
      ts.sort_order,
      ts.default_checked
    FROM template_services ts
    JOIN services s ON s.id = ts.service_id
    LEFT JOIN service_translations st
      ON st.service_id = s.id AND st.locale = ?
    WHERE ts.template_id = ?
    ORDER BY ts.sort_order, ts.id
    `,
    [locale, template.id]
  );

  return NextResponse.json({
    template: {
      id: template.id,
      code: template.code,
      defaultValidityDays: template.default_validity_days,
      name: template.name,
      coverTitle: template.cover_title,
      coverNote: template.cover_note,
      notesHtml: template.notes_html,
      paymentInstructionsHtml: template.payment_instructions_html,
    },
    items: items.map((i) => ({
      templateServiceId: i.template_service_id,
      serviceId: i.service_id,
      label: i.label,
      priceUsd: Number(i.price_usd || 0),
      defaultChecked: !!i.default_checked,
    })),
  });
}
