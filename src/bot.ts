#!/usr/bin/env node
/**
 * AlmaBot — Telegram bot for Ledgerling x402 micropayments.
 *
 * Entry point: Grammy bot setup + command/handler registration.
 */

import { Bot, GrammyError, HttpError } from "grammy";
import { config } from "./bot/config.js";
import { handleStart } from "./bot/handlers/start.js";
import { handleQuery } from "./bot/handlers/query.js";
import { handleReceiptCallback } from "./bot/handlers/receipt.js";
import { getBalance, formatBalance } from "./bot/services/balance.js";
import { HELP_MESSAGE, NON_TEXT_MESSAGE } from "./bot/ui/messages.js";

const bot = new Bot(config.BOT_TOKEN);

// ── Commands ─────────────────────────────────────────────────────────────────

bot.command("start", handleStart);

bot.command("balance", async (ctx) => {
  const userId = String(ctx.from?.id);
  const balance = formatBalance(userId);
  await ctx.reply(`💰 You have ${balance} in credits remaining.`);
});

bot.command("help", async (ctx) => {
  await ctx.reply(HELP_MESSAGE);
});

// ── Callback queries (inline buttons) ────────────────────────────────────────

bot.callbackQuery(/^receipt:/, handleReceiptCallback);

// ── Text messages → orchestrator ─────────────────────────────────────────────

bot.on("message:text", handleQuery);

// ── Non-text messages ────────────────────────────────────────────────────────

bot.on("message", async (ctx) => {
  await ctx.reply(NON_TEXT_MESSAGE);
});

// ── Error handling — NEVER crash ─────────────────────────────────────────────

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error handling update ${ctx.update.update_id}:`);
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error("Grammy error:", e.description);
  } else if (e instanceof HttpError) {
    console.error("HTTP error:", e);
  } else {
    console.error("Unknown error:", e);
  }
});

// ── Start bot ────────────────────────────────────────────────────────────────

bot.start();
console.log("🤖 AlmaBot is running");
console.log(`📱 Telegram: t.me/${config.BOT_USERNAME}`);
