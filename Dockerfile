# SuperPage Production Dockerfile — linux/amd64 only
FROM --platform=linux/amd64 node:22-slim

RUN npm install -g pnpm tsx pm2
WORKDIR /app

# Copy package files for layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/backend/package.json packages/backend/
COPY packages/frontend/package.json packages/frontend/
COPY packages/x402-sdk-eth/package.json packages/x402-sdk-eth/
COPY packages/contracts/package.json packages/contracts/
COPY packages/mcp-client/package.json packages/mcp-client/
COPY packages/ai-agent/package.json packages/ai-agent/

# Install all dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY . .

# Build x402-sdk-eth
RUN cd packages/x402-sdk-eth && npx tsup src/index.ts --format cjs,esm --dts

# Build Next.js frontend (env vars baked at build time)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_X402_CHAIN=mezo-testnet
ARG NEXT_PUBLIC_X402_CURRENCY=MUSD
ARG NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_X402_CHAIN=$NEXT_PUBLIC_X402_CHAIN \
    NEXT_PUBLIC_X402_CURRENCY=$NEXT_PUBLIC_X402_CURRENCY \
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID

RUN cd packages/frontend && NODE_OPTIONS="--max-old-space-size=3072" npx next build

EXPOSE 1337 2337 3337

# PM2 runtime config: backend (2337), payment (3337), frontend (1337) — matches dev ports
RUN echo '{"apps":[{"name":"backend","script":"packages/backend/src/index.ts","interpreter":"tsx","env":{"NODE_ENV":"production"}},{"name":"payment","script":"packages/backend/src/payment-service.ts","interpreter":"tsx","env":{"NODE_ENV":"production"}},{"name":"frontend","script":"npx","args":"next start -p 1337","cwd":"packages/frontend","env":{"NODE_ENV":"production"}}]}' > ecosystem.config.json

CMD ["pm2-runtime", "ecosystem.config.json"]
