# Use Node.js LTS
FROM node:20-slim

# Enable pnpm (optional, or use npm)
RUN corepack enable

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
# Note: Use `npm install` if package-lock.json is not up to date
# Use `npm ci --omit=dev` for production with a synced lock file
RUN npm install --omit=dev

# Copy source code
COPY . .

# Build TypeScript (exclude tests)
RUN npx tsc -p tsconfig.build.json

# Expose port (optional, for future webhook mode)
EXPOSE 3000

# Start bot
CMD ["node", "dist/bot.js"]
