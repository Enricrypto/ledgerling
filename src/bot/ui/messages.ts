/**
 * All user-facing message templates.
 *
 * Critical: NO blockchain/crypto/wallet/USDC terminology.
 * Users must never know they're using blockchain.
 */

export function getWelcomeMessage(): string {
  const hour = new Date().getUTCHours();

  let timeOfDay: string;
  if (hour >= 5 && hour < 12) {
    timeOfDay = "this morning";
  } else if (hour >= 12 && hour < 17) {
    timeOfDay = "this afternoon";
  } else if (hour >= 17 && hour < 21) {
    timeOfDay = "this evening";
  } else {
    timeOfDay = "tonight";
  }

  return `Hi, how can I help you ${timeOfDay}?`;
}

export const HELP_MESSAGE = `
I can help you with:
• Research & web scraping
• Market & news intelligence
• Crypto & DeFi analytics
• AI tasks (image generation, transcription)
• Security scanning & compliance
• Content storage & retrieval

Just ask me anything in plain language!

Commands:
/start 
/balance 
/help`;

export const EVALUATING_MESSAGE = "Evaluating...";

export const UNSUPPORTED_REQUEST_MESSAGE =
  "I'm sorry, I don't support this type of request yet. Would you like to see what I can help with?";

export const OUT_OF_CREDITS_MESSAGE = `You're out of credits. Thanks for trying Alma — hope it was helpful!`;

export const STILL_WORKING_MESSAGE = `Still working on your last request...`;

export const ERROR_MESSAGE = `Sorry, something went wrong. Please try again?`;

export const NON_TEXT_MESSAGE = `I can only process text messages right now. Type your question!`;
