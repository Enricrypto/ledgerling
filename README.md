# Ledgerling

A TypeScript orchestration engine for [x402](https://www.x402.org) micropayments. Ledgerling classifies natural-language requests into paid service calls, estimates costs before charging, and executes them atomically - so users are never silently charged for partial work.

---

## 🤖 New: Telegram Bot (AlmaBot)

Ledgerling now includes a **Telegram bot** that wraps the engine with a conversational UI. Users send natural language queries, watch real-time payment progress, and receive formatted results — all without seeing blockchain, wallets, or crypto.

**Quick start:**

```bash
npm install
npm run bot
```

**Testing without Telegram:**

```bash
npm run test:bot "What's happening with AI regulation?"
```

**Full setup guide:** [TELEGRAM_BOT.md](TELEGRAM_BOT.md)  
**Docker & testing:** [DOCKER_TESTING.md](DOCKER_TESTING.md)  
**Demo checklist:** [DEMO_CHECKLIST.md](DEMO_CHECKLIST.md)

---

## How it works

```
User query
    │
    ▼
classifyRequest()       → maps natural language to TaskSteps
    │
    ▼
estimateExecution()     → preflight health checks + cost estimate (no charge)
    │
    ▼
  [user approves]
    │
    ▼
executeSteps()          → sequential x402 payments, atomic on failure
    │
    ▼
PipelineResult          → results, totalCost, receipts, UX messages
```

Or use `runPipeline()` to run all three phases in one call.

---

## Project structure

```
src/
├── pipeline/
│   └── pipeline.ts          # runPipeline() — full classify → estimate → execute
├── orchestrator/
│   └── orchestrator.ts      # estimateExecution(), executeSteps(), checkServiceHealth()
├── classifier/
│   ├── classifier.ts        # classifyRequest() — NLP → TaskStep[]
│   └── types.ts             # MatchContext — shared type for classifier + registry
├── registry/
│   └── serviceRegistry.ts   # ServiceRegistry class + defaultRegistry (17 active services)
├── capabilities/
│   └── capabilities.ts      # CapabilityRegistry — 6 active capability groups
├── services/
│   ├── fetchWithPayment.ts  # buildFetchWithPayment() — x402-enabled fetch factory
│   └── openfortSigner.ts    # OpenFort TEE backend wallet adapter
├── utils/
│   ├── logger.ts             # Structured logger (human / JSON)
│   └── errorHandling.ts      # classifyError(), uxMessageForError()
├── cli.ts                    # Interactive CLI — wallet detection + payment pipeline
├── diagnose.ts               # Service health prober
└── e2e/
    └── integration.test.ts   # Live integration tests (gated by LIVE_TEST=1)
```

---

## Quick start

### 1. Install

```bash
npm install
```

### 2. Configure credentials

Edit `.env` with your signer:

```env
# Recommended: OpenFort TEE backend wallet
OPENFORT_SECRET_KEY=sk_test_...

# Alternative: raw EVM private key (local dev only)
# EVM_PRIVATE_KEY=0x...

# Chain: 84532 = Base Sepolia (default), 8453 = Base mainnet
CHAIN_ID=84532
```

### 3. Run the unit tests

Verify everything compiles and all logic is correct before touching the network:

```bash
npm test
```

Expected output:

```
Test Suites: 6 passed, 6 total
Tests:       220 passed, 220 total
```

---

## Running locally

There are four entry points. No wallet is needed for the first two.

---

### `npm run bot` — Telegram bot (requires BOT_TOKEN)

Starts the Telegram bot. Users interact via Telegram chat — the bot handles classification, payment orchestration, and result formatting. See [TELEGRAM_BOT.md](TELEGRAM_BOT.md) for full setup.

```bash
# Start bot (long polling)
npm run bot

# Development mode (auto-restart on changes)
npm run bot:dev

# Generate QR code for mobile access
npm run qr
```

**Required env vars:** `BOT_TOKEN`, `OPENFORT_SECRET_KEY` (or `EVM_PRIVATE_KEY`)

---

### `npm run diagnose` — check which services are reachable

Probes all 17 registered x402 endpoints and classifies each result. No charges are incurred.

```bash
# Probe all services (no wallet needed)
npm run diagnose

# Check wallet address and balances only
npm run diagnose -- --wallet

# Machine-readable JSON output
npm run diagnose -- --json
```

Expected output:

```
Ledgerling — Service Diagnostic
Probing 17 services (timeout: 8s each)…

  ── Research & Web ────────────────────────────────────
  Service                    Status    HTTP   Latency   Diagnosis
  ─────────────────────────────────────────────────────────────────────────
  Firecrawl                  ✅  live  402    312ms     x402 payment required — service is live; use a funded wallet to call it
  Minifetch                  ✅  live  402    198ms     x402 payment required — service is live; use a funded wallet to call it

  ── Crypto & DeFi ─────────────────────────────────────
  Service                    Status    HTTP   Latency   Diagnosis
  ─────────────────────────────────────────────────────────────────────────
  SLAMai_Signals             ✅  live  402    541ms     x402 payment required — service is live; use a funded wallet to call it
  ...

────────────────────────────────────────────────────────────
  Total services          : 17
  ✅  Live                : 14
  ⚠   Endpoint errors     : 2
  ❌  Unreachable/timeout  : 1
```

**Status tiers:**

| Icon | Tier           | Meaning                                                       |
| ---- | -------------- | ------------------------------------------------------------- |
| ✅   | `live`         | HTTP 2xx or 402 — service is up and enforcing x402            |
| ⚠    | `endpoint_err` | Server responded but URL or auth is wrong (4xx ≠ 402, or 5xx) |
| ❌   | `unreachable`  | Network error or timeout — couldn't reach the server          |

A **402** response is the expected healthy status for an x402 service — it means the service is live and correctly gating access behind a micropayment. You need a funded wallet to get a 200.

#### `--wallet` mode — check balances without probing services

```bash
npm run diagnose -- --wallet
```

```
🚀 WALLET MODE ACTIVE
💳 Address: 0xYourWalletAddress
⛽  Chain:  84532
⛽ ETH Balance: 0.042 ETH
💰 USDC Balance: 10.00 USDC
✅ Wallet ready - x402 payments would work here
```

Requires `EVM_PRIVATE_KEY` and `CHAIN_ID` in `.env`.

#### JSON output (safe to pipe to `jq`)

```bash
npm run diagnose -- --json
npm run diagnose -- --json | jq '[.[] | select(.tier == "unreachable")]'
npm run diagnose -- --json | jq '[.[] | select(.statusCode == 402)] | length'
```

---

### `npm run cli` — interactive payment pipeline

Runs the full wallet detection → classify → estimate → confirm → execute flow in your terminal. No charges until you explicitly confirm.

```bash
# Interactive prompt
npm run cli

# Inline query
npm run cli "scrape https://example.com"

# Dry-run: classify + estimate only, no payment prompt
npm run cli -- --dry-run "get the latest ETH and BTC prices"
```

#### CLI flow

When you run the CLI, it always:

1. **Detects your wallet** — reads `EVM_PRIVATE_KEY` + `CHAIN_ID` from `.env`, connects to the RPC, and shows your ETH and USDC balances.
2. **Accepts a query** — inline arg or interactive prompt.
3. **Classifies** — maps the query to one or more service steps.
4. **Preflight estimate** — health-checks each service and shows cost breakdown (no charge).
5. **Confirms** — asks `Proceed and authorise payment? (y/N)`. You can abort here.
6. **Executes** — pays each step atomically via x402. Halts and reports if any step fails.

#### What you'll see — startup + dry-run

```
🔗 Ledgerling — x402 payment pipeline

🚀 Wallet detected:
💳 Address: 0xYourAddress
⛽ Chain: 84532
⛽ ETH Balance: 0.042 ETH
💰 USDC Balance: 10.00 USDC

  Query: get the latest ETH and BTC prices

  Running preflight checks…

────────────────────────────────────────────────────────────
 Execution plan
────────────────────────────────────────────────────────────
Ledgerling will execute 1 step:
  1. BlackSwan — Crypto news, market sentiment & risk signals (~$0.0300)

Estimated total: ~$0.0300 USD

  --dry-run flag set. No charges were incurred.
```

#### What you'll see — full execution (funded wallet required)

```
🔗 Ledgerling — x402 payment pipeline

🚀 Wallet detected:
💳 Address: 0xYourAddress
⛽ Chain: 84532
⛽ ETH Balance: 0.042 ETH
💰 USDC Balance: 10.00 USDC

  Query: scrape https://example.com

  Running preflight checks…

────────────────────────────────────────────────────────────
 Execution plan
────────────────────────────────────────────────────────────
Ledgerling will execute 1 step:
  1. Firecrawl — Web scraping & crawling (~$0.0100)

Estimated total: ~$0.0100 USD

  Proceed and authorise payment? (y/N): y

  Executing steps…

────────────────────────────────────────────────────────────
 ✓  Done
────────────────────────────────────────────────────────────
All 1 step completed successfully. Total charged: $0.0100 USD.

  Step 1 result:
  {
    "content": "...",
    "url": "https://example.com"
  }
```

#### Out-of-scope queries exit cleanly

```bash
npm run cli -- --dry-run "book me a flight to Paris"
```

```
────────────────────────────────────────────────────────────
 Out of scope
────────────────────────────────────────────────────────────
Ledgerling currently supports:
• Research & web scraping
• Market & news intelligence
• Crypto & DeFi analytics
• AI inference, image generation & transcription
• Security scanning & compliance
• IPFS storage & paid links
Your request doesn't match available paid services yet.
```

#### More example queries to try

```bash
# Multi-service — routes to two steps
npm run cli -- --dry-run "get crypto news and check sentiment on ETH"
npm run cli -- --dry-run "scrape https://example.com and summarize it"

# Single-service
npm run cli -- --dry-run "upload a file to IPFS"
npm run cli -- --dry-run "transcribe https://audio.example.com/clip.mp3"
npm run cli -- --dry-run "generate an image of a futuristic city"
npm run cli -- --dry-run "check wallet intel for 0xAbCd..."
npm run cli -- --dry-run "show my DeFi positions"
```

---

### `npm start` — programmatic entry point

Runs `src/index.ts` directly — use this as a starting point for your own integration:

```bash
npm start
```

The default `src/index.ts` calls a single x402 endpoint using `buildFetchWithPayment()`. Edit it to call `runPipeline()` or `executeSteps()` directly with your own query and registry.

---

## Supported services

| Capability            | Services                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Research & Web        | Firecrawl, Minifetch                                                                       |
| Market & News         | BlackSwan, Moltbook                                                                        |
| Crypto & DeFi         | SLAMai_Signals, SLAMai_WalletIntel, AdExAURA_Portfolio, AdExAURA_DefiPositions, DappLooker |
| AI & Media            | Imference, DaydreamsRouter, dTelecomSTT                                                    |
| Security & Compliance | MerchantGuard_Score, MerchantGuard_Scan, MerchantGuard_MysteryShop                         |
| Storage & Content     | PinataIPFS_Upload, PinataIPFS_Get                                                          |

17 services total across 6 capability groups.

---

## API reference

### `runPipeline(userQuery, fetchFn, options?)`

Full pipeline in one call.

```typescript
const result: PipelineResult = await runPipeline(
  "get ETH price and generate a chart",
  fetchFn,
  {
    dryRun: false, // true = estimate only, no charges
    continueOnUnhealthy: false, // true = proceed even if a service is down
    stepTimeoutMs: 30_000, // per-step timeout (0 = disabled)
    registry, // optional custom ServiceRegistry
  },
);
```

`PipelineResult` fields:

| Field            | Type                     | Description                                               |
| ---------------- | ------------------------ | --------------------------------------------------------- |
| `query`          | `string`                 | The original user query                                   |
| `classification` | `ClassificationResult`   | Classifier output                                         |
| `estimation`     | `OrchestratorEstimation` | Preflight cost + health                                   |
| `execution`      | `OrchestratorResult`     | Execution results (absent on dryRun/abort)                |
| `dryRun`         | `boolean`                | Whether execution was skipped                             |
| `abortedReason`  | `string?`                | Why execution was skipped (out-of-scope, unhealthy, etc.) |

---

### `estimateExecution(steps, registry?)`

Runs preflight health checks and builds a cost estimate without charging:

```typescript
const est = await estimateExecution(steps);

console.log(est.uxSummary);
// Ledgerling will execute 2 steps:
//   1. Firecrawl — Web scraping & crawling (~$0.0100)
//   2. BlackSwan — Crypto news, market sentiment & risk signals (~$0.0300)
//
// Estimated total: ~$0.0400 USD

if (!est.healthy) {
  console.warn("Unavailable services:", est.unavailableServices);
}
```

---

### `executeSteps(steps, fetchFn, options?)`

Atomic sequential execution. Halts on first failure and reports exactly what was charged before the failure.

```typescript
const result = await executeSteps(steps, fetchFn, {
  stepTimeoutMs: 15_000,
  registry,
});

if (result.success) {
  console.log(result.uxMessage); // "All 2 steps completed successfully."
  console.log(result.totalCost); // actual USD from x402 receipts
} else {
  console.error(result.uxMessage); // includes charge notice for prior steps
  console.error(result.failedStep); // which step failed
}
```

---

### `classifyRequest(userQuery, registry?)`

Maps a natural-language query to a list of `TaskStep` objects. Passes an optional registry to classify against a custom service set; defaults to `defaultRegistry`.

```typescript
const { inScope, steps, fallbackMessage } = classifyRequest(
  "get the ETH price and check for fraudulent activity on 0xAbCd...",
);
// steps = [
//   { capability: "Market & News", service: "BlackSwan", query: { topic: "..." } },
//   { capability: "Security & Compliance", service: "MerchantGuard_Score", query: { message: "..." } },
// ]
```

---

### `ServiceRegistry`

The classifier is fully registry-driven — every service carries its own `classification` phrases, keywords, and `buildQuery` function inside its `ServiceConfig`. Adding a new service requires only one file edit.

```typescript
import {
  ServiceRegistry,
  defaultRegistry,
} from "./src/registry/serviceRegistry.js";
import type { MatchContext } from "./src/classifier/types.js";

// Extend the default registry with a new x402 service
const registry = defaultRegistry.clone();
registry.register("MyService", {
  url: "https://api.myservice.io/v1/run",
  estimatedCost: 0.05,
  description: "My custom x402 service",
  inputSchemaHint: { query: "Input query" },
  capability: "Utility",
  classification: {
    phrases: ["my service", "run myservice"],
    keywords: ["myservice"],
  },
  buildQuery: (raw: string, _ctx: MatchContext) => ({ query: raw }),
});

await runPipeline(query, fetchFn, { registry });
```

`ServiceConfig` fields:

| Field                     | Type                     | Description                                                         |
| ------------------------- | ------------------------ | ------------------------------------------------------------------- |
| `url`                     | `string`                 | POST endpoint for the x402 service                                  |
| `estimatedCost`           | `number`                 | USD cost hint for preflight estimates                               |
| `description`             | `string`                 | Human-readable label shown in UX summaries                          |
| `inputSchemaHint`         | `Record<string, string>` | Documents expected POST body fields                                 |
| `capability`              | `Capability`             | Which capability group this service belongs to                      |
| `classification.phrases`  | `string[]`               | Multi-word or unambiguous single-term triggers (3 pts each)         |
| `classification.keywords` | `string[]`               | Supporting single-word signals (1 pt each; 2 pts required to match) |
| `buildQuery`              | `(raw, ctx) => object`   | Builds the POST body from the user query and extracted entities     |

`MatchContext` (passed to `buildQuery`) contains extracted entities from the query: `urls`, `walletAddresses`, `ipAddresses`, `cryptoSymbols`, and the original `raw` string.

---

## Error handling

`classifyError(err)` maps any raw error string to a typed `ErrorKind`:

| Kind             | Trigger                             | Charge status           |
| ---------------- | ----------------------------------- | ----------------------- |
| `TIMEOUT`        | Request exceeded `stepTimeoutMs`    | Ambiguous — see receipt |
| `NETWORK_ERROR`  | DNS/connection failure              | Not charged             |
| `PAYMENT_FAILED` | 402 rejected / insufficient balance | Not charged             |
| `SERVICE_ERROR`  | Service returned a failure          | Not charged             |

`uxMessageForError(kind, service)` returns a plain-English sentence safe to show users.

---

## Wallet setup

### OpenFort (recommended)

A server-side TEE wallet — no private key in your environment:

```env
OPENFORT_SECRET_KEY=sk_test_...
```

### Raw private key (local dev only)

```env
EVM_PRIVATE_KEY=0x...
```

Fund the wallet with USDC on the selected chain before running.

---

## Testing

```bash
# Unit tests — all 6 suites, e2e excluded (no network, no wallet needed)
npm test

# Live integration tests — requires credentials and a reachable x402 endpoint
LIVE_TEST=1 npm run test:live

# Point live tests at a specific endpoint
X402_TEST_URL=https://your-x402-server.io/api LIVE_TEST=1 npm run test:live
```

6 suites, 220 unit tests covering classifier, registry, capabilities, orchestrator, pipeline, and fetchWithPayment. The e2e suite in `src/e2e/` is excluded from `npm test` and only runs when `LIVE_TEST=1` is set.

---

## Environment variables

| Variable              | Required       | Description                                                             |
| --------------------- | -------------- | ----------------------------------------------------------------------- |
| `OPENFORT_SECRET_KEY` | One of the two | OpenFort TEE backend wallet key                                         |
| `EVM_PRIVATE_KEY`     | One of the two | Raw EVM private key (dev only)                                          |
| `CHAIN_ID`            | No             | `84532` (Base Sepolia, default) or `8453` (Base mainnet)                |
| `RPC_URL`             | No             | Custom RPC endpoint for the selected chain                              |
| `USDC_ADDRESS`        | No             | USDC contract address on the selected chain (for balance display)       |
| `LOG_FORMAT`          | No             | Set to `json` for newline-delimited JSON logs                           |
| `LIVE_TEST`           | No             | Set to `1` to run live integration tests                                |
| `X402_TEST_URL`       | No             | x402 endpoint for live tests (default: `https://x402index.com/api/all`) |

### Service proxy URLs

Each service has an optional `*_X402_URL` environment variable that overrides its default host. Set these to point a service at a real x402 proxy once you have verified endpoints. Without them, the placeholder hosts remain in place and `npm run diagnose` will report `ENOTFOUND`.

| Variable                 | Service(s)                                                         |
| ------------------------ | ------------------------------------------------------------------ |
| `FIRECRAWL_X402_URL`     | Firecrawl                                                          |
| `MINIFETCH_X402_URL`     | Minifetch                                                          |
| `BLACKSWAN_X402_URL`     | BlackSwan                                                          |
| `MOLTBOOK_X402_URL`      | Moltbook                                                           |
| `SLAMAI_X402_URL`        | SLAMai_Signals, SLAMai_WalletIntel                                 |
| `ADEXAURA_X402_URL`      | AdExAURA_Portfolio, AdExAURA_DefiPositions                         |
| `DAPPLOOKER_X402_URL`    | DappLooker                                                         |
| `IMFERENCE_X402_URL`     | Imference                                                          |
| `DAYDREAMS_X402_URL`     | DaydreamsRouter                                                    |
| `DTELECOM_X402_URL`      | dTelecomSTT                                                        |
| `MERCHANTGUARD_X402_URL` | MerchantGuard_Score, MerchantGuard_Scan, MerchantGuard_MysteryShop |
| `PINATA_X402_URL`        | PinataIPFS_Upload, PinataIPFS_Get                                  |

To activate a service, add the variable to `.env` and restart:

```env
FIRECRAWL_X402_URL=https://foldset.xyz/firecrawl
SLAMAI_X402_URL=https://zauthx402.com/slamai
```

`npm run diagnose` will then show those services as ✅ live instead of ❌ ENOTFOUND.
