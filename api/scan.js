// Fonction serverless Vercel — lecture de facture par IA (Mindee API V2, gratuit)
// Variables d'environnement Vercel attendues :
//   MINDEE_API_KEY   = ta clé API Mindee
//   MINDEE_MODEL_ID  = l'ID du modèle Invoice
import * as mindee from 'mindee';

export const config = { api: { bodyParser: { sizeLimit: '8mb' } }, maxDuration: 60 };

const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? 0 : n; };

// Récupère une valeur simple par mots-clés dans le nom du champ
function pickSimple(obj, keys) {
  for (const k of Object.keys(obj)) {
    if (keys.some((s) => k.toLowerCase().includes(s))) {
      const v = obj[k];
      if (v && typeof v === 'object' && 'value' in v) return v.value;
      if (v && typeof v !== 'object') return v;
    }
  }
  return '';
}
// Trouve la liste des lignes (champ de type liste)
function findItems(obj) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && Array.isArray(v.items)) return v.items;
    if (Array.isArray(v)) return v;
  }
  return [];
}
function itemFields(it) {
  if (it && it.fields && typeof it.fields === 'object') return it.fields;
  if (it && typeof it === 'object') return it;
  return {};
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'méthode non autorisée', lines: [] }); return; }
  const key = process.env.MINDEE_API_KEY;
  const modelId = process.env.MINDEE_MODEL_ID;
  if (!key || !modelId) { res.status(200).json({ error: 'clé API ou model_id non configurés', lines: [] }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const dataUrl = body && body.image;
    if (!dataUrl) { res.status(400).json({ error: 'image manquante', lines: [] }); return; }

    const b64 = String(dataUrl).split(',').pop();
    const client = new mindee.Client({ apiKey: key });
    const input = new mindee.Base64Input({ inputString: b64, filename: 'facture.jpg' });
    const resp = await client.enqueueAndGetResult(mindee.product.Extraction, input, { modelId });

    // Conversion en objet simple pour un parsing générique
    let fields = {};
    try {
      const f = resp.inference.result.fields;
      fields = JSON.parse(JSON.stringify(f));
    } catch (e) { fields = {}; }

    const items = findItems(fields).map((it) => {
      const f = itemFields(it);
      return {
        name: pickSimple(f, ['desc', 'name', 'libell', 'product', 'article']) || '',
        qty: num(pickSimple(f, ['quant', 'qty', 'nombre'])),
        price: num(pickSimple(f, ['unit', 'price', 'prix'])),
      };
    });

    res.status(200).json({
      date: pickSimple(fields, ['date']) || '',
      supplierName: pickSimple(fields, ['supplier', 'fournisseur', 'vendor', 'merchant']) || '',
      total: num(pickSimple(fields, ['total'])),
      lines: items,
      _fieldNames: Object.keys(fields), // aide au calage (à retirer ensuite)
    });
  } catch (err) {
    res.status(200).json({ error: String((err && err.message) || err), lines: [] });
  }
}
