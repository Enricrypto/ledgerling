/**
 * Per-user Openfort backend wallet signer.
 *
 * Each user gets their own Openfort backend wallet, identified by a userId string.
 * The wallet address is persisted in wallets.json (src/server/db.ts).
 *
 * On first call for a userId: creates a new backend wallet (idempotent via
 * idempotencyKey) and saves the address.
 * On subsequent calls: looks up the address and returns the matching wallet
 * from Openfort's backend wallet list.
 *
 * To use this signer with x402 payments, pass it to buildFetchWithPayment()
 * instead of the system signer:
 *
 *   const signer = await getOrCreateUserSigner(userId)
 *   const fetchFn = await buildFetchWithPayment(signer)
 */

import Openfort from "@openfort/openfort-node"
import type { EvmSignerLike } from "./openfortSigner.js"
import { findWallet, saveWallet } from "../server/db.js"

function openfortClient(): Openfort {
  if (!process.env.OPENFORT_SECRET_KEY) {
    throw new Error("Missing env var: OPENFORT_SECRET_KEY")
  }
  return new Openfort(process.env.OPENFORT_SECRET_KEY)
}

/**
 * Returns an EvmSignerLike for the given user, creating an Openfort backend
 * wallet if one does not already exist.
 */
export async function getOrCreateUserSigner(userId: string): Promise<EvmSignerLike> {
  const openfort = openfortClient()
  const existing = findWallet(userId)

  if (!existing) {
    // First time — create a fresh backend wallet for this user.
    const wallet = await openfort.accounts.evm.backend.create({
      idempotencyKey: `ledgerling-user-${userId}`,
    })
    saveWallet(userId, wallet.address)
    return {
      address: wallet.address as `0x${string}`,
      signTypedData: (args) => wallet.signTypedData(args as any),
    }
  }

  // Wallet exists — retrieve it from Openfort and return a signer.
  const { accounts } = await openfort.accounts.evm.backend.list()
  const wallet = accounts.find((a) => a.address === existing.address)
  if (!wallet) {
    throw new Error(
      `Wallet ${existing.address} (user: ${userId}) not found in Openfort. ` +
        `Has the wallet been deleted from the dashboard?`
    )
  }
  return {
    address: wallet.address as `0x${string}`,
    signTypedData: (args) => wallet.signTypedData(args as any),
  }
}

/**
 * Returns the stored wallet address for a user without making any Openfort
 * API calls. Returns undefined if the user has no wallet yet.
 */
export function getUserWalletAddress(userId: string): string | undefined {
  return findWallet(userId)?.address
}
