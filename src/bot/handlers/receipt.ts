import type { Context } from "grammy";
import { sessions } from "../services/sessions.js";
import { config } from "../config.js";

export async function handleReceiptCallback(ctx: Context): Promise<void> {
  await ctx.answerCallbackQuery(); // Acknowledge button press

  const userId = ctx.callbackQuery?.data?.split(":")[1];
  if (!userId) return;

  const session = sessions.get(userId);
  if (!session?.lastSteps) {
    await ctx.reply("No recent receipt found.");
    return;
  }

  const lines = ["🧾 Receipt", ""];

  let total = 0;
  for (const step of session.lastSteps) {
    if (!step || step.status === "error") continue;

    lines.push(`${step.service} — ${step.action}`);
    lines.push(`  Cost: $${step.costUsd.toFixed(3)}`);

    if (step.txHash) {
      const link = `${config.BASESCAN_URL}${step.txHash}`;
      lines.push(`  Tx: ${link}`);
    }
    lines.push("");

    total += step.costUsd;
  }

  lines.push(`Total: $${total.toFixed(3)}`);
  lines.push("━━━━━━━━━━━━━━━");
  lines.push("Settled on Base L2 via x402 protocol");

  // Send as plain text (no MarkdownV2 to avoid escaping links)
  await ctx.reply(lines.join("\n"));
}
