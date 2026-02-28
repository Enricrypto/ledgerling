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
import { handleHappyPath, executeHappyPath } from "./bot/handlers/happyPath.js";
import { getBalance, formatBalance, deduct } from "./bot/services/balance.js";
import { sessions } from "./bot/services/sessions.js";
import { pendingPrompts } from "./bot/services/prompts.js";
import { runOrchestrator } from "./bot/services/orchestrator.js";
import { buildProgressMessage } from "./bot/ui/progress.js";
import { formatResult } from "./bot/ui/formatter.js";
import { HELP_MESSAGE, NON_TEXT_MESSAGE } from "./bot/ui/messages.js";
import type { OrchestratorRequest, StepUpdate } from "./bot/types.js";
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

bot.command("happy_path", handleHappyPath);

// ── Callback queries (inline buttons) ────────────────────────────────────────

bot.callbackQuery(/^receipt:/, handleReceiptCallback);

bot.callbackQuery(/^(confirm_happy|cancel_happy):/, async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [action, userId] = data.split(":");

  if (action === "cancel_happy") {
    await ctx.answerCallbackQuery({ text: "Cancelled" });
    const session = sessions.get(userId);
    if (session) {
      session.pendingHappyPath = undefined;
      sessions.set(userId, session);
    }
    await ctx.editMessageText("❌ Demo cancelled. No charges incurred.");
    return;
  }

  // Execute happy path
  await executeHappyPath(ctx, userId);
});

bot.callbackQuery(/^approve_report:/, async (ctx) => {
  await ctx.answerCallbackQuery();

  const userId = ctx.callbackQuery?.data?.split(":")[1];
  if (!userId) return;

  const session = sessions.get(userId);
  if (!session?.pendingReport) {
    await ctx.reply("No pending report found.");
    return;
  }

  // Simulate processing with typing action and delay
  await ctx.replyWithChatAction("typing");
  const processingMsg = await ctx.reply("Processing payment...");

  await new Promise((r) => setTimeout(r, 1500));

  // Delete processing message
  try {
    await ctx.api.deleteMessage(
      processingMsg.chat.id,
      processingMsg.message_id,
    );
  } catch {
    /* ignore */
  }

  // Deliver the report
  await ctx.reply(session.pendingReport);

  // Clear pending report
  session.pendingReport = undefined;
  sessions.set(userId, session);
});

bot.callbackQuery(/^(confirm_payment|cancel_payment):/, async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [action, userId] = data.split(":");

  if (action === "cancel_payment") {
    await ctx.answerCallbackQuery({ text: "Cancelled" });
    const session = sessions.get(userId);
    if (session) {
      session.pendingPlan = undefined;
      sessions.set(userId, session);
    }
    await ctx.editMessageText("❌ Payment cancelled. No charges incurred.");
    return;
  }

  // Confirm payment flow
  const session = sessions.get(userId);
  if (!session?.pendingPlan) {
    await ctx.answerCallbackQuery({
      text: "Session expired. Please try again.",
    });
    await ctx.editMessageText(
      "⚠️ Session expired. Please try your query again.",
    );
    return;
  }

  // Check timeout (5 minutes)
  const TIMEOUT_MS = 5 * 60 * 1000;
  if (Date.now() - session.pendingPlan.timestamp > TIMEOUT_MS) {
    await ctx.answerCallbackQuery({ text: "Confirmation expired" });
    session.pendingPlan = undefined;
    sessions.set(userId, session);
    await ctx.editMessageText(
      "⏱️ Confirmation expired. Please try your query again.",
    );
    return;
  }

  // Check balance
  const balance = getBalance(userId);
  if (balance < session.pendingPlan.estimatedCost) {
    await ctx.answerCallbackQuery({ text: "Insufficient balance" });
    await ctx.editMessageText(
      `⚠️ Insufficient balance. You have ${formatBalance(userId)} but need ~$${session.pendingPlan.estimatedCost.toFixed(4)}.`,
    );
    session.pendingPlan = undefined;
    sessions.set(userId, session);
    return;
  }

  await ctx.answerCallbackQuery({ text: "Processing..." });

  // Extract data from pending plan
  const { query, chatId, messageId } = session.pendingPlan;
  const classification = session.pendingPlan.classification;

  // Update message to show execution in progress
  await ctx.api.editMessageText(chatId, messageId, "⏳ Executing...");

  // Collect steps for real-time updates
  const steps: StepUpdate[] = [];
  let lastEditTime = 0;
  const EDIT_DEBOUNCE_MS = 400;

  const onStep = async (step: StepUpdate): Promise<void> => {
    steps[step.stepIndex] = step;

    // Debounce edits to avoid Telegram rate limits
    const now = Date.now();
    if (now - lastEditTime < EDIT_DEBOUNCE_MS) return;
    lastEditTime = now;

    try {
      const text = buildProgressMessage(steps);
      await ctx.api.editMessageText(chatId, messageId, text);
    } catch (e) {
      // Silently ignore edit failures
    }
  };

  // Run orchestrator
  const startTime = Date.now();
  const request: OrchestratorRequest = {
    query,
    userId,
    maxBudget: Math.min(balance, config.MAX_BUDGET_PER_QUERY),
  };

  try {
    const result = await runOrchestrator(request, onStep);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Final progress update
    if (result.success) {
      try {
        const finalProgress = buildProgressMessage(steps, true);
        await ctx.api.editMessageText(chatId, messageId, finalProgress);
      } catch (e) {
        // Ignore
      }
    } else {
      // On failure, delete progress message
      try {
        await ctx.api.deleteMessage(chatId, messageId);
      } catch (e) {
        // Ignore
      }
    }

    // Deduct cost
    if (result.success) {
      deduct(userId, result.totalCostUsd);
    }

    // Update session
    session.lastQuery = query;
    session.lastResult = result;
    session.lastSteps = steps;
    session.queryCount++;
    session.pendingPlan = undefined; // Clear pending plan
    sessions.set(userId, session);

    // Send result as NEW message
    const resultText = formatResult(result, userId, elapsed);
    await ctx.reply(resultText, {
      parse_mode: "MarkdownV2",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📋 View receipt", callback_data: `receipt:${userId}` }],
        ],
      },
    });
  } catch (error) {
    // Clear pending plan on error
    session.pendingPlan = undefined;
    sessions.set(userId, session);

    await ctx.reply("❌ An error occurred during execution. Please try again.");
  }
});

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

// Openfort demo trigger
bot.hears(/openfort/i, handleHappyPath);

bot.on("message:text", handleQuery);

// ── Non-text messages ────────────────────────────────────────────────────────

bot.on("message", async (ctx) => {
  await ctx.reply(NON_TEXT_MESSAGE);
});

// ── Error handling — NEVER crash ─────────────────────────────────────────────

bot.catch((err) => {
  console.error("[Bot Error]", err.error ?? err);
});

// ── Start bot ────────────────────────────────────────────────────────────────

bot.start();
