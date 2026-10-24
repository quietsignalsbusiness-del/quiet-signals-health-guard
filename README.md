# Quiet Signals Health Guard

**A health-factor monitoring agent for Venus lending positions on BNB Chain.**

| | |
|---|---|
| Category | **health factor** |
| ERC-8004 registry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (IdentityRegistry) |
| Chain | **BNB Smart Chain mainnet, chain ID 56** (`eip155:56`) |
| Agent ID | **382535** (`qshealthguard.agent`) |
| Registration tx | [`0xe8216f20…be745e`](https://bscscan.com/tx/0xe8216f201c114414684694ea62018f093c0a81794e505fde81bd4a2616be745e) |
| Owner (campaign wallet) | `0x998803104673C36cc7fD13F899Cf2C9c99E5A4f1` (Binance Agentic Wallet) |
| Marketplace | [TermiX](https://app.termix.ai/) — agent `cmvm98t0a20akup01yqy44ln6` |
| Agent card | [`agent-card.json`](agent-card.json) · [`.well-known/agent-registration.json`](.well-known/agent-registration.json) |

## What it does

1. **Monitor** — for any BNB Chain address, reads the Venus Core Pool Comptroller
   (`getAccountLiquidity`, `getAssetsIn`, `markets`) and each vToken
   (`getAccountSnapshot`) plus the Venus oracle, then computes collateral, debt,
   liquidity, shortfall and the **health factor**
   (`Σ collateral × liquidation threshold / Σ debt`).
2. **Report** — returns a JSON report with a status:
   `NO_DEBT`, `HEALTHY`, `AT_RISK` (HF < threshold, default 1.2) or `LIQUIDATABLE` (shortfall > 0),
   and a recommended action.
3. **Act** — prepares the protective transaction (always zero BNB value):
   `accrueInterest()` check-in to refresh the market's interest index before a
   re-check, `enterMarkets`/`exitMarket` collateral toggles, or a small
   `repayBorrow` on the largest debt. On the owner wallet it is signed with the
   Binance Agentic Wallet CLI (`baw contract-call preview/execute`), so no private
   key is ever handled.

## Run

```bash
node src/monitor.mjs report 0xYourAddress            # JSON health report
node src/monitor.mjs plan   0xYourAddress            # report + unsigned protective tx + baw command
node src/server.mjs                                   # HTTP: /health, /report/<address>, POST /a2a
npx wrangler deploy                                   # same endpoints on a Cloudflare Worker
```

Node ≥ 18, no dependencies. `RPC_URL` overrides the BSC RPC (public nodes with fallback by default).

Example (real Venus borrower, block 129498230):

```json
{ "status": "HEALTHY", "collateralUsd": 108847.66, "borrowUsd": 54817.60,
  "healthFactor": 1.5885, "borrowLimitUsed": 0.6295, "shortfallUsd": 0 }
```

## Hire it

On TermiX, hire **Quiet Signals Health Guard** (`qshealthguard.agent`): send the
address to watch, get a health-factor report and an alert/protective-action plan.

## On-chain activity log

See [`actions/log.md`](actions/log.md).

MIT licensed.
