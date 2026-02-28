import type { Context } from "grammy";
import { getBalance, deduct, formatBalance } from "../services/balance.js";
import { sessions } from "../services/sessions.js";
import type { StepUpdate } from "../types.js";
import { config } from "../config.js";

// ============================================================================
// Configuration
// ============================================================================

interface HappyPathStep {
  name: string;
  emoji: string;
  description: string;
  cost: number;
  txHash: string;
}

const HAPPY_PATH_STEPS: HappyPathStep[] = [
  {
    name: "Company Financials API",
    emoji: "💼",
    description: "Checking company financials",
    cost: 0.005,
    txHash: "0xabc1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab",
  },
  {
    name: "News Intelligence API",
    emoji: "📰",
    description: "Scanning recent news & launches",
    cost: 0.003,
    txHash:
      "0xdef4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
  {
    name: "Team & Culture Analysis API",
    emoji: "👥",
    description: "Analyzing team & culture signals",
    cost: 0.005,
    txHash: "0x4567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12",
  },
  {
    name: "Funding & Runway API",
    emoji: "⚖️",
    description: "Checking funding runway & stability",
    cost: 0.003,
    txHash:
      "0x7890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456",
  },
  {
    name: "LLM Report Composer",
    emoji: "🧠",
    description: "Composing your report",
    cost: 0.008,
    txHash:
      "0xfff9999999abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  },
];

const TOTAL_COST = HAPPY_PATH_STEPS.reduce((sum, s) => sum + s.cost, 0);
const MIN_BALANCE = 0.05;
const STEP_DELAY_MS = 1200;
const EDIT_DEBOUNCE_MS = 300;

// ============================================================================
// The Openfort Intelligence Report (curated content)
// ============================================================================

const OPENFORT_REPORT = `📋 Pre-Offer Intelligence Report: Openfort

🏢 Company Overview
Barcelona-based Web3 infrastructure startup founded in 2022.
Building embedded wallet and stablecoin payment infrastructure for AI agents and gaming. Open-source, developer-first approach.

💰 Financial Health
Raised $3M seed round (May 2023) co-led by Gumi Cryptos Capital and Maven 11, with participation from Game7, NGC Ventures, and Newman Capital. Lean team, capital-efficient. No signs of distress — actively shipping product (5 launches in Launch Week 04).

📰 Recent Momentum (Last 90 Days)
• Feb 2026: Deployed account abstraction on Soneium (Sony's L2)
• Aug 2025: Launched Swift SDK for native iOS + public React SDK
• 2025: Added native passkey support for biometric login
• Positioned as infrastructure layer for x402 payment protocol
• Part of x402 Foundation alongside Coinbase, Google, Visa, AWS

👥 Team & Culture Signals
Small, technical team in Barcelona. Open-source ethos — code is public on GitHub. Strong developer community engagement. Conference presence in Web3 gaming and payments space.

⚡ Risk Assessment
🟢 LOW RISK

Strengths:
- Real product shipping to production (not vaporware)
- Strong investor backing (Gumi Cryptos, Maven 11)
- Strategic position: wallet infra is picks-and-shovels play
- Sony/Soneium integration signals enterprise traction
- x402 ecosystem growing fast (130+ projects)

Watch:
- Seed-stage = early (no Series A announced yet)
- Web3 market cyclical — tied to crypto sentiment
- Small team means high individual impact but also high bus factor

💡 Verdict: TAKE IT — if you believe in the x402/stablecoin thesis. Openfort is positioned at the infrastructure layer of a rapidly growing ecosystem. Early employee at a capital-efficient startup with enterprise partnerships (Sony) and protocol-level adoption (Coinbase x402). Negotiate equity aggressively.`;

// ============================================================================
// Progress UI
// ============================================================================

type StepStatus = "pending" | "active" | "done";

interface StepState {
  status: StepStatus;
}

function buildProgressMessage(
  steps: HappyPathStep[],
  states: StepState[],
  showComplete: boolean = false,
): string {
  const lines: string[] = [];

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const state = states[i];

    let line: string;
    switch (state.status) {
      case "pending":
        line = `${step.emoji} ${step.description}...`;
        break;
      case "active":
        line = `${step.emoji} ${step.description}...`;
        break;
      case "done":
        line = `${step.emoji} ${step.description}... $${step.cost.toFixed(3)}`;
        break;
    }
    lines.push(line);
  }

  if (showComplete) {
    lines.push("");
    lines.push(
      `✅ Done — ${steps.length} services, $${TOTAL_COST.toFixed(3)} total`,
    );
  }

  return lines.join("\n");
}

// ============================================================================
// Main Handler
// ============================================================================

export async function handleHappyPath(ctx: Context): Promise<void> {
  const userId = String(ctx.from?.id);

  // Check balance
  const balance = getBalance(userId);
  if (balance < MIN_BALANCE) {
    await ctx.reply(
      `Need at least $${MIN_BALANCE.toFixed(2)} credits to run the demo. You have ${formatBalance(userId)}.\n\nUse /balance to check your credits.`,
    );
    return;
  }

  // Show receipt upfront with confirmation
  const receiptLines = ["🧾 **Confirm Purchase**", ""];

  for (let i = 0; i < HAPPY_PATH_STEPS.length; i++) {
    const step = HAPPY_PATH_STEPS[i];
    receiptLines.push(`${step.emoji} ${step.name} — $${step.cost.toFixed(2)}`);
  }

  receiptLines.push("");
  receiptLines.push("━━━━━━━━━━━━━━━━━");
  receiptLines.push(`**Total: $${TOTAL_COST.toFixed(2)}**`);

  const receiptMsg = await ctx.reply(receiptLines.join("\n"), {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Accept", callback_data: `confirm_happy:${userId}` },
          { text: "❌ Decline", callback_data: `cancel_happy:${userId}` },
        ],
      ],
    },
  });

  // Store pending state
  const session = sessions.get(userId) ?? { userId, queryCount: 0 };
  session.pendingHappyPath = {
    messageId: receiptMsg.message_id,
    chatId: receiptMsg.chat.id,
    timestamp: Date.now(),
  };
  sessions.set(userId, session);
}

