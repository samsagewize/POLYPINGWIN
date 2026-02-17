import { getMe, listMarkets, getContext } from './lib/simmer.js';

const CFG = {
  query: process.env.SCAN_QUERY || 'bitcoin',
  limit: Number(process.env.SCAN_LIMIT || 100),
  minOpportunityScore: Number(process.env.MIN_OPPORTUNITY_SCORE || 10),
  excludeFast: (process.env.EXCLUDE_FAST || 'true') === 'true',
  minVolume24h: Number(process.env.MIN_VOLUME_24H || 500),
  maxUsd: Number(process.env.MAX_USD || 2),
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
  // Simple ranking: opportunity_score primary, then volume.
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

function summarizeWarnings(warnings) {
  if (!warnings || !warnings.length) return 'none';
  return warnings.join(' | ');
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
  const hasWideSpreadWarning = warnings.some((w) => String(w).toLowerCase().includes('wide spread'));

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
      warnings,
      warning_summary: summarizeWarnings(warnings),
      block_reason: hasWideSpreadWarning ? 'WIDE_SPREAD_WARNING' : null,
    },
    action: {
      max_usd: CFG.maxUsd,
      guidance: hasWideSpreadWarning
        ? 'SKIP: market flagged wide spread. Pick another or wait.'
        : 'REVIEW: if you choose to trade, keep size <= max_usd and verify resolution criteria + order book in UI.',
    },
    note: 'This tool does NOT execute trades. It selects the single best candidate to review and enforces conservative gating.',
  }, null, 2));
})();
