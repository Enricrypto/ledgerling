import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"
import type { ClientEvmSigner } from "@x402/evm"
import { createPublicClient, http } from "viem"
import { base, baseSepolia } from "viem/chains"
import { privateKeyToAccount } from "viem/accounts"
import { createOpenfortSigner, type EvmSignerLike } from "./openfortSigner.js"

export interface FetchResult {
  success: boolean
  result?: any   // JSON-decoded body
  cost?: number  // Paid cost in smallest unit (e.g. USDC micro-units)
  receipt?: any  // Payment settlement receipt from response headers
  error?: string
}

/**
 * Builds a ready-to-use fetchWithPayment function.
 *
 * Mode is selected automatically based on which env var is present:
 *   OPENFORT_SECRET_KEY  →  OpenFort TEE backend wallet (demo + production path)
 *   EVM_PRIVATE_KEY      →  Raw private key via viem (quick local testing only)
 *
 * Chain is selected via CHAIN_ID (default: 84532 = Base Sepolia testnet).
 * Override the RPC endpoint with RPC_URL if needed.
 *
 * Call once at server startup and reuse the returned function for all requests.
 */
export async function buildFetchWithPayment() {
  const signerLike = await resolveSigner()
  const clientSigner = buildClientSigner(signerLike)

  const x402 = new x402Client()
  registerExactEvmScheme(x402, { signer: clientSigner })

  const wrappedFetch = wrapFetchWithPayment(fetch, x402)

  return async function fetchWithPayment(
    url: string,
    options: RequestInit = {}
  ): Promise<FetchResult> {
    try {
      const response = await wrappedFetch(url, options)

      const resultBody = await response.json().catch(() => undefined)

      let cost: number | undefined
      let receipt: any | undefined

      if (response.ok) {
        const httpClient = new x402HTTPClient(x402)
        receipt = httpClient.getPaymentSettleResponse((name) =>
          response.headers.get(name)
        )
        if (receipt?.amount) {
          cost = Number(receipt.amount)
        }
      }

      return { success: response.ok, result: resultBody, cost, receipt }
    } catch (err: any) {
      return { success: false, error: err.message ?? "Unknown error" }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveSigner(): Promise<EvmSignerLike> {
  if (process.env.OPENFORT_SECRET_KEY) {
    return createOpenfortSigner()
  }

  if (process.env.EVM_PRIVATE_KEY) {
    const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY as `0x${string}`)
    return {
      address: account.address,
      signTypedData: (args) => account.signTypedData(args as any),
    }
  }

  throw new Error(
    "No signer configured. Set OPENFORT_SECRET_KEY (recommended) " +
    "or EVM_PRIVATE_KEY in your .env file."
  )
}

/**
 * Composes a ClientEvmSigner from a minimal signer + a viem public client.
 * x402 uses readContract internally to verify USDC allowances before paying.
 */
function buildClientSigner(signerLike: EvmSignerLike): ClientEvmSigner {
  const chainId = Number(process.env.CHAIN_ID ?? "84532")
  const chain = chainId === 8453 ? base : baseSepolia
  const rpcUrl = process.env.RPC_URL  // optional — falls back to chain's default public RPC

  const publicClient = createPublicClient({ chain, transport: http(rpcUrl) })

  return {
    address: signerLike.address,
    signTypedData: (msg) => signerLike.signTypedData(msg),
    readContract: (args) => publicClient.readContract(args as any),
  }
}
