// Fonction serverless Vercel — lecture de facture par IA (Mindee Invoice API v4)
// Clé secrète attendue dans la variable d'environnement Vercel : MINDEE_API_KEY
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'méthode non autorisée' });
    return;
  }
  const key = process.env.MINDEE_API_KEY;
  if (!key) {
    res.status(200).json({ error: 'clé API non configurée', lines: [] });
    return;
  }
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const dataUrl = body && body.image;
    if (!dataUrl) { res.status(400).json({ error: 'image manquante', lines: [] }); return; }

    const base64 = String(dataUrl).split(',').pop();
    const buf = Buffer.from(base64, 'base64');

    const fd = new FormData();
    fd.append('document', new Blob([buf], { type: 'image/jpeg' }), 'facture.jpg');

    const r = await fetch('https://api.mindee.net/v1/products/mindee/invoices/v4/predict', {
      method: 'POST',
      headers: { Authorization: 'Token ' + key },
      body: fd,
    });
    const j = await r.json();
    const pred = j && j.document && j.document.inference && j.document.inference.prediction;
    if (!pred) { res.status(200).json({ error: 'réponse OCR invalide', lines: [] }); return; }

    const val = (o) => (o && o.value != null ? o.value : '');
    const lines = (pred.line_items || []).map((li) => ({
      name: li.description || '',
      qty: li.quantity != null ? li.quantity : 0,
      price: li.unit_price != null ? li.unit_price : 0,
    }));

    res.status(200).json({
      date: val(pred.date),
      supplierName: val(pred.supplier_name),
      total: val(pred.total_amount) || 0,
      lines,
    });
  } catch (err) {
    res.status(200).json({ error: String((err && err.message) || err), lines: [] });
  }
}
