#!/usr/bin/env node
/**
 * Simple test script — tests the bot's orchestrator without requiring Telegram.
 *
 * This is useful for:
 * - Quick local testing without BOT_TOKEN
 * - CI/CD pipeline testing
 * - Debugging orchestrator logic
 *
 * Usage:
 *   npm run test:bot
 *   npm run test:bot "What's happening with AI regulation?"
 */

import "dotenv/config";
import { runOrchestrator } from "../bot/services/orchestrator.js";
import type { OrchestratorRequest, StepUpdate } from "../bot/types.js";

const testQuery =
  process.argv[2] || "What's happening with AI regulation in Europe?";
const userId = "test-user-123";
const maxBudget = 0.1;

console.log("\n🧪 Testing Bot Orchestrator (No Telegram Required)\n");
console.log(`Query: "${testQuery}"`);
console.log(`User: ${userId}`);
console.log(`Max Budget: $${maxBudget}`);
console.log("\n" + "─".repeat(60) + "\n");

// Track all step updates
const allSteps: StepUpdate[] = [];

const request: OrchestratorRequest = {
  query: testQuery,
  userId,
  maxBudget,
};

const onStep = (step: StepUpdate) => {
  allSteps[step.stepIndex] = step;

  // Print progress
  const status = {
    pending: "⏳",
    paying: "💳",
    done: "✅",
    error: "❌",
  }[step.status];

  const cost = step.costUsd > 0 ? `$${step.costUsd.toFixed(3)}` : "";
  console.log(
    `${status} [${step.stepIndex + 1}/${step.totalSteps}] ${step.service} — ${step.action} ${cost}`,
  );

  if (step.txHash) {
    console.log(`   Tx: ${step.txHash}`);
  }
  if (step.error) {
    console.log(`   Error: ${step.error}`);
  }
};

async function test() {
  const start = Date.now();

  try {
    const result = await runOrchestrator(request, onStep);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log("\n" + "─".repeat(60));

    if (result.success) {
      console.log("\n✅ SUCCESS");
      console.log(`\nAnswer (${result.answer.length} chars):`);
      console.log("─".repeat(60));

      // Truncate long answers for readability
      const preview =
        result.answer.length > 500
          ? result.answer.slice(0, 500) + "\n\n... (truncated)"
          : result.answer;
      console.log(preview);

      console.log("─".repeat(60));
      console.log(`\nTotal Cost: $${result.totalCostUsd.toFixed(3)}`);
      console.log(`Time: ${elapsed}s`);
      console.log(`Steps: ${result.steps.length}`);
    } else {
      console.log("\n❌ FAILED");
      console.log(`\nError: ${result.error}`);
      console.log(
        `Total Cost: $${result.totalCostUsd.toFixed(3)} (charged before failure)`,
      );
      console.log(`Time: ${elapsed}s`);
    }

    console.log("\n" + "─".repeat(60) + "\n");

    process.exit(result.success ? 0 : 1);
  } catch (err: any) {
    console.error("\n❌ UNEXPECTED ERROR");
    console.error(err);
    process.exit(1);
  }
}

test();
