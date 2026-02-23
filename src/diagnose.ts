#!/usr/bin/env node
/**
 * Ledgerling Service Diagnostic
 *
 * Probes every service in defaultRegistry and classifies each result into
 * one of three tiers:
 *
 *   ✅  live          — 2xx or 402 (x402 enforcement is the expected response)
 *   ⚠   endpoint_err  — server responded but URL/auth is wrong (4xx ≠ 402, 5xx)
 *   ❌  unreachable   — network error or timeout
 *
 * Usage:
 *   npm run diagnose                    # Basic connectivity (HEAD/POST)
 *   npm run diagnose -- --wallet        # Wallet mode (ETH + token balances)
 *   npm run diagnose -- --json          # Machine-readable JSON
 */

import "dotenv/config"
import { ethers } from "ethers"
import { defaultRegistry } from "./registry/serviceRegistry.js"
import type { MatchContext } from "./classifier/types.js"

// ─── Config ──────────────────────────────────────────────────────────────────
const TIMEOUT_MS = 8_000

const DUMMY_CTX: MatchContext = {
  urls: [],
  walletAddresses: [],
  ipAddresses: [],
  cryptoSymbols: [],
  raw: "diagnostic probe"
}

// ─── Types ───────────────────────────────────────────────────────────────────
type Tier = "live" | "endpoint_err" | "unreachable"

interface ServiceHealth {
  service: string
  capability: string
  url: string
  tier: Tier
  statusCode?: number
  latencyMs?: number
  diagnosis: string
  error?: string
}

// ─── WALLET MODE ──────────────────────────────────────────────────────────────
async function walletDiagnostic(): Promise<void> {
  if (!process.env.EVM_PRIVATE_KEY) {
    console.log("❌ EVM_PRIVATE_KEY missing from .env")
    process.exit(1)
  }

  if (!process.env.CHAIN_ID) {
    console.log("❌ CHAIN_ID missing from .env")
    process.exit(1)
  }

  const chainId = Number(process.env.CHAIN_ID)
  const rpcUrl = process.env.RPC_URL ?? "https://base-sepolia.public.rpc.url"
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId)
  const wallet = new ethers.Wallet(process.env.EVM_PRIVATE_KEY, provider)

  console.log(`\n🚀 WALLET MODE ACTIVE`)
  console.log(`💳 Address: ${wallet.address}`)
  console.log(`⛽  Chain:  ${chainId}`)

  try {
    // Fetch balance via provider, not wallet
    const ethBalance = await provider.getBalance(wallet.address)
    console.log(`⛽ ETH Balance: ${ethers.formatEther(ethBalance)} ETH`)
  } catch (err: any) {
    console.log(`⚠ Could not fetch ETH balance: ${err.message}`)
  }

  try {
    // Replace with actual Sepolia USDC address
    const USDC_ADDRESS =
      process.env.USDC_ADDRESS ?? "0xYourSepoliaUSDCAddressHere"
    const ERC20 = new ethers.Contract(
      USDC_ADDRESS,
      ["function balanceOf(address) view returns (uint256)"],
      provider
    )
    const usdcBalance = await ERC20.balanceOf(wallet.address)
    console.log(`💰 USDC Balance: ${ethers.formatUnits(usdcBalance, 6)} USDC`)
  } catch (err: any) {
    console.log(`⚠ Could not fetch USDC balance: ${err.message}`)
  }

  console.log(`✅ Wallet ready - x402 payments would work here`)
  console.log(`💡 Next: implement x402 payer client in production code`)
}

// ─── Tier helpers ─────────────────────────────────────────────────────────────
function tierFromStatus(code: number): Tier {
  if (code === 402) return "live"
  if (code >= 200 && code < 300) return "live"
  if (code < 500) return "endpoint_err"
  return "endpoint_err"
}

function diagnosisFromStatus(code: number): string {
  if (code === 200) return "OK"
  if (code === 402)
    return "x402 payment required — service is live; use a funded wallet to call it"
  if (code === 401) return "Unauthorised — API key or credential required"
  if (code === 403) return "Forbidden — check API key or network allowlist"
  if (code === 404) return "Not found — endpoint URL may differ in production"
  if (code === 405)
    return "Method not allowed — endpoint reachable, try POST directly"
  if (code === 422)
    return "Unprocessable — endpoint live, payload validation failed"
  if (code === 429) return "Rate limited — service is live"
  if (code >= 500) return `Server error (${code}) — check service status page`
  return `HTTP ${code}`
}

