import { getMe, listMarkets, getContext } from './lib/simmer.js';

const CONFIG = {
  query: process.env.SCAN_QUERY || 'bitcoin',
  limit: Number(process.env.SCAN_LIMIT || 25),
  minOpportunityScore: Number(process.env.MIN_OPPORTUNITY_SCORE || 20),
  excludeFast: (process.env.EXCLUDE_FAST || 'true') === 'true',
  maxContexts: Number(process.env.MAX_CONTEXTS || 2),
};

function isFast(m) {
  try {
    const tags = JSON.parse(m.tags || '[]');
    return tags.includes('fast');
  } catch {
    return String(m.tags || '').includes('fast');
  }
}

function pickCandidates(markets) {
  const ms = markets
    .filter((m) => m.status === 'active')
    .filter((m) => (m.opportunity_score ?? 0) >= CONFIG.minOpportunityScore)
    .filter((m) => (CONFIG.excludeFast ? !isFast(m) : true))
    .sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0));
  return ms;
}

export async function runScan() {
  const me = await getMe();
  const res = await listMarkets({ q: CONFIG.query, status: 'active', limit: CONFIG.limit });
  const markets = res?.markets || [];

  const candidates = pickCandidates(markets);

  const top = candidates.slice(0, CONFIG.maxContexts);
  const contexts = [];
  for (const m of top) {
    const ctx = await getContext(m.id);
    contexts.push({ market: m, context: ctx });
  }

  return {
    checked_at: new Date().toISOString(),
    agent: {
      agent_id: me.agent_id,
      name: me.name,
      status: me.status,
      balance: me.balance,
      trades_count: me.trades_count,
    },
    config: CONFIG,
    candidates: candidates.slice(0, 10).map((m) => ({
      id: m.id,
      question: m.question,
      url: m.url,
      current_probability: m.current_probability,
      opportunity_score: m.opportunity_score,
      resolves_at: m.resolves_at,
      tags: m.tags,
    })),
    contexts: contexts.map(({ market, context }) => ({
      id: market.id,
      question: market.question,
      url: market.url,
      opportunity_score: market.opportunity_score,
      warnings: context?.warnings || null,
      time_to_resolution: context?.time_to_resolution || null,
      notes: context?.notes || null,
    })),
    note: 'Signals-only scan. No trades executed.',
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScan()
    .then((out) => {
      console.log(JSON.stringify(out, null, 2));
    })
    .catch((e) => {
      console.error(String(e?.stack || e));
      process.exit(1);
    });
}