// ============================================================================
// Execution Handler (called from callback)
// ============================================================================

export async function executeHappyPath(
  ctx: Context,
  userId: string,
): Promise<void> {
  const session = sessions.get(userId);
  if (!session?.pendingHappyPath) {
    await ctx.answerCallbackQuery({ text: "Session expired" });
    return;
  }

  const { chatId, messageId } = session.pendingHappyPath;

  // Clear pending state
  session.pendingHappyPath = undefined;
  sessions.set(userId, session);

  await ctx.answerCallbackQuery({ text: "Processing..." });

  // Update message to show execution started
  try {
    await ctx.api.editMessageText(chatId, messageId, "⏳ Executing...");
  } catch {
    /* ignore */
  }

  // Phase 2: Initialize progress
  const states: StepState[] = HAPPY_PATH_STEPS.map(() => ({
    status: "pending",
  }));

  try {
    await ctx.api.editMessageText(
      chatId,
      messageId,
      buildProgressMessage(HAPPY_PATH_STEPS, states),
    );
  } catch {
    /* ignore */
  }

  let lastEditTime = 0;
  const updateProgress = async (showComplete: boolean = false) => {
    const now = Date.now();
    if (now - lastEditTime < EDIT_DEBOUNCE_MS) return;
    lastEditTime = now;
    try {
      await ctx.api.editMessageText(
        chatId,
        messageId,
        buildProgressMessage(HAPPY_PATH_STEPS, states, showComplete),
      );
    } catch {
      /* ignore edit failures */
    }
  };

  // Phase 3: Execute steps with simulated delays
  const stepUpdates: StepUpdate[] = [];

  for (let i = 0; i < HAPPY_PATH_STEPS.length; i++) {
    const step = HAPPY_PATH_STEPS[i];

    states[i].status = "active";
    await updateProgress();

    // Simulate API call
    await new Promise((r) => setTimeout(r, STEP_DELAY_MS));

    states[i].status = "done";
    await updateProgress();

    stepUpdates.push({
      stepIndex: i,
      totalSteps: HAPPY_PATH_STEPS.length,
      status: "done",
      service: step.name,
      action: step.description,
      costUsd: step.cost,
      txHash: step.txHash,
    });
  }

  // Phase 4: Final progress update
  await updateProgress(true);

  // Deduct from balance
  deduct(userId, TOTAL_COST);

  // Build the final report
  const reportMessage = `${OPENFORT_REPORT}`;

  // Store session for receipt + pending report
  session.lastSteps = stepUpdates;
  session.pendingReport = reportMessage;
  sessions.set(userId, session);

  // Phase 5: Show receipt with approval button
  const receiptLines = ["🧾 **Receipt**", ""];

  for (let i = 0; i < stepUpdates.length; i++) {
    const step = stepUpdates[i];
    const stepConfig = HAPPY_PATH_STEPS[i];
    const txUrl = `${config.BASESCAN_URL}${step.txHash}`;
    receiptLines.push(
      `${stepConfig.emoji} [${step.service}](${txUrl}) — $${step.costUsd.toFixed(2)}`,
    );
  }

  receiptLines.push("");
  receiptLines.push("━━━━━━━━━━━━━━━━━");
  receiptLines.push(`**Total: $${TOTAL_COST.toFixed(2)}**`);

  await ctx.reply(receiptLines.join("\n"), {
    parse_mode: "Markdown",
    link_preview_options: { is_disabled: true },
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "📋 View Report",
            callback_data: `approve_report:${userId}`,
          },
        ],
      ],
    },
  });
}
