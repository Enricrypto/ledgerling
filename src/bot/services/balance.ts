import { config } from "../config.js";

const balances = new Map<string, number>();

export function getBalance(userId: string): number {
  if (!balances.has(userId)) {
    balances.set(userId, config.INITIAL_CREDITS);
  }
  return balances.get(userId)!;
}

export function deduct(userId: string, amount: number): boolean {
  const current = getBalance(userId);
  if (current < amount) return false;
  balances.set(userId, current - amount);
  return true;
}

export function formatBalance(userId: string): string {
  return `$${getBalance(userId).toFixed(3)}`;
}
