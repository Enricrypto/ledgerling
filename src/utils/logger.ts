// ---------------------------------------------------------------------------
// Lightweight structured logger
// ---------------------------------------------------------------------------
// Output format is controlled by the LOG_FORMAT env var:
//   (unset)       → human-readable:  [INFO] message { key: value }
//   LOG_FORMAT=json → newline-delimited JSON: { "level":"info", "msg":"...", "ts":"...", ... }

type Level = "info" | "warn" | "error"

function emit(level: Level, msg: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString()

  if (process.env.LOG_FORMAT === "json") {
    const entry = data ? { level, msg, ts, ...data } : { level, msg, ts }
    const stream = level === "info" ? process.stdout : process.stderr
    stream.write(JSON.stringify(entry) + "\n")
    return
  }

  const prefix = `[${level.toUpperCase()}]`
  const suffix = data && Object.keys(data).length ? " " + JSON.stringify(data) : ""
  const line = `${prefix} ${msg}${suffix}\n`

  if (level === "info") {
    process.stdout.write(line)
  } else {
    process.stderr.write(line)
  }
}

export const logger = {
  info(msg: string, data?: Record<string, unknown>): void {
    emit("info", msg, data)
  },
  warn(msg: string, data?: Record<string, unknown>): void {
    emit("warn", msg, data)
  },
  error(msg: string, data?: Record<string, unknown>): void {
    emit("error", msg, data)
  },
}
