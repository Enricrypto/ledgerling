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
import { pendingPrompts } from "./bot/services/prompts.js";
import { HELP_MESSAGE, NON_TEXT_MESSAGE } from "./bot/ui/messages.js";
import {
  getBotCategories,
  getServicesForBotCategory,
  formatServicesForBot,
  findByName,
  escapeMarkdownV2,
} from "./registry/catalog.js";

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

bot.callbackQuery(/^services:/, async (ctx) => {
  const [, answer] = ctx.callbackQuery.data.split(":");
  await ctx.answerCallbackQuery();

  if (answer === "yes") {
    const categories = getBotCategories();
    const buttons = categories.map((cat) => [
      { text: cat, callback_data: `category:${cat}` },
    ]);

    await ctx.reply("Choose a category:", {
      reply_markup: { inline_keyboard: buttons },
    });
  } else {
    await ctx.reply("No problem. Just ask whenever you're ready!");
  }
});

bot.callbackQuery(/^category:/, async (ctx) => {
  const categoryName = ctx.callbackQuery.data.replace("category:", "");
  await ctx.answerCallbackQuery();

  const services = getServicesForBotCategory(categoryName);
  const text = `${escapeMarkdownV2(categoryName)}\n\n${formatServicesForBot(services)}`;

  // Build action buttons for services with exampleQuery
  const buttons = services
    .filter((s) => s.exampleQuery)
    .map((s) => [
      {
        text: `${s.icon || "▶️"} ${s.actionLabel || s.name}`,
        callback_data: `try:${s.name}`,
      },
    ]);

  // Add back button
  buttons.push([
    { text: "← Back to categories", callback_data: "services:yes" },
  ]);

  await ctx.reply(text, {
    parse_mode: "MarkdownV2",
    link_preview_options: { is_disabled: true },
    reply_markup: { inline_keyboard: buttons },
  });
});

bot.callbackQuery(/^try:/, async (ctx) => {
  const serviceName = ctx.callbackQuery.data.replace("try:", "");
  await ctx.answerCallbackQuery();

  const service = findByName(serviceName);
  if (!service) return;

  const userId = String(ctx.from?.id);

  // Set pending prompt for this user
  pendingPrompts.set(userId, serviceName);

  // Direct prompt messages per service
  const prompts: Record<string, string> = {
    Imference: "🖼️ Describe the image you want to generate:",
    "dTelecom STT": "🎙️ Send the URL of the audio/video to transcribe:",
    Pinata: "🍍 What content would you like to upload to IPFS?",
    Firecrawl: "🔥 Enter the URL to scrape:",
    Minifetch: "📄 Enter the URL to fetch:",
  };

  const promptMessage =
    prompts[serviceName] ||
    `${service.icon} What would you like to do with ${service.name}?`;
  await ctx.reply(promptMessage);
});

// ── Text messages → orchestrator ─────────────────────────────────────────────

bot.on("message:text", handleQuery);

// ── Non-text messages ────────────────────────────────────────────────────────

bot.on("message", async (ctx) => {
  await ctx.reply(NON_TEXT_MESSAGE);
});

// ── Error handling — NEVER crash ─────────────────────────────────────────────

bot.catch(() => {});

// ── Start bot ────────────────────────────────────────────────────────────────

bot.start();
