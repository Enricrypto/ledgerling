#!/usr/bin/env node
/**
 * Generates QR code for the bot's Telegram link.
 *
 * Usage: npm run qr
 * Output: assets/qr.png
 */

import QRCode from "qrcode";
import { config } from "../bot/config.js";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const botUrl = `https://t.me/${config.BOT_USERNAME}`;
const outputPath = "./assets/qr.png";

async function generateQR() {
  // Ensure assets directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  await QRCode.toFile(outputPath, botUrl, {
    width: 512,
    margin: 2,
    color: { dark: "#000000", light: "#FFFFFF" },
  });

  console.log(`✅ QR code generated: ${outputPath}`);
  console.log(`🔗 Bot URL: ${botUrl}`);
}

generateQR().catch((err) => {
  console.error("❌ Failed to generate QR code:", err);
  process.exit(1);
});
