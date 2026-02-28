#!/usr/bin/env node
/**
 * Ledgerling CLI — wallet-aware
 *
 * Usage:
 *   npm run cli                          # interactive prompt
 *   npm run cli "scrape https://example.com"
 *   npm run cli -- --dry-run "get USDC price"
 *
 * The payer identity is set via CLI_USER_ID in .env (defaults to "default").
 * Each user ID maps to a dedicated Openfort backend wallet stored in wallets.json.
 */

import "dotenv/config"
import * as readline from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { buildFetchWithPayment } from "./services/fetchWithPayment.js"
import { classifyRequest, FALLBACK_MESSAGE } from "./classifier/classifier.js"
import { estimateExecution, executeSteps } from "./orchestrator/orchestrator.js"
import { getOrCreateUserSigner } from "./services/userSigner.js"
import { ethers } from "ethers"
import type { MatchContext } from "./classifier/types.js"

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2)
const dryRunFlag = args.includes("--dry-run")
const queryArg = args
  .filter((a) => !a.startsWith("--"))
  .join(" ")
  .trim()

// The user ID that owns the paying wallet. Set CLI_USER_ID in .env.
const CLI_USER_ID = process.env.CLI_USER_ID ?? "default"

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
// Readline
// ---------------------------------------------------------------------------
const rl = readline.createInterface({ input, output })

// ---------------------------------------------------------------------------
// Wallet — always show first
// ---------------------------------------------------------------------------
async function showWallet() {
  if (!process.env.OPENFORT_SECRET_KEY || !process.env.CHAIN_ID) {
    print("❌ Missing OPENFORT_SECRET_KEY or CHAIN_ID in .env")
    return null
  }

  let signer: Awaited<ReturnType<typeof getOrCreateUserSigner>>
  try {
    signer = await getOrCreateUserSigner(CLI_USER_ID)
  } catch (err: any) {
    console.error("[Openfort debug]", err)
    print(`❌ Could not load wallet for user "${CLI_USER_ID}": ${err.message}`)
    return null
  }

  const { address } = signer
  const chainId = Number(process.env.CHAIN_ID)
  const rpcUrl = process.env.RPC_URL ?? "https://mainnet.base.org"
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId)

  print("\n🚀 Openfort wallet detected:")
  print(`👤 User:    ${CLI_USER_ID}`)
  print(`💳 Address: ${address}`)
  print(`⛓ Chain:   ${chainId}`)

  try {
    const USDC_ADDRESS = process.env.USDC_ADDRESS ?? process.env.X402_ASSET_ADDRESS ?? ""
    if (!USDC_ADDRESS) {
      print(`⚠ Set USDC_ADDRESS or X402_ASSET_ADDRESS to show USDC balance`)
    } else {
      const ERC20 = new ethers.Contract(
        USDC_ADDRESS,
        ["function balanceOf(address) view returns (uint256)"],
        provider
      )
      const usdcBalance = await ERC20.balanceOf(address)
      print(`💰 USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`)
    }
  } catch (err: any) {
    print(`⚠ Could not fetch USDC balance: ${err.message}`)
  }

  return { address, signer }
}

// ---------------------------------------------------------------------------
// Main CLI
// ---------------------------------------------------------------------------
async function main() {
  print("\n🔗 Ledgerling — x402 payment pipeline\n")

  // 1️⃣ Show wallet first
  const wallet = await showWallet()

  // 2️⃣ Get query
  let query = queryArg
  if (!query) {
    query = (await rl.question("  Query: ")).trim()
  } else {
    print(`  Query: ${query}`)
  }

  if (!query) {
    print("  No query provided. Exiting.\n")
    rl.close()
    process.exit(0)
  }

  // 3️⃣ Build MatchContext with wallet prefilled
  const ctx: MatchContext = {
    urls: [],
    walletAddresses: wallet ? [wallet.address] : [],
    ipAddresses: [],
    cryptoSymbols: [],
    raw: query
  }

  // 4️⃣ Classify query
  const classification = classifyRequest(query)

  if (!classification.inScope || !classification.steps.length) {
    printSection(
      "Out of scope",
      classification.fallbackMessage ?? FALLBACK_MESSAGE
    )
    print("")
    rl.close()
    process.exit(0)
  }

  // 5️⃣ Preflight estimate
  print("\n  Running preflight checks…")
  const estimation = await estimateExecution(classification.steps)

  printSection("Execution plan", estimation.uxSummary)

  if (!estimation.healthy) {
    print(
      `\n  ⚠ Some services appear unreachable: ${estimation.unavailableServices.join(", ")}`
    )
    const proceed = await rl.question("  Continue anyway? (y/N): ")
    if (proceed.trim().toLowerCase() !== "y") {
      print("  Aborted.\n")
      rl.close()
      process.exit(0)
    }
  }

  // 6️⃣ Dry-run exit
  if (dryRunFlag) {
    print("\n  --dry-run flag set. No charges were incurred.\n")
    rl.close()
    process.exit(0)
  }

  // 7️⃣ Confirm payment
  const confirm = await rl.question(
    "\n  Proceed and authorise payment? (y/N): "
  )
  if (confirm.trim().toLowerCase() !== "y") {
    print("  Aborted. No charges incurred.\n")
    rl.close()
    process.exit(0)
  }

  // 8️⃣ Build fetchFn with x402 payment using the user's wallet
  if (!wallet) {
    print("\n  ✗ No wallet available. Cannot proceed.\n")
    rl.close()
    process.exit(1)
  }

  let fetchFn: Awaited<ReturnType<typeof buildFetchWithPayment>>
  try {
    fetchFn = await buildFetchWithPayment(wallet.signer)
  } catch (err: any) {
    print(`\n  ✗ Wallet error: ${err.message}`)
    print("  Check your .env (OPENFORT_SECRET_KEY).\n")
    rl.close()
    process.exit(1)
  }

  // 9️⃣ Execute steps
  print("  Executing steps…\n")
  const result = await executeSteps(classification.steps, fetchFn)

  if (result.success) {
    printSection("✓ Done", result.uxMessage)
    print("")
    result.results.forEach((r, i) => {
      print(`  Step ${i + 1} result:`)
      print("  " + JSON.stringify(r, null, 2).replace(/\n/g, "\n  "))
      print("")
    })
  } else {
    printSection("✗ Failed", result.uxMessage)
    print("")
  }

  rl.close()
}

// Graceful error handling
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0)
})

main().catch((err) => {
  process.stderr.write(`\nFatal: ${err.message}\n`)
  rl.close()
  process.exit(1)
})
