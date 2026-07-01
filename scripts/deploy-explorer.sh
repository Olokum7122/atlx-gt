#!/bin/bash
# deploy-explorer.sh — Deploy explorer-app (frontend) + explorer-api (backend) a Contabo
#
# Uso:
#   export CONTABO_PASS='tu_password'
#   bash scripts/deploy-explorer.sh
#
# Requiere: sshpass (instalar con: brew install sshpass o apt install sshpass)

set -euo pipefail

CONTABO_HOST="${CONTABO_HOST:-185.187.235.253}"
CONTABO_USER="${CONTABO_USER:-root}"
CONTABO_PASS="${CONTABO_PASS:-}"
REMOTE_DIR="${REMOTE_DIR:-/opt/atlx-gt}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"
SCP_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"

# Detectar SSH con contraseña o clave
if [ -n "$CONTABO_PASS" ]; then
    SSH_CMD="sshpass -p '$CONTABO_PASS' ssh $SSH_OPTS -tt"
    SCP_CMD="sshpass -p '$CONTABO_PASS' scp $SCP_OPTS"
else
    SSH_CMD="ssh $SSH_OPTS"
    SCP_CMD="scp $SCP_OPTS"
fi

echo "══════════════════════════════════════════════"
echo " Deploy Explorer App + API a Contabo"
echo " Host: $CONTABO_USER@$CONTABO_HOST"
echo "══════════════════════════════════════════════"

# ── 1. Build frontend ──
echo ""
echo "==> [1/4] Build explorer-app (frontend)..."
cd "$REPO_ROOT/../explorer-app"
pnpm run build
echo "  ✅ Build completado"

# ── 2. Copiar dist/ del frontend ──
echo "==> [2/4] Subiendo frontend (dist/) al servidor..."
$SSH_CMD "${CONTABO_USER}@${CONTABO_HOST}" "mkdir -p ${REMOTE_DIR}/explorer-app/dist"
$SCP_CMD -r dist/* "${CONTABO_USER}@${CONTABO_HOST}:${REMOTE_DIR}/explorer-app/dist/"
echo "  ✅ Frontend subido"

# ── 3. Copiar API backend ──
echo "==> [3/4] Subiendo explorer-api backend..."
cd "$REPO_ROOT/apps/explorer-api"

$SSH_CMD "${CONTABO_USER}@${CONTABO_HOST}" "mkdir -p ${REMOTE_DIR}/explorer-api/src"
$SCP_CMD -r src/* "${CONTABO_USER}@${CONTABO_HOST}:${REMOTE_DIR}/explorer-api/src/"
$SCP_CMD package.json package-lock.json "${CONTABO_USER}@${CONTABO_HOST}:${REMOTE_DIR}/explorer-api/"
echo "  ✅ API subida"

# ── 4. Instalar dependencias + reiniciar ──
echo "==> [4/4] Instalando dependencias y reiniciando servicio..."
$SSH_CMD "${CONTABO_USER}@${CONTABO_HOST}" "
    cd ${REMOTE_DIR}/explorer-api && npm ci --omit=dev
    pm2 delete atlx-api-explorer 2>/dev/null || true
    pm2 start src/server.js --name atlx-api-explorer
    pm2 save
    echo '  ✅ API desplegada'
"

echo ""
echo "══════════════════════════════════════════════"
echo " ✅ Deploy completado"
echo "    Frontend: https://explorer.antojadosmx.mx"
echo "    API: http://$CONTABO_HOST:4101"
echo "══════════════════════════════════════════════"