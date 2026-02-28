/**
 * Telegram bot types — contract between bot UI and Ledgerling engine adapter.
 *
 * Note: These types differ from the engine's OrchestratorResult to avoid naming
 * collisions and provide bot-specific fields (answer, txHash, etc.).
 */

export interface OrchestratorRequest {
  query: string;
  userId: string;
  maxBudget: number;
}

export interface StepUpdate {
  stepIndex: number;
  totalSteps: number;
  status: "pending" | "paying" | "done" | "error";
  service: string;
  action: string;
  costUsd: number;
  txHash?: string;
  error?: string;
}

export interface BotOrchestratorResult {
  success: boolean;
  answer: string;
  totalCostUsd: number;
  steps: StepUpdate[];
  error?: string;
}

export type RunOrchestrator = (
  request: OrchestratorRequest,
  onStep: (step: StepUpdate) => void,
) => Promise<BotOrchestratorResult>;

export interface UserSession {
  userId: string;
  lastQuery?: string;
  lastResult?: BotOrchestratorResult;
  lastSteps?: StepUpdate[];
  pendingReport?: string;
  queryCount: number;
  pendingPlan?: {
    query: string;
    steps: any[];
    classification: any;
    estimatedCost: number;
    messageId: number;
    chatId: number;
    timestamp: number;
  };
  pendingHappyPath?: {
    messageId: number;
    chatId: number;
    timestamp: number;
  };
}
