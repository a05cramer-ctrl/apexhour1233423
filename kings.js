// GET /api/kings?creator=   (env HELIUS_API_KEY)
// Past winners = memos "APEX-CROWN|<hour>|<wallet>|<pnl>|<prize>" sent and paid by the creator wallet itself.
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const MEMO = /APEX-CROWN\|(\d+)\|([1-9A-HJ-NP-Za-km-z]{32,44})\|([-\d.eE+]+)\|([\d.eE+]+)/;
const url = () => `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
async function rpc(body) { const r = await fetch(url(), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return r.json(); }
module.exports = async (req, res) => {
  const creator = String(req.query.creator || '');
  if (!B58.test(creator)) return res.status(400).json({ error: 'bad creator' });
  try {
    const d = await rpc({ jsonrpc: '2.0', id: 1, method: 'getSignaturesForAddress', params: [creator, { limit: 1000, commitment: 'confirmed' }] });
    const hits = [];
    for (const s of d.result || []) { if (s.err || !s.memo) continue; const m = s.memo.match(MEMO); if (m) hits.push({ sig: s.signature, t: s.blockTime, hour: +m[1], wallet: m[2], pnl: +m[3], prize: +m[4] }); if (hits.length >= 48) break; }
    const ok = new Set();
    for (let i = 0; i < hits.length; i += 20) {
      const chunk = hits.slice(i, i + 20);
      const arr = await rpc(chunk.map((h, k) => ({ jsonrpc: '2.0', id: k, method: 'getTransaction', params: [h.sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }] })));
      for (const x of Array.isArray(arr) ? arr : []) { const k0 = x?.result?.transaction?.message?.accountKeys?.[0]; const p = typeof k0 === 'string' ? k0 : k0?.pubkey; if (p === creator && !x.result.meta?.err) ok.add(chunk[x.id].sig); }
      if (i + 20 < hits.length) await new Promise(r => setTimeout(r, 1100));
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=120');
    res.json({ kings: hits.filter(h => ok.has(h.sig)) });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
