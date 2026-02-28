import type { BotOrchestratorResult } from "../types.js";
import { formatBalance } from "../services/balance.js";

/**
 * Escapes special characters for Telegram MarkdownV2.
 * All these characters MUST be escaped: _ * [ ] ( ) ~ ` > # + - = | { } . ! \
 */
function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export function formatResult(
  result: BotOrchestratorResult,
  userId: string,
  elapsedSeconds: string,
): string {
  if (!result.success) {
    return escapeMarkdownV2(
      result.error || "Something went wrong. Try a different question?",
    );
  }

  // Truncate long answers to stay under Telegram's 4096 char limit
  let answer = result.answer;
  if (answer.length > 4000) {
    answer =
      answer.slice(0, 4000) +
      "...\n\n[Answer truncated — too long for one message]";
  }

  const escapedAnswer = escapeMarkdownV2(answer);
  const cost = escapeMarkdownV2(`$${result.totalCostUsd.toFixed(3)}`);
  const balance = escapeMarkdownV2(formatBalance(userId));
  const time = escapeMarkdownV2(`${elapsedSeconds}s`);

  return [
    escapedAnswer,
    "",
    `💰 Cost: ${cost} · Balance: ${balance} · ⏱ ${time}`,
  ].join("\n");
}
