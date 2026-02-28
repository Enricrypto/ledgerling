import type { Context } from "grammy";
import { getWelcomeMessage } from "../ui/messages.js";
import { getBalance } from "../services/balance.js";
import { sessions } from "../services/sessions.js";

export async function handleStart(ctx: Context): Promise<void> {
  if (!ctx.from?.id) return;

  const userId = String(ctx.from.id);

  // Initialize balance
  getBalance(userId);

  // Initialize session
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      queryCount: 0,
    });
  }

  await ctx.reply(getWelcomeMessage());
}
