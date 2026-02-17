# POLYPINGWIN

Pingwin's Polymarket/Simmer *signals* loop.

## What this is
- A safe, minimal service that scans markets on a schedule and produces **signals** + **logs**.
- Designed to run in **paper mode** (Simmer `$SIM`) or **signals-only mode**.

## What this is NOT
- No custody of your funds.
- No private keys in code.
- No automatic real-money trading.

## Quick start

1) Set env var:

```bash
export SIMMER_API_KEY="sk_live_..."
```

2) Install deps + run:

```bash
npm install
npm run dev
```

## Deploy
This repo is structured to deploy on Railway or any Node host.

