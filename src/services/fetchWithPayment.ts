import { wrapFetchWithPayment, x402Client, x402HTTPClient } from "@x402/fetch"
import { registerExactEvmScheme } from "@x402/evm/exact/client"
import type { ClientEvmSigner } from "@x402/evm"
import { createPublicClient, http } from "viem"
import { base, baseSepolia } from "viem/chains"
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { EvmSignerLike } from "./openfortSigner.js"

export interface FetchResult {
  success: boolean
  result?: any   // JSON-decoded body
  cost?: number  // Paid cost in smallest unit (e.g. USDC micro-units)
  receipt?: any  // Payment settlement receipt from response headers
  error?: string
}

/**
 * Builds a ready-to-use fetchWithPayment function for a specific user signer.
 *
 * The caller is responsible for supplying a signer — typically obtained via
 * getOrCreateUserSigner(userId) from services/userSigner.ts.
 *
 * The system wallet (PAY_TO_ADDRESS) is the payment *recipient*, not the payer.
 * Never pass the system signer here.
 *
 * Chain is selected via CHAIN_ID (default: 84532 = Base Sepolia testnet).
 * Override the RPC endpoint with RPC_URL if needed.
 */
export async function buildFetchWithPayment(signer: EvmSignerLike) {
  const clientSigner = buildClientSigner(signer)

  const x402 = new x402Client()
  registerExactEvmScheme(x402, { signer: clientSigner })

  const wrappedFetch = wrapFetchWithPayment(fetch, x402)

  return async function fetchWithPayment(
    url: string,
    options: RequestInit = {}
  ): Promise<FetchResult> {
    try {
      const response = await wrappedFetch(url, options)

      const contentType = response.headers.get("content-type") ?? ""
      const rawText = await response.text().catch(() => "")
      let resultBody: any
      if (contentType.startsWith("image/")) {
        const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : "jpg"
        const filePath = join(tmpdir(), `ledgerling-${Date.now()}.${ext}`)
        const buffer = Buffer.from(rawText, "binary")
        writeFileSync(filePath, buffer)
        resultBody = { _type: "image", filePath, bytes: buffer.length }
      } else {
        try { resultBody = JSON.parse(rawText) } catch { resultBody = rawText || undefined }
      }

      let cost: number | undefined
      let receipt: any | undefined

      if (response.ok) {
        const httpClient = new x402HTTPClient(x402)
        try {
          receipt = httpClient.getPaymentSettleResponse((name) =>
            response.headers.get(name)
          )
          if (receipt?.amount) {
            cost = Number(receipt.amount)
          }
        } catch {
          // Some x402v1 servers don't return a settlement header — payment still succeeded.
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
