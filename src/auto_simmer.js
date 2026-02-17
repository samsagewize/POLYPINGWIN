import { getMe, listMarkets, getContext, placeTrade } from './lib/simmer.js';

const CFG = {
  query: process.env.SCAN_QUERY || 'bitcoin',
  limit: Number(process.env.SCAN_LIMIT || 100),
  minOpportunityScore: Number(process.env.MIN_OPPORTUNITY_SCORE || 10),
  excludeFast: (process.env.EXCLUDE_FAST || 'true') === 'true',
  minVolume24h: Number(process.env.MIN_VOLUME_24H || 500),
  maxUsd: Number(process.env.MAX_USD || 10),
  maxSpreadPct: Number(process.env.MAX_SPREAD_PCT || 0.05),
};

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  try {
    return JSON.parse(tags || '[]');
  } catch {
    return [];
  }
}

function isFast(m) {
  const tags = parseTags(m.tags);
  return tags.includes('fast');
}

function vol(m) {
  const v = m.volume_24h;
  return typeof v === 'number' ? v : 0;
}

function scoreMarket(m) {
  const os = m.opportunity_score ?? 0;
  const v = vol(m);
  return os * 10 + Math.log10(1 + v) * 5;
}

function passesBasicFilters(m) {
  if (m.status !== 'active') return false;
  if ((m.opportunity_score ?? 0) < CFG.minOpportunityScore) return false;
  if (CFG.excludeFast && isFast(m)) return false;
  if (vol(m) < CFG.minVolume24h) return false;
  return true;
}

function hasWideSpreadWarning(warnings) {
  return (warnings || []).some((w) => String(w).toLowerCase().includes('wide spread'));
}

(async () => {
  const me = await getMe();
  const res = await listMarkets({ q: CFG.query, status: 'active', limit: CFG.limit });
  const markets = res?.markets || [];

  const candidates = markets.filter(passesBasicFilters).sort((a, b) => scoreMarket(b) - scoreMarket(a));

  if (candidates.length === 0) {
    console.log(JSON.stringify({
      checked_at: new Date().toISOString(),
      agent: { agent_id: me.agent_id, name: me.name, status: me.status },
      config: CFG,
      decision: 'NO_CANDIDATE',
      note: 'No market passed filters. Consider lowering MIN_OPPORTUNITY_SCORE or MIN_VOLUME_24H, or setting EXCLUDE_FAST=false.',
    }, null, 2));
    process.exit(0);
  }

  const pick = candidates[0];
  const ctx = await getContext(pick.id);

  const warnings = ctx?.warnings || [];
  const spreadPct = Number(ctx?.slippage?.spread_pct ?? NaN);

  const blockReason = hasWideSpreadWarning(warnings)
    ? 'WIDE_SPREAD_WARNING'
    : (Number.isFinite(spreadPct) && spreadPct > CFG.maxSpreadPct)
      ? `SPREAD_TOO_HIGH_${spreadPct}`
      : null;

  if (blockReason) {
    console.log(JSON.stringify({
      checked_at: new Date().toISOString(),
      agent: { agent_id: me.agent_id, name: me.name, status: me.status },
      config: CFG,
      pick: {
        id: pick.id,
        question: pick.question,
        url: pick.url,
        current_probability: pick.current_probability,
        opportunity_score: pick.opportunity_score,
        volume_24h: pick.volume_24h ?? null,
        resolves_at: pick.resolves_at,
        tags: pick.tags,
      },
      context_gate: {
        spread_pct: Number.isFinite(spreadPct) ? spreadPct : null,
        max_spread_pct: CFG.maxSpreadPct,
        warnings,
        block_reason: blockReason,
      },
      action: {
        max_usd: CFG.maxUsd,
        guidance: 'SKIP: market failed spread/warning gates.',
      },
      note: 'Auto-simmer did not trade due to safety gates.',
    }, null, 2));
    process.exit(0);
  }

  const trade = await placeTrade({
    market_id: pick.id,
    side: 'yes',
    amount: CFG.maxUsd,
    venue: 'simmer',
  });

  console.log(JSON.stringify({
    checked_at: new Date().toISOString(),
    agent: { agent_id: me.agent_id, name: me.name, status: me.status },
    config: CFG,
    pick: {
      id: pick.id,
      question: pick.question,
      url: pick.url,
      current_probability: pick.current_probability,
      opportunity_score: pick.opportunity_score,
      volume_24h: pick.volume_24h ?? null,
      resolves_at: pick.resolves_at,
      tags: pick.tags,
    },
    context_gate: {
      spread_pct: Number.isFinite(spreadPct) ? spreadPct : null,
      max_spread_pct: CFG.maxSpreadPct,
      warnings,
      block_reason: null,
    },
    trade,
    note: 'Auto-simmer executed a $SIM trade (venue: simmer).',
  }, null, 2));
})();
