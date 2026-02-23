#!/usr/bin/env node
/**
 * Ledgerling CLI
 *
 * Usage:
 *   npm run cli                          # interactive prompt
 *   npm run cli "scrape https://example.com"
 *   npm run cli -- --dry-run "get ETH price"
 */

import "dotenv/config"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { buildFetchWithPayment } from "./services/fetchWithPayment.js"
import { classifyRequest, FALLBACK_MESSAGE } from "./classifier/classifier.js"
import { estimateExecution, executeSteps } from "./orchestrator/orchestrator.js"

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dryRunFlag = args.includes("--dry-run")
const queryArg = args.filter((a) => !a.startsWith("--")).join(" ").trim()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const hr = "─".repeat(60)

function print(msg: string) {
  process.stdout.write(msg + "\n")
}

function printSection(title: string, body: string) {
  print(`\n${hr}`)
  print(` ${title}`)
  print(hr)
  print(body)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const rl = readline.createInterface({ input, output })

async function main() {
  print("\n🔗  Ledgerling — x402 payment pipeline\n")

  // ── 1. Get query ──────────────────────────────────────────────────────────
  let query = queryArg
  if (!query) {
    query = await rl.question("  Query: ")
    query = query.trim()
  } else {
    print(`  Query: ${query}`)
  }

  if (!query) {
    print("  No query provided. Exiting.\n")
    rl.close()
    process.exit(0)
  }

  // ── 2. Classify ───────────────────────────────────────────────────────────
  const classification = classifyRequest(query)

  if (!classification.inScope || !classification.steps.length) {
    printSection("Out of scope", classification.fallbackMessage ?? FALLBACK_MESSAGE)
    print("")
    rl.close()
    process.exit(0)
  }

  // ── 3. Estimate (preflight — no charges) ──────────────────────────────────
  print("\n  Running preflight checks…")
  const estimation = await estimateExecution(classification.steps)

  printSection("Execution plan", estimation.uxSummary)

  if (!estimation.healthy) {
    print(`\n  ⚠  Some services appear unreachable: ${estimation.unavailableServices.join(", ")}`)
    const proceed = await rl.question("  Continue anyway? (y/N): ")
    if (proceed.trim().toLowerCase() !== "y") {
      print("  Aborted.\n")
      rl.close()
      process.exit(0)
    }
  }

  // ── 4. Dry-run exit ───────────────────────────────────────────────────────
  if (dryRunFlag) {
    print("\n  --dry-run flag set. No charges were incurred.\n")
    rl.close()
    process.exit(0)
  }

  // ── 5. Confirm ────────────────────────────────────────────────────────────
  const confirm = await rl.question("\n  Proceed and authorise payment? (y/N): ")
  if (confirm.trim().toLowerCase() !== "y") {
    print("  Aborted. No charges incurred.\n")
    rl.close()
    process.exit(0)
  }

  // ── 6. Build signer ───────────────────────────────────────────────────────
  print("\n  Initialising wallet…")
  let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>>
  try {
    fetchFn = await buildFetchWithPayment()
  } catch (err: any) {
    print(`\n  ✗  Wallet error: ${err.message}`)
    print("  Check your .env (OPENFORT_SECRET_KEY or EVM_PRIVATE_KEY).\n")
    rl.close()
    process.exit(1)
  }

  // ── 7. Execute ────────────────────────────────────────────────────────────
  print("  Executing steps…\n")
  const result = await executeSteps(classification.steps, fetchFn)

  if (result.success) {
    printSection("✓  Done", result.uxMessage)
    print("")
    result.results.forEach((r, i) => {
      print(`  Step ${i + 1} result:`)
      print("  " + JSON.stringify(r, null, 2).replace(/\n/g, "\n  "))
      print("")
    })
  } else {
    printSection("✗  Failed", result.uxMessage)
    print("")
  }

  rl.close()
}

main().catch((err) => {
  process.stderr.write(`\nFatal: ${err.message}\n`)
  rl.close()
  process.exit(1)
})
