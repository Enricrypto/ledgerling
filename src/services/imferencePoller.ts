/**
 * Polls the Imference /ondemand/status endpoint until the generated image is ready.
 *
 * Imference is async: POST /ondemand/generate returns { request_id } immediately,
 * and the actual image URL must be fetched by polling GET /ondemand/status?request_id=...
 *
 * The status endpoint does NOT require x402 payment — plain fetch is used.
 */

const IMFERENCE_BASE =
  (process.env.IMFERENCE_X402_URL ?? "https://imference.com/ondemand").replace(/\/$/, "")

const STATUS_URL = `${IMFERENCE_BASE}/status`

const MAX_ATTEMPTS = 60       // 60 × 5 s = up to 5 minutes
const POLL_INTERVAL_MS = 5_000

/**
 * Polls until the image is ready and returns the image URL, or null on timeout/failure.
 */
export async function pollImferenceResult(requestId: string): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS))

    let data: any
    try {
      const res = await fetch(`${STATUS_URL}?request_id=${encodeURIComponent(requestId)}`)
      const rawText = await res.text()
      if (!res.ok) continue
      data = JSON.parse(rawText)
    } catch {
      continue
    }

    // Imference 200 response: { data: { URL, Format, Seed, Timestamp, ... } }
    // 404 means "not ready yet" — handled above by !res.ok continue
    const imageUrl =
      data?.data?.URL ??          // Imference v1 format
      data?.data?.url ??
      data?.url ??                // fallback flat formats
      data?.image_url ??
      data?.imageUrl ??
      data?.output ??
      null

    if (imageUrl) return imageUrl

    // If status field present and indicates failure, abort early
    const status = (data?.status ?? data?.data?.status ?? "").toLowerCase()
    if (status === "failed" || status === "error" || status === "cancelled") {
      return null
    }

    // Still processing — keep polling
  }

  return null // timed out
}
