/**
 * Express app entry point for the Openfort + x402 paywall server.
 *
 * Responsibilities:
 *   - Wires up the x402 paymentMiddleware for GET /api/protected-content
 *   - Mounts the route handlers from routes.ts
 *   - Starts the HTTP listener
 *
 * Required environment variables (.env):
 *
 *   # Openfort (see routes.ts for its env vars)
 *   OPENFORT_SECRET_KEY
 *   OPENFORT_SHIELD_API_KEY
 *   OPENFORT_SHIELD_SECRET_KEY
 *
 *   # x402 payment gate
 *   PAY_TO_ADDRESS      – Wallet address that receives payments  (e.g. 0xYour...)
 *   X402_NETWORK        – CAIP-2 network ID                     (e.g. eip155:8453)
 *   X402_MAX_AMOUNT     – Payment amount in USD                  (e.g. 0.10)
 *   X402_TIMEOUT        – Max seconds a signed payment is valid  (e.g. 60)
 *   X402_ASSET_ADDRESS  – (informational) ERC-20 token address   (e.g. 0xUSDC...)
 *   X402_ASSET_NAME     – (informational) Token ticker           (e.g. USDC)
 *
 *   # Coinbase Developer Platform – used to authenticate against the CDP facilitator
 *   COINBASE_API_KEY_ID  – CDP API key ID (from https://portal.cdp.coinbase.com)
 *   COINBASE_SECRET_KEY  – CDP API key secret (EC PEM or base64 Ed25519)
 *
 *   # Optional overrides
 *   PORT – Server port (defaults to 3000)
 *
 * Run:
 *   npx tsx src/server/app.ts
 */

import "dotenv/config"

import express from "express"
import {
  paymentMiddleware,
  x402ResourceServer,
  type Network
} from "@x402/express"
import { ExactEvmScheme } from "@x402/evm/exact/server"
import { HTTPFacilitatorClient } from "@x402/core/server"
import { generateJwt } from "@coinbase/cdp-sdk/auth"
import { router } from "./routes.js"

// ---------------------------------------------------------------------------
// Validate required env vars at startup
// ---------------------------------------------------------------------------
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS
const X402_NETWORK = process.env.X402_NETWORK
const X402_MAX_AMOUNT = process.env.X402_MAX_AMOUNT
const X402_TIMEOUT = process.env.X402_TIMEOUT ?? "60"
const COINBASE_API_KEY_ID = process.env.COINBASE_API_KEY_ID
const COINBASE_SECRET_KEY = process.env.COINBASE_SECRET_KEY
const PORT = Number(process.env.PORT ?? "3000")

if (!PAY_TO_ADDRESS) throw new Error("Missing env var: PAY_TO_ADDRESS")
if (!X402_NETWORK)
  throw new Error("Missing env var: X402_NETWORK (e.g. eip155:8453)")
if (!X402_MAX_AMOUNT)
  throw new Error("Missing env var: X402_MAX_AMOUNT (e.g. 0.10)")
if (!COINBASE_API_KEY_ID)
  throw new Error("Missing env var: COINBASE_API_KEY_ID")
if (!COINBASE_SECRET_KEY)
  throw new Error("Missing env var: COINBASE_SECRET_KEY")

// ---------------------------------------------------------------------------
// Step 1: Create the CDP facilitator client for Base mainnet.
//
// The Coinbase Developer Platform (CDP) facilitator verifies and settles
// on-chain payments. It supports the "exact" scheme on eip155:8453.
//
// CDP facilitator endpoint: https://api.cdp.coinbase.com/platform/v2/x402
//
// Every request to the facilitator must carry a short-lived Bearer JWT signed
// with your CDP API key. The createAuthHeaders callback is called before each
// request and generates a fresh token (2-minute TTL) for the specific HTTP
// method + path of the request being made.
// ---------------------------------------------------------------------------

/** Base URL of the CDP x402 facilitator. */
const CDP_FACILITATOR_HOST = "api.cdp.coinbase.com"
const CDP_FACILITATOR_BASE = "/platform/v2/x402"
const CDP_FACILITATOR_URL = `https://${CDP_FACILITATOR_HOST}${CDP_FACILITATOR_BASE}`

