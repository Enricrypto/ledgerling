/**
 * Minimal file-based wallet store.
 *
 * Persists user → Openfort wallet mappings to wallets.json in the project root.
 * Swap this out for a real DB (Postgres, SQLite, etc.) when you go to production.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const DB_PATH = join(process.cwd(), "wallets.json")

interface WalletRecord {
  address: string
  createdAt: number
}

type Store = Record<string, WalletRecord>

function load(): Store {
  if (!existsSync(DB_PATH)) return {}
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as Store
}

function persist(store: Store): void {
  writeFileSync(DB_PATH, JSON.stringify(store, null, 2))
}

/** Returns the stored wallet record for a user, or undefined if none exists. */
export function findWallet(userId: string): WalletRecord | undefined {
  return load()[userId]
}

/**
 * Persists a wallet record for a user.
 * Idempotent — does nothing if the user already has a wallet stored.
 */
export function saveWallet(userId: string, address: string): void {
  const store = load()
  if (!store[userId]) {
    store[userId] = { address, createdAt: Date.now() }
    persist(store)
  }
}

/** Returns all stored user → wallet entries. */
export function listWallets(): Array<{ userId: string; address: string; createdAt: number }> {
  const store = load()
  return Object.entries(store).map(([userId, rec]) => ({ userId, ...rec }))
}
