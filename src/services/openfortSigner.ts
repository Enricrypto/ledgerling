import Openfort from "@openfort/openfort-node"

/** Minimal shape that fetchWithPayment needs from any signer */
export interface EvmSignerLike {
  address: `0x${string}`
  signTypedData(args: {
    domain: Record<string, unknown>
    types: Record<string, unknown>
    primaryType: string
    message: Record<string, unknown>
  }): Promise<`0x${string}`>
}

// idempotencyKey ties the "create" call to this string so concurrent cold
// starts never spin up duplicate wallets.
const IDEMPOTENCY_KEY = "ledgerling-demo-wallet"

/**
 * Returns an OpenFort TEE backend wallet as a minimal signer compatible
 * with x402's ClientEvmSigner interface.
 *
 * On first call: creates the wallet in OpenFort.
 * On subsequent calls: reuses the first existing backend wallet.
 *
 * Production swap: replace the list/create logic with a per-user wallet
 * retrieved via openfort.accounts.evm.embedded.getByUserId(userId).
 */
export async function createOpenfortSigner(): Promise<EvmSignerLike> {
  const openfort = new Openfort(process.env.OPENFORT_SECRET_KEY!)

  // Reuse the first existing backend wallet, or create one if none exist yet.
  const { accounts } = await openfort.accounts.evm.backend.list()
  const wallet = accounts[0] ?? (await openfort.accounts.evm.backend.create({
    idempotencyKey: IDEMPOTENCY_KEY,
  }))

  return {
    address: wallet.address,
    // OpenFort's signTypedData uses the same viem TypedDataDefinition shape;
    // we cast the input to satisfy both TypeScript sides.
    signTypedData: (args) => wallet.signTypedData(args as any),
  }
}
