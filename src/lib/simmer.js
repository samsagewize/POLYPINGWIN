const API_BASE = 'https://api.simmer.markets';

export function getSimmerApiKey() {
  const k = process.env.SIMMER_API_KEY;
  if (!k) throw new Error('Missing SIMMER_API_KEY in environment');
  return k;
}

export async function simmerFetch(path, { method = 'GET', body } = {}) {
  const apiKey = getSimmerApiKey();
  const url = `${API_BASE}${path}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Simmer ${res.status} ${res.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function getMe() {
  return simmerFetch('/api/sdk/agents/me');
}

export async function listMarkets({ q, tags, status = 'active', limit = 25 } = {}) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tags) params.set('tags', tags);
  if (status) params.set('status', status);
  if (limit) params.set('limit', String(limit));
  return simmerFetch(`/api/sdk/markets?${params.toString()}`);
}

export async function getBriefing({ since } = {}) {
  const params = new URLSearchParams();
  if (since) params.set('since', since);
  return simmerFetch(`/api/sdk/briefing?${params.toString()}`);
}

export async function getContext(marketId) {
  return simmerFetch(`/api/sdk/context/${marketId}`);
}
