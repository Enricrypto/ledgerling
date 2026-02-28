/**
 * End-to-end x402 payment test — per-user wallet flow.
 *
 * Requires the server to be running:
 *   npx tsx src/server/app.ts
 *
 * The user wallet must be funded with USDC before running this test.
 * Fund it manually by sending USDC on Base mainnet to the address printed below.
 *
 * Run:
 *   npm run test:payment
 *   TEST_USER_ID=alice npm run test:payment   # use a specific user
 *
 * What it does:
 *   1. Gets or creates an Openfort backend wallet for the test user.
 *   2. Prints the wallet address (fund this with USDC if not already done).
 *   3. Hits GET /api/protected-content — server returns 402.
 *   4. x402 client auto-signs a USDC payment from the user wallet and retries.
 *   5. Prints the protected payload (200 OK) or the full error.
 */

import "dotenv/config"
import { buildFetchWithPayment } from "./services/fetchWithPayment.js"
import { getOrCreateUserSigner } from "./services/userSigner.js"
import { ethers } from "ethers"

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000"
const TARGET = `${SERVER_URL}/api/protected-content`
const TEST_USER_ID = process.env.TEST_USER_ID ?? "test-user-1"

async function getUsdcBalance(address: string): Promise<string> {
  const USDC_ADDRESS = process.env.USDC_ADDRESS ?? process.env.X402_ASSET_ADDRESS ?? ""
  if (!USDC_ADDRESS) return "unknown (USDC_ADDRESS not set)"
  try {
    const rpcUrl = process.env.RPC_URL ?? "https://mainnet.base.org"
    const provider = new ethers.JsonRpcProvider(rpcUrl, Number(process.env.CHAIN_ID ?? "8453"))
    const ERC20 = new ethers.Contract(
      USDC_ADDRESS,
      ["function balanceOf(address) view returns (uint256)"],
      provider
    )
    const bal = await ERC20.balanceOf(address)
    return `${ethers.formatUnits(bal, 6)} USDC`
  } catch {
    return "unavailable"
  }
}

async function main() {
  console.log(`\n🔗 x402 per-user payment test`)
  console.log(`   User:   ${TEST_USER_ID}`)
  console.log(`   Target: ${TARGET}\n`)

  // Step 1: get or create the user wallet
  console.log("  1️⃣  Resolving user wallet…")
  const signer = await getOrCreateUserSigner(TEST_USER_ID)
  console.log(`     Address: ${signer.address}`)

  // Step 2: show USDC balance so the user knows if funding is needed
  const balance = await getUsdcBalance(signer.address)
  console.log(`     USDC balance: ${balance}`)

  if (balance === "0.0 USDC") {
    console.error("\n  ⚠  Wallet has 0 USDC. Fund it before running this test.")
    console.error(`     Send USDC (Base mainnet) to: ${signer.address}\n`)
    process.exit(1)
  }

  // Step 3: build the x402 client with the user signer
  console.log("\n  2️⃣  Building payment client…")
  const fetchFn = await buildFetchWithPayment(signer)

  // Step 4: make the paid request
  console.log("  3️⃣  Sending request (auto-pays if 402 received)…\n")
  const result = await fetchFn(TARGET)

  if (result.success) {
    console.log("✅ Payment accepted — protected content received:")
    console.log(JSON.stringify(result.result, null, 2))
    if (result.cost !== undefined) {
      console.log(`\n💸 Cost paid: ${result.cost} micro-USDC ($${(result.cost / 1_000_000).toFixed(6)} USDC)`)
    }

    // Step 5: show updated balance
    const newBalance = await getUsdcBalance(signer.address)
    console.log(`💰 Remaining balance: ${newBalance}`)
  } else {
    console.error("❌ Request failed:")
    if (result.error) console.error("  error:", result.error)
    if (result.result !== undefined) {
      console.error("  response body:", JSON.stringify(result.result, null, 2))
    }
    console.error("\n  Check the server logs for [CDP ←] lines to see the facilitator rejection reason.")
  }
}

main().catch((err) => {
  process.stderr.write(`\nFatal: ${err.message}\n`)
  process.exit(1)
})
