// Shared APEX scoring (site API + engine use the same file).
// A trade = any confirmed tx where the fee payer's APEX balance changes. Deltas come from Helius
// enhanced transactions (accountData[].tokenBalanceChanges / nativeBalanceChange), so Raydium
// LaunchLab curve buys, CPMM buys after migration and aggregator routes all count the same way.
//
// Hour PnL (in quote units) = quote received from sells - quote spent on buys + (net APEX bought this hour) x last price.
// Holding through the hour from before doesn't score; only what you traded inside the hour.

const SOL = 'So11111111111111111111111111111111111111112';

function heliusBase(key) { return `https://api.helius.xyz/v0`; }

async function fetchJson(url, opts, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, opts);
    if (r.status === 429) { await new Promise(s => setTimeout(s, 900 * (i + 1))); continue; }
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  }
  throw new Error('rate limited');
}

// all enhanced txs for `address` with timestamp in [from, to)
async function txsInWindow(address, from, to, key, maxPages = 30) {
  const out = []; let before = '';
  for (let p = 0; p < maxPages; p++) {
    const url = `${heliusBase()}/addresses/${address}/transactions?api-key=${key}&limit=100${before ? '&before=' + before : ''}`;
    const page = await fetchJson(url);
    if (!Array.isArray(page) || !page.length) break;
    for (const t of page) if (!t.transactionError && t.timestamp >= from && t.timestamp < to) out.push(t);
    before = page[page.length - 1].signature;
    if (page[page.length - 1].timestamp < from) break;
  }
  return out.sort((a, b) => a.timestamp - b.timestamp || a.slot - b.slot);
}

function deltas(tx, owner, mint, quote) {
  let dTok = 0, dQ = 0;
  for (const a of tx.accountData || []) {
    for (const c of a.tokenBalanceChanges || []) {
      if (c.userAccount !== owner) continue;
      const v = Number(c.rawTokenAmount.tokenAmount) / 10 ** c.rawTokenAmount.decimals;
      if (c.mint === mint) dTok += v;
      if (quote !== SOL && c.mint === quote) dQ += v;
      if (quote === SOL && c.mint === SOL) dQ += v; // wrapped SOL leg
    }
    if (quote === SOL && a.account === owner) dQ += (a.nativeBalanceChange || 0) / 1e9;
  }
  if (quote === SOL && owner === tx.feePayer) dQ += (tx.fee || 0) / 1e9; // network fee isn't trading PnL
  return { dTok, dQ };
}

// Leaderboard for [from, to). cfg = {mint, quote, exclude:[wallets]}
async function board(cfg, from, to, key) {
  const txs = await txsInWindow(cfg.mint, from, to, key);
  const ex = new Set(cfg.exclude || []);
  const w = new Map(); let last = null, vol = 0, n = 0;
  for (const tx of txs) {
    const who = tx.feePayer; if (!who || ex.has(who)) continue;
    const { dTok, dQ } = deltas(tx, who, cfg.mint, cfg.quote);
    if (Math.abs(dTok) < 1e-9 || dQ === 0 || Math.sign(dTok) === Math.sign(dQ)) continue; // not a swap
    const px = Math.abs(dQ / dTok); last = px; vol += Math.abs(dQ); n++;
    const s = w.get(who) || { wallet: who, buys: 0, sells: 0, netTok: 0, trades: 0, vol: 0, lastT: 0, sig: '' };
    if (dTok > 0) s.buys += -dQ; else s.sells += dQ;
    s.netTok += dTok; s.trades++; s.vol += Math.abs(dQ); s.lastT = tx.timestamp; s.sig = tx.signature;
    w.set(who, s);
  }
  const rows = [...w.values()].map(s => ({ ...s, pnl: s.sells - s.buys + s.netTok * (last || 0) }));
  rows.sort((a, b) => b.pnl - a.pnl);
  return { from, to, price: last, volume: vol, trades: n, traders: rows.length, rows };
}

// Quote-token inflows to the creator wallet in [from, to) that did not come from the creator itself.
async function pot(cfg, from, to, key) {
  const txs = await txsInWindow(cfg.creator, from, to, key, 10);
  let sum = 0;
  for (const tx of txs) {
    if (tx.feePayer === cfg.creator) continue; // its own payouts / swaps
    const { dQ } = deltas(tx, cfg.creator, '__none__', cfg.quote);
    if (dQ > 0) sum += dQ;
  }
  return sum;
}

module.exports = { board, pot, txsInWindow, deltas, SOL };
