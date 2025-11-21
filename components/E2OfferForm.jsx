"use client";

import { useEffect, useState } from "react";

export default function E2OfferForm() {
  const [locale, setLocale] = useState("tr");
  const [template, setTemplate] = useState(null);
  const [items, setItems] = useState([]);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [loading, setLoading] = useState(false); // hem ilk yükleme hem submit için
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [offerId, setOfferId] = useState(null);
  const [error, setError] = useState(null);

  // Şablonu ve ücret kalemlerini çek
  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/templates/e2_status_change?locale=${locale}`,
          { cache: "no-store" }
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Şablon yüklenemedi");
        }

        const data = await res.json();

        setTemplate(data.template);
        setItems(
          (data.items || []).map((i) => ({
            ...i,
            isIncluded: i.defaultChecked,
            quantity: 1,
            isCustom: false,
          }))
        );
      } catch (err) {
        console.error("Şablon yükleme hatası:", err);
        setError(err.message || "Bir hata oluştu");
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [locale]);

  const handleItemChange = (index, field, value) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    );
  };

  const addCustomItem = () => {
    setItems((prev) => [
      ...prev,
      {
        templateServiceId: null,
        serviceId: null,
        label: "Yeni hizmet",
        priceUsd: 0,
        quantity: 1,
        isIncluded: true,
        isCustom: true,
      },
    ]);
  };

  const handleRemoveItem = (index) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveTemplateItems = async () => {
    if (!template) return;

    setSavingTemplate(true);
    try {
      const res = await fetch(`/api/templates/${template.code}/services`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale,
          items: items.map((i, idx) => ({
            templateServiceId: i.templateServiceId || null,
            serviceId: i.serviceId || null,
            label: i.label,
            priceUsd: Number(i.priceUsd || 0),
            sortOrder: idx + 1,
          })),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Ücret tablosu kaydetme hatası:", data);
        alert(data.error || "Ücret tablosu kaydedilemedi");
      } else {
        alert("Ücret tablosu şablon olarak kaydedildi.");
      }
    } catch (err) {
      console.error("Ücret tablosu kaydetme hatası:", err);
      alert("Beklenmeyen bir hata oluştu.");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSubmit = async () => {
    if (!template) return;

    setLoading(true);
    setError(null);

    try {
      const payload = {
        templateId: template.id,
        language: locale,
        clientName,
        clientEmail,
        items: items.map((i) => ({
          templateServiceId: i.templateServiceId,
          serviceId: i.serviceId,
          label: i.label,
          priceUsd: Number(i.priceUsd || 0),
          quantity: Number(i.quantity || 1),
          isIncluded: !!i.isIncluded,
          isCustom: !!i.isCustom,
        })),
      };

      const res = await fetch("/api/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        console.error("Teklif oluşturma hatası:", {
          status: res.status,
          data,
        });
        const msg =
          data.error ||
          `Teklif oluşturulamadı (status: ${res.status || "bilinmiyor"})`;
        setError(msg);
        alert(msg);
        return;
      }

      // Backend'in ne döndürdüğüne göre iki ihtimali de destekle
      const newOfferId = data.offerId ?? data.id;

      if (!newOfferId) {
        console.error("API response içinde offerId/id yok:", data);
        alert(
          "Teklif oluşturuldu ancak teklif ID alınamadı. Lütfen logları kontrol edin."
        );
        return;
      }

      setOfferId(newOfferId);

      // PDF endpoint'ini aç
      window.open(`/api/offers/pdf?id=${newOfferId}`, "_blank");
    } catch (err) {
      console.error("Teklif oluşturma beklenmeyen hata:", err);
      setError("Beklenmeyen bir hata oluştu.");
      alert("Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !template && !error) {
    return <div>Yükleniyor...</div>;
  }

  if (error && !template) {
    return <div className="text-red-600 text-sm">Hata: {error}</div>;
  }

  if (!template) {
    return <div>Şablon bulunamadı.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Dil + müşteri bilgileri */}
      <div className="flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium mb-1">Dil</label>
          <select
            className="border rounded px-3 py-2"
            value={locale}
            onChange={(e) => setLocale(e.target.value)}
          >
            <option value="tr">Türkçe</option>
            <option value="en">English (ileride)</option>
          </select>
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium mb-1">Müşteri Adı</label>
          <input
            className="w-full border rounded px-3 py-2"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />
        </div>

        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium mb-1">
            Müşteri E-posta
          </label>
          <input
            className="w-full border rounded px-3 py-2"
            value={clientEmail}
            onChange={(e) => setClientEmail(e.target.value)}
          />
        </div>
      </div>

      {/* 1. sayfa – Kapak */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <h2 className="text-lg font-semibold mb-2">1. Sayfa – Kapak</h2>
        <p className="text-sm">
          <strong>Başlık:</strong> {template.coverTitle}
        </p>
        <p className="text-sm">
          <strong>Not:</strong> {template.coverNote}
        </p>
      </div>

      {/* 2. sayfa – Ücret Tablosu */}
      <div className="border rounded-lg p-4 bg-gray-50">
        <div className="flex justify-between items-center mb-3 gap-3">
          <h2 className="text-lg font-semibold">
            2. Sayfa – Ücret Tablosu (E-2)
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={addCustomItem}
              className="text-sm px-3 py-1 border rounded bg-white hover:bg-gray-100"
            >
              + Yeni Hizmet Kalemi
            </button>
            <button
              type="button"
              onClick={handleSaveTemplateItems}
              disabled={savingTemplate}
              className="text-sm px-3 py-1 border rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {savingTemplate ? "Kaydediliyor..." : "Ücret Tablosunu Kaydet"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Dahil</th>
                <th className="py-2 text-left">Hizmet</th>
                <th className="py-2 text-right">Fiyat (USD)</th>
                <th className="py-2 text-right">Adet</th>
                <th className="py-2 text-right">Sil</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b last:border-0">
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={item.isIncluded}
                      onChange={(e) =>
                        handleItemChange(idx, "isIncluded", e.target.checked)
                      }
                    />
                  </td>
                  <td className="py-2">
                    <input
                      className="w-full border rounded px-2 py-1 text-sm"
                      value={item.label}
                      onChange={(e) =>
                        handleItemChange(idx, "label", e.target.value)
                      }
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      className="w-24 border rounded px-2 py-1 text-right text-sm"
                      value={item.priceUsd}
                      onChange={(e) =>
                        handleItemChange(idx, "priceUsd", e.target.value)
                      }
                    />
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      className="w-16 border rounded px-2 py-1 text-right text-sm"
                      value={item.quantity}
                      onChange={(e) =>
                        handleItemChange(idx, "quantity", e.target.value)
                      }
                    />
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="text-xs px-2 py-1 border rounded bg-red-50 hover:bg-red-100 text-red-600"
                    >
                      Sil
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td
                    colSpan={5}
                    className="py-4 text-center text-gray-500 text-xs"
                  >
                    Henüz hizmet kalemi yok. “+ Yeni Hizmet Kalemi” ile
                    ekleyebilirsiniz.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ve 4. sayfa – preview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">3. Sayfa – Notlar</h2>
          <div className="text-xs text-gray-700 max-h-48 overflow-auto">
            <div
              dangerouslySetInnerHTML={{
                __html: template.notesHtml || "",
              }}
            />
          </div>
        </div>
        <div className="border rounded-lg p-4 bg-gray-50">
          <h2 className="text-lg font-semibold mb-2">
            4. Sayfa – Ödeme Talimatı
          </h2>
          <div className="text-xs text-gray-700 max-h-48 overflow-auto">
            <div
              dangerouslySetInnerHTML={{
                __html: template.paymentInstructionsHtml || "",
              }}
            />
          </div>
        </div>
      </div>

      {/* Alt buton */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={handleSubmit}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Oluşturuluyor..." : "Teklifi Oluştur ve PDF Çıkar"}
        </button>
      </div>

      {offerId && (
        <p className="text-xs text-gray-500">
          Oluşturulan teklif ID: {offerId}
        </p>
      )}
    </div>
  );
}