/**
 * Generates a CDP Bearer JWT scoped to a specific facilitator endpoint.
 * The `uris` claim in the JWT locks the token to exactly one method + path,
 * so a stolen token cannot be replayed against a different endpoint.
 */
async function cdpAuthHeader(
  method: string,
  path: string
): Promise<Record<string, string>> {
  const token = await generateJwt({
    apiKeyId: COINBASE_API_KEY_ID!,
    apiKeySecret: COINBASE_SECRET_KEY!,
    requestMethod: method,
    requestHost: CDP_FACILITATOR_HOST,
    requestPath: `${CDP_FACILITATOR_BASE}${path}`
  })
  return { Authorization: `Bearer ${token}` }
}

const facilitator = new HTTPFacilitatorClient({
  url: CDP_FACILITATOR_URL,
  // createAuthHeaders is called before every request to the facilitator.
  // Each of the three facilitator endpoints gets its own scoped JWT.
  createAuthHeaders: async () => ({
    verify: await cdpAuthHeader("POST", "/verify"),
    settle: await cdpAuthHeader("POST", "/settle"),
    supported: await cdpAuthHeader("GET", "/supported")
  })
})

// ---------------------------------------------------------------------------
// Step 2: Create the resource server and register the EVM "exact" payment scheme.
//
// The "exact" scheme requires the client to sign an on-chain transfer for
// the precise amount specified — no rounding, no estimations.
//
// .register(network, scheme) maps a CAIP-2 network ID to a payment scheme.
// You can call .register() multiple times to support several networks.
// ---------------------------------------------------------------------------
const resourceServer = new x402ResourceServer(facilitator).register(
  X402_NETWORK as Network,
  new ExactEvmScheme()
)

// ---------------------------------------------------------------------------
// Step 3: Define the protected route configuration.
//
// Routes config key format: "<METHOD> <path>"
//   price            – USD-denominated amount (prefix "$"). The ExactEvmScheme
//                      converts this to the network's default stablecoin (USDC).
//                      Remove the "$" prefix to express amount in raw token units.
//   network          – Must match what was passed to .register() above.
//   payTo            – Address that receives the payment.
//   maxTimeoutSeconds– Maximum age (in seconds) of an accepted signed payment.
//
// Note: X402_ASSET_ADDRESS and X402_ASSET_NAME are informational env vars.
// The actual token used is determined by the ExactEvmScheme + network combo
// (defaults to USDC on Base / Base Sepolia). Register a custom MoneyParser on
// ExactEvmScheme if you need a different token:
//   new ExactEvmScheme().registerMoneyParser(async (amount, network) => { ... })
// ---------------------------------------------------------------------------
const protectedRoutes = {
  "GET /api/protected-content": {
    accepts: [
      {
        scheme: "exact",
        // "$X.XX" = USD-denominated; scheme converts to token units automatically.
        price: `$${X402_MAX_AMOUNT}`,
        network: X402_NETWORK as Network,
        payTo: PAY_TO_ADDRESS,
        maxTimeoutSeconds: Number(X402_TIMEOUT)
      }
    ],
    description: "Access to protected content",
    mimeType: "application/json"
  }
}

// ---------------------------------------------------------------------------
// Build the Express app
// ---------------------------------------------------------------------------
const app = express()

// Parse JSON bodies — required for POST /api/protected-create-encryption-session.
app.use(express.json())

// Step 4: Apply the x402 payment middleware.
//
// For every incoming request the middleware checks whether the path matches a
// protected route (defined above).
//
//   Unpaid request → responds immediately with HTTP 402 Payment Required.
//     The response body contains machine-readable payment requirements
//     (scheme, network, asset, receiver, amount, timeout) that an x402-aware
//     client uses to construct and sign a payment, then retries the request
//     with an X-PAYMENT header.
//
//   Paid request   → verifies the payment on-chain via the facilitator,
//     then calls next() so the route handler in routes.ts runs normally.
//
// Routes NOT listed in protectedRoutes pass through untouched.
app.use(paymentMiddleware(protectedRoutes, resourceServer))

// Step 5: Mount the route handlers (both endpoints defined in routes.ts).
app.use(router)

// ---------------------------------------------------------------------------
// Start listening
// ---------------------------------------------------------------------------
app.listen(PORT)
