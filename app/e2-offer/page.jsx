// app/e2-offer/page.jsx
import E2OfferForm from '@/components/E2OfferForm';

export default function E2OfferPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">
          E-2 Yatırımcı Vizesi Teklif Oluştur
        </h1>
        <E2OfferForm />
      </div>
    </div>
  );
}