// ─── Per-service probe ────────────────────────────────────────────────────────
async function probe(service: string): Promise<ServiceHealth> {
  const config = defaultRegistry.get(service)!
  const start = Date.now()

  let headStatus: number | null = null
  let headError: Error | null = null

  try {
    const res = await fetch(config.url, {
      method: "HEAD",
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    headStatus = res.status
  } catch (err: any) {
    headError = err
  }

  if (headStatus !== null) {
    return {
      service,
      capability: config.capability,
      url: config.url,
      tier: tierFromStatus(headStatus),
      statusCode: headStatus,
      latencyMs: Date.now() - start,
      diagnosis: diagnosisFromStatus(headStatus)
    }
  }

  const isTimeout =
    headError!.name === "TimeoutError" || headError!.name === "AbortError"
  if (isTimeout) {
    return {
      service,
      capability: config.capability,
      url: config.url,
      tier: "unreachable",
      latencyMs: Date.now() - start,
      diagnosis: `Timed out after ${TIMEOUT_MS / 1000}s — service may be blocking non-mainnet requests or is down`,
      error: headError!.message
    }
  }

  try {
    const body = config.buildQuery("diagnostic probe", DUMMY_CTX)
    const res = await fetch(config.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    return {
      service,
      capability: config.capability,
      url: config.url,
      tier: tierFromStatus(res.status),
      statusCode: res.status,
      latencyMs: Date.now() - start,
      diagnosis: diagnosisFromStatus(res.status)
    }
  } catch (postErr: any) {
    const isPostTimeout =
      postErr.name === "TimeoutError" || postErr.name === "AbortError"
    const cause: string | undefined =
      postErr.cause?.message ?? postErr.cause?.code
    const msg: string = cause ?? postErr.message ?? String(postErr)
    return {
      service,
      capability: config.capability,
      url: config.url,
      tier: "unreachable",
      latencyMs: Date.now() - start,
      diagnosis: isPostTimeout
        ? `Timed out after ${TIMEOUT_MS / 1000}s`
        : `Network error — ${msg}`,
      error: msg
    }
  }
}

// ─── Table rendering ──────────────────────────────────────────────────────────
const ICON: Record<Tier, string> = {
  live: "✅",
  endpoint_err: "⚠ ",
  unreachable: "❌"
}

const COL = { svc: 26, tier: 4, code: 6, lat: 9 }

function tableRow(
  svc: string,
  icon: string,
  code: string,
  lat: string,
  diagnosis: string
): string {
  return `  ${svc.padEnd(COL.svc)} ${icon}  ${code.padEnd(COL.code)} ${lat.padEnd(
    COL.lat
  )} ${diagnosis}`
}

function printTable(results: ServiceHealth[]): void {
  const groups = new Map<string, ServiceHealth[]>()
  for (const r of results) {
    if (!groups.has(r.capability)) groups.set(r.capability, [])
    groups.get(r.capability)!.push(r)
  }

  const header = tableRow("Service", "  ", "HTTP", "Latency", "Diagnosis")
  const divider = "  " + "─".repeat(header.length - 2)

  for (const [cap, entries] of groups) {
    process.stdout.write(
      `\n  ── ${cap} ${"─".repeat(Math.max(2, 52 - cap.length))}\n`
    )
    process.stdout.write(header + "\n")
    process.stdout.write(divider + "\n")
    for (const r of entries) {
      const code = r.statusCode !== undefined ? String(r.statusCode) : "—"
      const lat = r.latencyMs !== undefined ? `${r.latencyMs}ms` : "—"
      process.stdout.write(
        tableRow(r.service, ICON[r.tier], code, lat, r.diagnosis) + "\n"
      )
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (process.argv.includes("--wallet")) {
    await walletDiagnostic()
    return
  }

  const jsonFlag = process.argv.includes("--json")
  const services = defaultRegistry.names()

  if (!jsonFlag) {
    process.stdout.write(`\nLedgerling — Service Diagnostic\n`)
    process.stdout.write(
      `Probing ${services.length} services (timeout: ${TIMEOUT_MS / 1000}s each)…\n`
    )
  }

  const results = await Promise.all(
    services.map((s) =>
      probe(s).catch(
        (err): ServiceHealth => ({
          service: s,
          capability: defaultRegistry.get(s)?.capability ?? "Unknown",
          url: defaultRegistry.get(s)?.url ?? "",
          tier: "unreachable",
          diagnosis: `Unexpected error: ${err?.message ?? String(err)}`,
          error: err?.message ?? String(err)
        })
      )
    )
  )

  if (jsonFlag) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n")
    return
  }

  printTable(results)

  const live = results.filter((r) => r.tier === "live")
  const epErr = results.filter((r) => r.tier === "endpoint_err")
  const unreach = results.filter((r) => r.tier === "unreachable")

  process.stdout.write(`\n${"─".repeat(60)}\n`)
  process.stdout.write(`  Total services          : ${results.length}\n`)
  process.stdout.write(`  ✅  Live                : ${live.length}\n`)
  process.stdout.write(`  ⚠   Endpoint errors     : ${epErr.length}\n`)
  process.stdout.write(`  ❌  Unreachable/timeout  : ${unreach.length}\n`)

  if (epErr.length > 0) {
    process.stdout.write(
      `\n  ⚠  Endpoint errors (server responded — check URL or credentials):\n`
    )
    for (const r of epErr) {
      process.stdout.write(
        `     • ${r.service.padEnd(COL.svc)}  HTTP ${r.statusCode}  ${r.diagnosis}\n`
      )
    }
  }

  if (unreach.length > 0) {
    process.stdout.write(`\n  ❌  Unreachable services:\n`)
    for (const r of unreach) {
      process.stdout.write(
        `     • ${r.service.padEnd(COL.svc)}  ${r.diagnosis}\n`
      )
    }
  }

  if (epErr.length > 0 || unreach.length > 0) {
    process.stdout.write(`\n  Tips:\n`)
    process.stdout.write(
      `    • HTTP 402  → service is live; provide a funded wallet to make real calls\n`
    )
    process.stdout.write(
      `    • HTTP 404  → endpoint URL may differ between testnet and production\n`
    )
    process.stdout.write(
      `    • Timeout   → service may require mainnet or is temporarily down\n`
    )
    process.stdout.write(
      `    • Run with a funded wallet:  EVM_PRIVATE_KEY=0x...  npm run diagnose\n`
    )
  }

  process.stdout.write("\n")
  process.exit(unreach.length > 0 ? 1 : 0)
}

// Gracefully handle broken pipes
process.stdout.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EPIPE") process.exit(0)
})

main().catch((err) => {
  process.stderr.write(`\nFatal: ${err.message}\n`)
  process.exit(1)
})
