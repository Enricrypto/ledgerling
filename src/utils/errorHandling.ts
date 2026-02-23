// ---------------------------------------------------------------------------
// Error classification for the Ledgerling orchestration engine
// ---------------------------------------------------------------------------

export type ErrorKind =
  | "TIMEOUT"        // Request timed out — payment status may be ambiguous
  | "NETWORK_ERROR"  // Could not reach the service — no payment was sent
  | "PAYMENT_FAILED" // x402 payment authorization rejected
  | "SERVICE_ERROR"  // Service returned a failure response

/**
 * Maps a raw error string (from FetchResult.error or a caught Error.message)
 * to a structured ErrorKind.
 */
export function classifyError(err: string | undefined): ErrorKind {
  if (!err) return "SERVICE_ERROR"

  const lower = err.toLowerCase()

  if (lower.includes("abort") || lower.includes("timeout") || lower.includes("timed out")) {
    return "TIMEOUT"
  }

  if (
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("econnreset") ||
    lower.includes("network") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed")
  ) {
    return "NETWORK_ERROR"
  }

  if (
    lower.includes("402") ||
    lower.includes("payment") ||
    lower.includes("insufficient") ||
    lower.includes("allowance") ||
    lower.includes("balance")
  ) {
    return "PAYMENT_FAILED"
  }

  return "SERVICE_ERROR"
}

/**
 * Returns a human-facing sentence explaining what happened and whether the
 * user may have been charged.
 */
export function uxMessageForError(kind: ErrorKind, service: string): string {
  switch (kind) {
    case "TIMEOUT":
      return (
        `${service} did not respond in time. ` +
        `If the request timed out before payment was sent, no charge was incurred. ` +
        `If it timed out after payment was submitted, contact support with your receipt.`
      )
    case "NETWORK_ERROR":
      return (
        `Could not connect to ${service}. ` +
        `No payment was sent — check your network and try again.`
      )
    case "PAYMENT_FAILED":
      return (
        `Payment authorization for ${service} failed. ` +
        `No funds were transferred. Ensure your wallet has sufficient USDC and the correct allowance is set.`
      )
    case "SERVICE_ERROR":
      return `${service} returned an error. No further steps were executed.`
  }
}
