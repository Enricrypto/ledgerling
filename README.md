# Alma

An AI assistant (Telegram bot + CLI) that lets users access a marketplace of paid AI and data services — image generation, web scraping, crypto analytics, news feeds, and more — by paying small per-request fees automatically via [x402](https://www.x402.org) micropayments.

No subscriptions. No API keys. Users ask in plain English, Alma routes to the right service, pays on their behalf, and returns the result.

---

## How it works

```
User query
    │
    ▼
classifyRequest()       → maps natural language to service steps
    │
    ▼
estimateExecution()     → preflight health checks + cost estimate (no charge)
    │
    ▼
  [user approves]
    │
    ▼
executeSteps()          → sequential x402 micropayments, atomic on failure
    │
    ▼
Result                  → formatted output, cost receipt
```

Each user gets a dedicated wallet managed by [Openfort](https://openfort.xyz) — no seed phrases, no browser extensions required.

---

## Architecture

```
src/
├── bot/
│   ├── handlers/
│   │   ├── query.ts             # Handles user messages, credits, result formatting
│   │   ├── receipt.ts           # Payment receipt display
│   │   └── start.ts             # /start command
│   ├── services/
│   │   ├── orchestrator.ts      # Bot-specific execution loop with Telegram progress callbacks
│   │   ├── balance.ts           # USDC balance helpers
│   │   ├── prompts.ts           # LLM prompt templates
│   │   └── sessions.ts          # Per-user session state
│   ├── ui/
│   │   ├── formatter.ts         # Result → Telegram message formatting
│   │   ├── messages.ts          # Static message templates
│   │   └── progress.ts          # Real-time step progress updates
│   ├── config.ts                # Bot configuration (BOT_TOKEN, credits, limits)
│   ├── types.ts                 # Shared bot types
│   └── test-orchestrator.ts     # Test harness (no Telegram required)
├── classifier/
│   ├── classifier.ts            # classifyRequest() — NLP → TaskStep[]
│   └── types.ts                 # MatchContext — shared type for classifier + registry
├── capabilities/
│   └── capabilities.ts          # 6 capability groups
├── orchestrator/
│   └── orchestrator.ts          # estimateExecution(), executeSteps(), checkServiceHealth()
├── pipeline/
│   └── pipeline.ts              # runPipeline() — full classify → estimate → execute
├── registry/
│   ├── serviceRegistry.ts       # ServiceRegistry class + defaultRegistry (17 services)
│   └── catalog.ts               # Capability catalog for bot UI
├── server/
│   ├── app.ts                   # Express x402 paywall server (receive payments)
│   ├── routes.ts                # Protected route handlers
│   └── db.ts                    # File-based wallet store (wallets.json)
├── services/
│   ├── fetchWithPayment.ts      # buildFetchWithPayment() — x402-enabled fetch
│   ├── userSigner.ts            # Per-user Openfort wallet management
│   ├── openfortSigner.ts        # Openfort TEE wallet adapter
│   └── imferencePoller.ts       # Async image generation polling (Imference)
├── utils/
│   ├── logger.ts                # Structured logger
│   └── errorHandling.ts         # classifyError(), uxMessageForError()
├── scripts/
│   └── generate-qr.ts           # Generate Telegram bot QR code
├── bot.ts                       # Telegram bot entry point
├── cli.ts                       # Interactive CLI
├── diagnose.ts                  # Service health prober
├── index.ts                     # Programmatic entry point
└── e2e/
    └── integration.test.ts      # Live integration tests (gated by LIVE_TEST=1)
```

---

## Installation

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your values:

```env
# ── Openfort (required) ─────────────────────────────────────────────────────
OPENFORT_SECRET_KEY=sk_...
OPENFORT_SHIELD_API_KEY=shpk_...
OPENFORT_SHIELD_SECRET_KEY=...

# ── Telegram bot ─────────────────────────────────────────────────────────────
BOT_TOKEN=...            # from @BotFather
BOT_USER_ID=alma-bot     # internal ID for the bot's paying wallet

# ── Chain ─────────────────────────────────────────────────────────────────────
CHAIN_ID=8453            # 8453 = Base mainnet, 84532 = Base Sepolia testnet
RPC_URL=                 # optional custom RPC
USDC_ADDRESS=0x833589fcd6edb6e08f4c7c32d4f71b54bda02913  # USDC on Base

# ── CLI ────────────────────────────────────────────────────────────────────────
CLI_USER_ID=test-user-1  # which wallet the CLI uses for payments

# ── x402 paywall server (optional, for receiving payments) ────────────────────
PAY_TO_ADDRESS=0x...     # your wallet that receives payments
X402_NETWORK=base
X402_MAX_AMOUNT=0.10
PORT=3000
```

### 3. Fund your wallet

Run the CLI once to see your wallet address:

```bash
npm run cli
```

Output:
```
🚀 Openfort wallet detected:
👤 User:    test-user-1
💳 Address: 0xYourAddress
⛓ Chain:   8453
💰 USDC Balance: 0.00 USDC
```

Send USDC (Base mainnet) to that address. Each service call costs $0.001–$0.05.

---

## Running

### Telegram bot

```bash
# Start bot
npm run bot

# Development mode (auto-restart on changes)
npm run bot:dev

# Generate QR code for mobile access
npm run qr
```

**Required:** `BOT_TOKEN`, `OPENFORT_SECRET_KEY`, USDC in the `alma-bot` wallet.

---

### CLI

Interactive payment pipeline — classify, estimate, confirm, execute.

```bash
# Interactive prompt
npm run cli

# Inline query
npm run cli "generate an image of a futuristic city"
npm run cli "scrape https://example.com"

# Dry-run: classify + estimate only, no payment prompt
npm run cli -- --dry-run "get the latest ETH price"
```

Example output:

```
🔗 Alma — x402 payment pipeline

🚀 Openfort wallet detected:
👤 User:    test-user-1
💳 Address: 0xYourAddress
⛓ Chain:   8453
💰 USDC Balance: 4.35 USDC

  Query: generate an image of a futuristic city

  Running preflight checks…

────────────────────────────────────────────────────────────
 Execution plan
────────────────────────────────────────────────────────────
Alma will execute 1 step:
  1. Imference — AI image generation (~$0.0500)

Estimated total: ~$0.0500 USD

  Proceed and authorise payment? (y/N): y

  Executing steps…

  ⏳ Image generating… (request_id: abc123)
  ✓ Image ready: https://blob.imference.com/large/....webp

────────────────────────────────────────────────────────────
 ✓ Done
────────────────────────────────────────────────────────────
All 1 step completed successfully.
Total charged: $0.0500 USD
```

---

### Service health check

Probes all registered x402 endpoints. No charges incurred.

```bash
npm run diagnose
```

---

### x402 paywall server (optional)

Run your own x402-protected endpoint to receive micropayments:

```bash
npx tsx src/server/app.ts
```

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

17 services across 6 capability groups.

---

## Testing

```bash
# Unit tests — no network, no wallet needed
npm test

# Expected output:
# Test Suites: 6 passed, 6 total
# Tests:       220 passed, 220 total

# Test bot orchestrator without Telegram
npm run test:bot "What's the latest on ETH?"

# Test x402 payment end-to-end (requires funded wallet)
npm run test:payment

# Live integration tests (requires credentials + live endpoints)
LIVE_TEST=1 npm run test:live
```

---

## Wallet system

Each user gets a dedicated Openfort backend wallet:

- **Created once** on first use, address saved to `wallets.json`
- **Idempotent** — same `userId` always resolves to the same wallet, even if `wallets.json` is lost
- **No private keys** in your environment — Openfort manages signing via TEE
- **Bot wallet** (`alma-bot`) pays for all Telegram bot requests; fund it with USDC on Base

```
wallets.json (project root)
├── "test-user-1" → { address: "0x13b2...", createdAt: ... }
└── "alma-bot"    → { address: "0xAbCd...", createdAt: ... }
```

---

## Environment variables

| Variable                   | Required | Description                                                       |
| -------------------------- | -------- | ----------------------------------------------------------------- |
| `OPENFORT_SECRET_KEY`      | Yes      | Openfort secret key for wallet creation and signing               |
| `OPENFORT_SHIELD_API_KEY`  | Yes      | Openfort Shield publishable key                                   |
| `OPENFORT_SHIELD_SECRET_KEY` | Yes    | Openfort Shield secret key                                        |
| `BOT_TOKEN`                | Bot only | Telegram bot token from @BotFather                                |
| `BOT_USER_ID`              | No       | Internal user ID for the bot wallet (default: `alma-bot`)         |
| `CLI_USER_ID`              | No       | Internal user ID for the CLI wallet (default: `default`)          |
| `CHAIN_ID`                 | No       | `8453` (Base mainnet) or `84532` (Base Sepolia, default)          |
| `RPC_URL`                  | No       | Custom RPC endpoint                                               |
| `USDC_ADDRESS`             | No       | USDC contract address on the selected chain                       |
| `PAY_TO_ADDRESS`           | Server   | Wallet address that receives x402 payments on your server         |
| `X402_NETWORK`             | Server   | Network for the paywall server (e.g. `base`)                      |
| `X402_MAX_AMOUNT`          | Server   | Max payment amount accepted (e.g. `0.10`)                         |
| `PORT`                     | No       | Paywall server port (default: `3000`)                             |
| `LIVE_TEST`                | No       | Set to `1` to run live integration tests                          |
| `IMFERENCE_DEFAULT_MODEL`  | No       | Image generation model (default: `nova3dcgxl`)                    |

### Service URL overrides

Each service has an optional `*_X402_URL` variable to override its default endpoint:

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

---

## Adding a new service

Services are fully registry-driven. Add one entry to `src/registry/serviceRegistry.ts`:

```typescript
registry.register("MyService", {
  url: "https://api.myservice.io/v1/run",
  estimatedCost: 0.02,
  description: "What this service does",
  inputSchemaHint: { query: "Input description" },
  capability: "Research & Web",
  classification: {
    phrases: ["run myservice", "use myservice"],
    keywords: ["myservice"]
  },
  buildQuery: (raw, ctx) => ({ query: raw })
})
```

The classifier will automatically route matching queries to it. No other files need changing.

---

## Error handling

| Kind             | Cause                               | Charge status           |
| ---------------- | ----------------------------------- | ----------------------- |
| `TIMEOUT`        | Request exceeded step timeout       | Ambiguous — check receipt |
| `NETWORK_ERROR`  | DNS / connection failure            | Not charged             |
| `PAYMENT_FAILED` | 402 rejected / insufficient balance | Not charged             |
| `SERVICE_ERROR`  | Service returned a failure response | Not charged             |

All errors surface as plain-English messages safe to show users — no blockchain terminology.
