# Ledgerling

A TypeScript orchestration engine for [x402](https://www.x402.org) micropayments. Ledgerling classifies natural-language requests into paid service calls, estimates costs before charging, and executes them atomically - so users are never silently charged for partial work.

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
│   └── serviceRegistry.ts   # ServiceRegistry class + defaultRegistry (27 services)
├── capabilities/
│   └── capabilities.ts      # CapabilityRegistry — 7 capability groups
├── services/
│   ├── fetchWithPayment.ts  # buildFetchWithPayment() — x402-enabled fetch factory
│   └── openfortSigner.ts    # OpenFort TEE backend wallet adapter
├── utils/
│   ├── logger.ts             # Structured logger (human / JSON)
│   └── errorHandling.ts      # classifyError(), uxMessageForError()
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

There are three entry points. No wallet is needed for the first two.

---

### `npm run diagnose` — check which services are reachable

Probes all 27 registered x402 endpoints and classifies each result. No charges are incurred.

```bash
npm run diagnose
```

Expected output:

```
Ledgerling — Service Diagnostic
Probing 27 services (timeout: 8s each)…

  ── Research & Web ────────────────────────────────────
  Service                    Status    HTTP   Latency   Diagnosis
  ─────────────────────────────────────────────────────────────────────────
  Firecrawl                  ✅  live  404    312ms     Not found — endpoint URL may differ in production
  Minifetch                  ✅  live  402    198ms     x402 payment required — service is live; use a funded wallet to call it

  ── Crypto & DeFi ─────────────────────────────────────
  Service                    Status    HTTP   Latency   Diagnosis
  ─────────────────────────────────────────────────────────────────────────
  SLAMai_Signals             ✅  live  402    541ms     x402 payment required — service is live; use a funded wallet to call it
  ...

────────────────────────────────────────────────────────────
  Total services          : 27
  ✅  Live                : 18
  ⚠   Endpoint errors     : 6
  ❌  Unreachable/timeout  : 3
```

**Status tiers:**

| Icon | Tier | Meaning |
|---|---|---|
| ✅ | `live` | HTTP 2xx or 402 — service is up and enforcing x402 |
| ⚠ | `endpoint_err` | Server responded but URL or auth is wrong (4xx ≠ 402, or 5xx) |
| ❌ | `unreachable` | Network error or timeout — couldn't reach the server |

A **402** response is the expected healthy status for an x402 service — it means the service is live and correctly gating access behind a micropayment. You need a funded wallet to get a 200.

Machine-readable output (safe to pipe to `jq`):

```bash
npm run diagnose -- --json
npm run diagnose -- --json | jq '[.[] | select(.tier == "unreachable")]'
npm run diagnose -- --json | jq '[.[] | select(.statusCode == 402)] | length'
```

---

### `npm run cli` — interactive payment pipeline

Runs the full classify → estimate → confirm → execute flow in your terminal. No charges until you explicitly confirm.

```bash
# Interactive prompt
npm run cli

# Inline query
npm run cli "scrape https://example.com"

# Dry-run: classify + estimate only, no payment prompt
npm run cli -- --dry-run "get the latest ETH and BTC prices"
```

#### What you'll see — dry-run (no wallet needed)

```
🔗  Ledgerling — x402 payment pipeline

  Query: get the latest ETH and BTC prices

  Running preflight checks…

────────────────────────────────────────────────────────────
 Execution plan
────────────────────────────────────────────────────────────
Ledgerling will execute 1 step:
  1. AiMoNetwork_Market — AI-augmented crypto & financial market data (~$0.0200)

Estimated total: ~$0.0200 USD

  --dry-run flag set. No charges were incurred.
```

#### What you'll see — full execution (funded wallet required)

```
🔗  Ledgerling — x402 payment pipeline

  Query: scrape https://example.com

  Running preflight checks…

────────────────────────────────────────────────────────────
 Execution plan
────────────────────────────────────────────────────────────
Ledgerling will execute 1 step:
  1. Firecrawl — Web scraping & crawling (~$0.0100)

Estimated total: ~$0.0100 USD

  Proceed and authorise payment? (y/N): y

  Initialising wallet…
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
• General utility tasks
Your request doesn't match available paid services yet.
```

#### More example queries to try

```bash
# Multi-service — routes to two steps
npm run cli -- --dry-run "get crypto news and check sentiment on ETH"
npm run cli -- --dry-run "scrape https://example.com and summarize it"

# Single-service
npm run cli -- --dry-run "upload a file to IPFS"
npm run cli -- --dry-run "check if 8.8.8.8 is malicious"
npm run cli -- --dry-run "transcribe https://audio.example.com/clip.mp3"
npm run cli -- --dry-run "run a KYC check"
npm run cli -- --dry-run "generate an image of a futuristic city"
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

| Capability | Services |
|---|---|
| Research & Web | Firecrawl, Minifetch |
| Market & News | GloriaAI, BlackSwan, Moltbook |
| Crypto & DeFi | SLAMai_Signals, SLAMai_WalletIntel, AdExAURA_Portfolio, AdExAURA_DefiPositions, DappLooker, WalletHoldings |
| AI & Media | AiMoNetwork_LLM, AiMoNetwork_Market, Imference, DaydreamsRouter, dTelecomSTT |
| Security & Compliance | Cybercentry_URL, Cybercentry_IP, MerchantGuard_Score, MerchantGuard_Scan, MerchantGuard_MysteryShop, TrustaAI |
| Storage & Content | PinataIPFS_Upload, PinataIPFS_Get, PaidLinks_Create, PaidLinks_Access |
| Utility | Utility10 |

27 services total across 7 capability groups.

---

## API reference

### `runPipeline(userQuery, fetchFn, options?)`

Full pipeline in one call.

```typescript
const result: PipelineResult = await runPipeline(
  "get ETH price and generate a chart",
  fetchFn,
  {
    dryRun: false,              // true = estimate only, no charges
    continueOnUnhealthy: false, // true = proceed even if a service is down
    stepTimeoutMs: 30_000,      // per-step timeout (0 = disabled)
    registry,                   // optional custom ServiceRegistry
  }
)
```

`PipelineResult` fields:

| Field | Type | Description |
|---|---|---|
| `query` | `string` | The original user query |
| `classification` | `ClassificationResult` | Classifier output |
| `estimation` | `OrchestratorEstimation` | Preflight cost + health |
| `execution` | `OrchestratorResult` | Execution results (absent on dryRun/abort) |
| `dryRun` | `boolean` | Whether execution was skipped |
| `abortedReason` | `string?` | Why execution was skipped (out-of-scope, unhealthy, etc.) |

---

### `estimateExecution(steps, registry?)`

Runs preflight health checks and builds a cost estimate without charging:

```typescript
const est = await estimateExecution(steps)

console.log(est.uxSummary)
// Ledgerling will execute 2 steps:
//   1. Firecrawl — Web scraping & crawling (~$0.0100)
//   2. GloriaAI — General news query (~$0.0150)
//
// Estimated total: ~$0.0250 USD

if (!est.healthy) {
  console.warn("Unavailable services:", est.unavailableServices)
}
```

---

### `executeSteps(steps, fetchFn, options?)`

Atomic sequential execution. Halts on first failure and reports exactly what was charged before the failure.

```typescript
const result = await executeSteps(steps, fetchFn, {
  stepTimeoutMs: 15_000,
  registry,
})

if (result.success) {
  console.log(result.uxMessage)       // "All 2 steps completed successfully."
  console.log(result.totalCost)       // actual USD from x402 receipts
} else {
  console.error(result.uxMessage)     // includes charge notice for prior steps
  console.error(result.failedStep)    // which step failed
}
```

---

### `classifyRequest(userQuery, registry?)`

Maps a natural-language query to a list of `TaskStep` objects. Passes an optional registry to classify against a custom service set; defaults to `defaultRegistry`.

```typescript
const { inScope, steps, fallbackMessage } = classifyRequest(
  "get the ETH price and check for fraudulent activity on 0xAbCd..."
)
// steps = [
//   { capability: "AI & Media", service: "AiMoNetwork_Market", query: { query: "...", symbols: ["eth"] } },
//   { capability: "Security & Compliance", service: "MerchantGuard_Score", query: { query: "..." } },
// ]
```

---

### `ServiceRegistry`

The classifier is fully registry-driven — every service carries its own `classification` phrases, keywords, and `buildQuery` function inside its `ServiceConfig`. Adding a new service requires only one file edit.

```typescript
import { ServiceRegistry, defaultRegistry } from "./src/registry/serviceRegistry.js"
import type { MatchContext } from "./src/classifier/types.js"

// Extend the default registry with a new x402 service
const registry = defaultRegistry.clone()
registry.register("MyService", {
  url:           "https://api.myservice.io/v1/run",
  estimatedCost: 0.05,
  description:   "My custom x402 service",
  inputSchemaHint: { query: "Input query" },
  capability:    "Utility",
  classification: {
    phrases:  ["my service", "run myservice"],
    keywords: ["myservice"],
  },
  buildQuery: (raw: string, _ctx: MatchContext) => ({ query: raw }),
})

await runPipeline(query, fetchFn, { registry })
```

`ServiceConfig` fields:

| Field | Type | Description |
|---|---|---|
| `url` | `string` | POST endpoint for the x402 service |
| `estimatedCost` | `number` | USD cost hint for preflight estimates |
| `description` | `string` | Human-readable label shown in UX summaries |
| `inputSchemaHint` | `Record<string, string>` | Documents expected POST body fields |
| `capability` | `Capability` | Which capability group this service belongs to |
| `classification.phrases` | `string[]` | Multi-word or unambiguous single-term triggers (3 pts each) |
| `classification.keywords` | `string[]` | Supporting single-word signals (1 pt each; 2 pts required to match) |
| `buildQuery` | `(raw, ctx) => object` | Builds the POST body from the user query and extracted entities |

`MatchContext` (passed to `buildQuery`) contains extracted entities from the query: `urls`, `walletAddresses`, `ipAddresses`, `cryptoSymbols`, and the original `raw` string.

---

## Error handling

`classifyError(err)` maps any raw error string to a typed `ErrorKind`:

| Kind | Trigger | Charge status |
|---|---|---|
| `TIMEOUT` | Request exceeded `stepTimeoutMs` | Ambiguous — see receipt |
| `NETWORK_ERROR` | DNS/connection failure | Not charged |
| `PAYMENT_FAILED` | 402 rejected / insufficient balance | Not charged |
| `SERVICE_ERROR` | Service returned a failure | Not charged |

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

| Variable | Required | Description |
|---|---|---|
| `OPENFORT_SECRET_KEY` | One of the two | OpenFort TEE backend wallet key |
| `EVM_PRIVATE_KEY` | One of the two | Raw EVM private key (dev only) |
| `CHAIN_ID` | No | `84532` (Base Sepolia, default) or `8453` (Base mainnet) |
| `RPC_URL` | No | Custom RPC endpoint for the selected chain |
| `LOG_FORMAT` | No | Set to `json` for newline-delimited JSON logs |
| `LIVE_TEST` | No | Set to `1` to run live integration tests |
| `X402_TEST_URL` | No | x402 endpoint for live tests (default: `https://x402index.com/api/all`) |
