import type { StepUpdate } from "../types.js";

export function buildProgressMessage(
  steps: StepUpdate[],
  isFinal: boolean = false,
): string {
  const completed = steps.filter((s) => s?.status === "done").length;
  const total = steps.length;

  if (isFinal) {
    return "Done";
  }

  if (total === 0) return "Working...";
  return `Working... (${completed}/${total})`;
}
