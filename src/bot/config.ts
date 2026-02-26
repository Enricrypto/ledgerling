import "dotenv/config";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const config = {
  BOT_TOKEN: requireEnv("BOT_TOKEN"),
  BASESCAN_URL: process.env.BASESCAN_URL ?? "https://sepolia.basescan.org/tx/",
  INITIAL_CREDITS: Number(process.env.INITIAL_CREDITS ?? "1.00"),
  MAX_BUDGET_PER_QUERY: Number(process.env.MAX_BUDGET_PER_QUERY ?? "0.10"),
  BOT_USERNAME: process.env.BOT_USERNAME ?? "AgentTabBot",
};
