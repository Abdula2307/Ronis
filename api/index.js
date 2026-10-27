// Vercel serverless function: /api
// Environment variables (set in Vercel > Settings > Environment Variables):
//   MONGODB_URI      your MongoDB connection string
//   ADMIN_EMAIL      your admin email
//   ADMIN_PASSWORD   your admin password
//   SESSION_SECRET   any long random text (used to sign admin login sessions)
const { MongoClient, ObjectId } = require('mongodb');
const crypto = require('crypto');

let client;
async function db() {
  if (!client) { client = new MongoClient(process.env.MONGODB_URI); await client.connect(); }
  return client.db(process.env.MONGODB_DB || 'ronis');
}
const secret = () => process.env.SESSION_SECRET || '';
const sign = (s) => crypto.createHmac('sha256', secret()).update(s).digest('base64url');
const makeToken = () => { const p = String(Date.now() + 1000 * 60 * 60 * 12); return p + '.' + sign(p); };
function okToken(h) {
  const t = (h || '').replace(/^Bearer /, ''); const [p, s] = t.split('.');
  if (!p || !s || !secret()) return false;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(p) > Date.now();
}
const same = (x, y) => {
  const a = crypto.createHash('sha256').update(String(x)).digest(), b = crypto.createHash('sha256').update(String(y)).digest();
  return crypto.timingSafeEqual(a, b);
};
const str = (v, n) => String(v ?? '').trim().slice(0, n);
const oid = (v) => { try { return new ObjectId(String(v)); } catch { return null; } };
const out = (d) => ({ ...d, id: String(d._id), _id: undefined });

module.exports = async (req, res) => {
  try {
    const d = await db();
    const P = d.collection('products'), O = d.collection('orders');

    if (req.method === 'GET') {
      const list = await P.find().sort({ createdAt: -1 }).toArray();
      return res.status(200).json(list.map(out));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    // ---- public: place an order ----
    if (b.a === 'order') {
      const pid = oid(b.pid), qty = parseInt(b.qty);
      const name = str(b.name, 100), phone = str(b.phone, 30), address = str(b.address, 400);
      if (!pid || !(qty >= 1) || !name || !phone || !address) return res.status(400).json({ error: 'Please fill in name, phone and address.' });
      const p = await P.findOne({ _id: pid });
      if (!p) return res.status(404).json({ error: 'Product not found.' });
      if (qty > p.stock) return res.status(400).json({ error: 'Only ' + p.stock + ' left.' });
      await O.insertOne({ pid: String(p._id), product: p.name, qty, total: +(qty * p.price).toFixed(2), name, phone, address, status: 'pending', at: Date.now() });
      return res.status(200).json({ ok: true });
    }

    // ---- admin login ----
    if (b.a === 'login') {
      const e = process.env.ADMIN_EMAIL, w = process.env.ADMIN_PASSWORD;
      if (!e || !w || !secret()) return res.status(500).json({ error: 'Server is not configured (missing environment variables).' });
      if (same(String(b.email).toLowerCase().trim(), e.toLowerCase().trim()) && same(b.password, w)) return res.status(200).json({ token: makeToken() });
      await new Promise(r => setTimeout(r, 800));
      return res.status(401).json({ error: 'Wrong email or password.' });
    }

    // ---- everything below needs admin ----
    if (!okToken(req.headers.authorization)) return res.status(401).json({ error: 'Please log in again.' });

    if (b.a === 'orders') return res.status(200).json((await O.find().sort({ at: -1 }).toArray()).map(out));
    if (b.a === 'confirm') {
      const id = oid(b.id); const o = id && await O.findOne({ _id: id });
      if (!o) return res.status(404).json({ error: 'Order not found.' });
      if (o.status === 'pending') {
        await O.updateOne({ _id: id }, { $set: { status: 'confirmed' } });
        const pid = oid(o.pid);
        if (pid) { await P.updateOne({ _id: pid }, { $inc: { stock: -o.qty } }); await P.updateOne({ _id: pid, stock: { $lt: 0 } }, { $set: { stock: 0 } }); }
      }
      return res.status(200).json({ ok: true });
    }
    if (b.a === 'delOrder') { const id = oid(b.id); if (id) await O.deleteOne({ _id: id }); return res.status(200).json({ ok: true }); }
    if (b.a === 'addProduct') {
      const price = parseFloat(b.price), stock = parseInt(b.stock), name = str(b.name, 120);
      if (!name || isNaN(price) || isNaN(stock) || price < 0 || stock < 0) return res.status(400).json({ error: 'Name, price and stock are required.' });
      const img = typeof b.img === 'string' && b.img.startsWith('data:image/') && b.img.length < 900000 ? b.img : '';
      await P.insertOne({ name, desc: str(b.desc, 500), price, stock, offer: str(b.offer, 150), img, createdAt: Date.now() });
      return res.status(200).json({ ok: true });
    }
    if (b.a === 'setStock') { const id = oid(b.id), s = parseInt(b.stock); if (id && s >= 0) await P.updateOne({ _id: id }, { $set: { stock: s } }); return res.status(200).json({ ok: true }); }
    if (b.a === 'delProduct') { const id = oid(b.id); if (id) await P.deleteOne({ _id: id }); return res.status(200).json({ ok: true }); }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error. Check your MongoDB connection.' });
  }
};
