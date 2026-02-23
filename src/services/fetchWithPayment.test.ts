import { buildFetchWithPayment } from "./fetchWithPayment.js"

// Save and restore env vars around tests that mutate them
const originalEnv = { ...process.env }
afterEach(() => {
  process.env = { ...originalEnv }
})

describe("buildFetchWithPayment — no credentials", () => {
  test("throws a descriptive error when neither OPENFORT_SECRET_KEY nor EVM_PRIVATE_KEY is set", async () => {
    delete process.env.OPENFORT_SECRET_KEY
    delete process.env.EVM_PRIVATE_KEY

    await expect(buildFetchWithPayment()).rejects.toThrow(
      /No signer configured/i
    )
  })
})

describe("buildFetchWithPayment — export shape", () => {
  test("is an async function", () => {
    expect(typeof buildFetchWithPayment).toBe("function")
    expect(buildFetchWithPayment.constructor.name).toBe("AsyncFunction")
  })
})
