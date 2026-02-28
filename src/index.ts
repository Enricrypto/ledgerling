import "dotenv/config";
import { buildFetchWithPayment } from "./services/fetchWithPayment.js";
import { getOrCreateUserSigner } from "./services/userSigner.js";

// Build once at startup; the returned function is reused for every request.
const signer = await getOrCreateUserSigner("demo-user");
const fetch402 = await buildFetchWithPayment(signer);

// Example: call a paid x402 endpoint
const result = await fetch402("https://api.x402.org/protected");

if (result.success) {
  console.log("Response:", result.result);
  console.log("Cost (micro-units):", result.cost);
  console.log("Receipt:", result.receipt);
} else {
  console.error("Request failed:", result.error);
}
