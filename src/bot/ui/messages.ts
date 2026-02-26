/**
 * All user-facing message templates.
 *
 * Critical: NO blockchain/crypto/wallet/USDC terminology.
 * Users must never know they're using blockchain.
 */

export const WELCOME_MESSAGE = `👋 Hi! I'm AlmaBot.

I search the web, analyze data, and compile results using micro-paid APIs — faster and more focused than a regular search.

You have $1.00 in free credits to try.

Just type what you want to know:
• "What's happening with AI regulation in Europe?"
• "Morning market briefing"
• "Summarize https://example.com/article"

Each query costs $0.01–$0.05 depending on complexity.`;

export const HELP_MESSAGE = `🤖 AlmaBot Help

I can help you with:
• Research & web scraping
• Market & news intelligence
• Crypto & DeFi analytics
• AI tasks (image generation, transcription)
• Security scanning & compliance
• Content storage & retrieval

Just ask me anything in plain language!

Commands:
/start — See welcome message
/balance — Check remaining credits
/help — Show this message`;

export const OUT_OF_CREDITS_MESSAGE = `💰 You're out of credits! This was a demo — thanks for trying AlmaBot.`;

export const STILL_WORKING_MESSAGE = `⏳ Still working on your last request...`;

export const ERROR_MESSAGE = `Something went wrong on my end. Try again, or try a simpler question?`;

export const NON_TEXT_MESSAGE = `I can only process text messages right now. Type your question!`;

export function queryCountMessage(count: number): string {
  if (count === 1) return "This was your first query!";
  if (count === 5) return "That's 5 queries — you're getting the hang of it!";
  if (count === 10) return "10 queries! You're a power user 🚀";
  return "";
}
