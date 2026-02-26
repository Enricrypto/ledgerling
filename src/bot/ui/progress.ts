import type { StepUpdate } from "../types.js";

const SERVICE_EMOJI: Record<string, string> = {
  Firecrawl: "🔎",
  Minifetch: "🔎",
  BlackSwan: "📰",
  Moltbook: "📰",
  SLAMai_Signals: "💰",
  SLAMai_WalletIntel: "💼",
  AdExAURA_Portfolio: "💼",
  AdExAURA_DefiPositions: "💼",
  DappLooker: "📊",
  Imference: "🎨",
  DaydreamsRouter: "🧠",
  dTelecomSTT: "🎤",
  MerchantGuard_Score: "🛡️",
  MerchantGuard_Scan: "🛡️",
  MerchantGuard_MysteryShop: "🛡️",
  PinataIPFS_Upload: "📦",
  PinataIPFS_Get: "📦",
};

function getEmoji(service: string): string {
  return SERVICE_EMOJI[service] ?? "⚙️";
}

function formatStepLine(step: StepUpdate): string {
  const emoji = getEmoji(step.service);
  const cost = `$${step.costUsd.toFixed(3)}`;

  switch (step.status) {
    case "pending":
      return `${emoji} ${step.action}...`;
    case "paying":
      return `${emoji} ${step.action}... ${cost}`;
    case "done":
      return `${emoji} ${step.action}... ${cost} ✅`;
    case "error":
      return `⚠️ ${step.action}... skipped`;
    default:
      return `${emoji} ${step.action}...`;
  }
}

export function buildProgressMessage(
  steps: StepUpdate[],
  isFinal: boolean = false,
): string {
  const lines = ["🧠 Planning your research... ✅", ""];

  for (const step of steps) {
    if (step) lines.push(formatStepLine(step));
  }

  if (isFinal) {
    lines.push("");
    lines.push("✨ Composing your answer...");
  }

  return lines.join("\n");
}
