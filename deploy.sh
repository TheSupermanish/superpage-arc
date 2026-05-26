#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# deploy.sh — Build and deploy SuperPage (monolith + Mongo + Caddy)
# =============================================================================

ENV_FILE=".env.production"
COMPOSE="docker compose -f docker-compose.prod.yml"

# ── Validate env file ─────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found."
  echo "Copy .env.production.example to .env.production and fill in your values."
  exit 1
fi

# Source env file so docker compose can interpolate build args + Caddyfile vars
set -a
source "$ENV_FILE"
set +a

if [ -z "${SUPERPAGE_DOMAIN:-}" ]; then
  echo "ERROR: SUPERPAGE_DOMAIN is not set in $ENV_FILE."
  echo "Caddy needs it to provision Let's Encrypt SSL."
  exit 1
fi

echo "Building images..."
$COMPOSE build

echo "Starting services..."
$COMPOSE up -d

# ── Health check ──────────────────────────────────────────────
echo "Waiting for backend to become healthy..."
MAX_WAIT=120
ELAPSED=0

while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$($COMPOSE ps superpage --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || true)
  if echo "$STATUS" | grep -q "healthy"; then
    echo "Backend is healthy!"
    break
  fi
  sleep 3
  ELAPSED=$((ELAPSED + 3))
  echo "  waiting... (${ELAPSED}s)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo "WARNING: Backend did not become healthy within ${MAX_WAIT}s"
  echo "Check logs: $COMPOSE logs superpage"
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "=== Deployment Summary ==="
$COMPOSE ps
echo ""
echo "Public URL:  https://${SUPERPAGE_DOMAIN}"
echo "Health:      curl https://${SUPERPAGE_DOMAIN}/health"
echo "MCP:         curl -X POST https://${SUPERPAGE_DOMAIN}/mcp/universal"
echo ""
echo "If SSL is slow on first start, watch Caddy logs:"
echo "  $COMPOSE logs -f caddy"
