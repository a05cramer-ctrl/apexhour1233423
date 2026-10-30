// GET /api/board?mint=&quote=&creator=&h=<hour>   (env HELIUS_API_KEY)
// Live leaderboard for one clock hour + the pot (creator fees that arrived this hour).
const { board, pot } = require('./_lib');
const B58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
module.exports = async (req, res) => {
  const { mint, quote, creator } = req.query;
  if (![mint, quote, creator].every(x => B58.test(String(x || '')))) return res.status(400).json({ error: 'bad params' });
  const now = Math.floor(Date.now() / 1000);
  const h = parseInt(req.query.h, 10) || Math.floor(now / 3600);
  const from = h * 3600, to = Math.min(from + 3600, now + 1);
  const key = process.env.HELIUS_API_KEY;
  try {
    const [b, p] = await Promise.all([board({ mint, quote, exclude: [creator] }, from, to, key), pot({ creator, quote }, from, to, key)]);
    b.rows = b.rows.slice(0, 50);
    res.setHeader('Cache-Control', h < Math.floor(now / 3600) ? 's-maxage=3600' : 's-maxage=12, stale-while-revalidate=30');
    res.json({ hour: h, ...b, pot: p });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
};
