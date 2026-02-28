/**
 * Route handlers for the Openfort + x402 paywall server.
 *
 * Endpoints:
 *   POST /api/protected-create-encryption-session
 *   GET  /api/protected-content  (payment gate applied in app.ts)
 *
 * Required environment variables:
 *   OPENFORT_SECRET_KEY        – Openfort server-side API key
 *   OPENFORT_SHIELD_API_KEY    – Shield publishable/API key (shpk_...)
 *                                Tip: use the value of NEXT_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY
 *   OPENFORT_SHIELD_SECRET_KEY – Shield secret key (sk_shield_...)
 */

import { Router, type Request, type Response } from "express"
import Openfort from "@openfort/openfort-node"

// ---------------------------------------------------------------------------
// Validate required env vars at module load time so the server fails fast
// rather than on the first request.
// ---------------------------------------------------------------------------
const OPENFORT_SECRET_KEY = process.env.OPENFORT_SECRET_KEY
const OPENFORT_SHIELD_API_KEY = process.env.OPENFORT_SHIELD_API_KEY
const OPENFORT_SHIELD_SECRET_KEY = process.env.OPENFORT_SHIELD_SECRET_KEY

if (!OPENFORT_SECRET_KEY) throw new Error("Missing env var: OPENFORT_SECRET_KEY")
if (!OPENFORT_SHIELD_SECRET_KEY) throw new Error("Missing env var: OPENFORT_SHIELD_SECRET_KEY")

// Single Openfort client instance, reused across all requests.
const openfort = new Openfort(OPENFORT_SECRET_KEY)

export const router = Router()

// ---------------------------------------------------------------------------
// POST /api/protected-create-encryption-session
// ---------------------------------------------------------------------------
/**
 * Creates an Openfort Shield encryption session for the frontend embedded wallet.
 *
 * Flow:
 *   1. Frontend generates a local encryption share and POSTs it here.
 *   2. Server stores the share in Shield via openfort.createEncryptionSession().
 *   3. Server returns the Shield session ID to the frontend.
 *   4. Frontend passes the session ID to the Openfort embedded wallet SDK
 *      to complete key setup.
 *
 * Request body:  { "encryptionShare": "<base64 or hex string>" }
 * Response body: { "sessionId": "<string>" }
 *
 * Errors:
 *   400 – encryptionShare missing or not a string
 *   500 – OPENFORT_SHIELD_API_KEY not set, or Openfort SDK call failed
 */
router.post(
  "/api/protected-create-encryption-session",
  async (req: Request, res: Response): Promise<void> => {
    // Step 1: Parse the client-supplied encryption share from the request body.
    const { encryptionShare } = req.body as { encryptionShare?: unknown }

    if (typeof encryptionShare !== "string" || encryptionShare.trim() === "") {
      res.status(400).json({
        error: "Missing or invalid field: encryptionShare (must be a non-empty string)",
      })
      return
    }

    // Step 2: Ensure the Shield publishable key is configured.
    // OPENFORT_SHIELD_API_KEY is the Shield publishable key (shpk_...).
    // Its value matches what you'd put in NEXT_PUBLIC_OPENFORT_SHIELD_PUBLISHABLE_KEY.
    if (!OPENFORT_SHIELD_API_KEY) {
      res.status(500).json({
        error:
          "Server misconfiguration: OPENFORT_SHIELD_API_KEY is not set. " +
          "Add it to .env (use the Shield publishable key, shpk_...).",
      })
      return
    }

    try {
      // Step 3: Call the Openfort SDK to register the encryption share with Shield
      // and obtain a session ID. Shield stores the encrypted recovery share so
      // the user's embedded wallet can be recovered later.
      //
      // Parameters:
      //   shieldApiKey    – Shield publishable key  (OPENFORT_SHIELD_API_KEY)
      //   shieldApiSecret – Shield secret key       (OPENFORT_SHIELD_SECRET_KEY)
      //   encryptionShare – Client's local key share to store in Shield
      const sessionId = await openfort.createEncryptionSession(
        OPENFORT_SHIELD_API_KEY,
        OPENFORT_SHIELD_SECRET_KEY!,
        encryptionShare,
      )

      // Step 4: Return the session ID for the frontend to use with the
      // Openfort embedded wallet SDK.
      res.json({ sessionId })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Openfort SDK error"
      res.status(500).json({ error: message })
    }
  },
)

// ---------------------------------------------------------------------------
// GET /api/protected-content
// ---------------------------------------------------------------------------
/**
 * Returns the protected payload.
 *
 * This handler is only reached after the x402 paymentMiddleware in app.ts
 * has verified a valid on-chain payment. Unpaid requests are short-circuited
 * by the middleware with HTTP 402 and machine-readable payment requirements.
 *
 * Response body: { "message": string, "content": string, "timestamp": string }
 */
router.get("/api/protected-content", (_req: Request, res: Response): void => {
  // Step 1: Payment has already been verified upstream — return protected content.
  // Replace this with your real payload (database query, AI response, etc.).
  res.json({
    message: "You paid!",
    content: "This is the protected resource you unlocked.",
    timestamp: new Date().toISOString(),
  })
})
