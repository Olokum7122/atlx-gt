#!/usr/bin/env pwsh
# ─────────────────────────────────────────────────────────────────
# deploy-windows.ps1 — Deploy gt-api + gt-web al servidor Contabo
# Usa OpenSSH nativo de Windows (no necesita sshpass)
#
# Uso:
#   $env:CONTABO_PASS = 'tu_password'
#   .\scripts\deploy-windows.ps1
#
# Para gt-web únicamente:
#   .\scripts\deploy-windows.ps1 -OnlyWeb
#
# Para gt-api únicamente:
#   .\scripts\deploy-windows.ps1 -OnlyApi
# ─────────────────────────────────────────────────────────────────
param(
  [switch]$OnlyWeb,
  [switch]$OnlyApi
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$CONTABO_HOST = if ($env:CONTABO_HOST) { $env:CONTABO_HOST } else { "185.187.235.253" }
$CONTABO_USER = if ($env:CONTABO_USER) { $env:CONTABO_USER } else { "root" }
$REMOTE_DIR   = if ($env:REMOTE_DIR)   { $env:REMOTE_DIR }   else { "/opt/atlx-gt" }

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$REPO_ROOT  = Split-Path -Parent $SCRIPT_DIR

# Cargar .env.production si existe y CONTABO_PASS no está definida
if (-not $env:CONTABO_PASS) {
    $envFile = Join-Path $REPO_ROOT ".env.production"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^([^#=]+)=(.*)$') {
                $key = $Matches[1].Trim()
                $val = $Matches[2].Trim().Trim('"').Trim("'")
                if ($key -eq 'CONTABO_PASS') { $env:CONTABO_PASS = $val }
            }
        }
    }
}

if (-not $env:CONTABO_PASS -and $env:GT_SQL_PASSWORD) {
    $env:CONTABO_PASS = $env:GT_SQL_PASSWORD
}

# Verificar si hay llave SSH preconfigurada — si la hay, no necesitamos contraseña
$sshKeyTest = & ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 "${CONTABO_USER}@${CONTABO_HOST}" "echo SSH_KEY_OK" 2>&1
$hasSshKey = $sshKeyTest -match "SSH_KEY_OK"

if (-not $hasSshKey -and -not $env:CONTABO_PASS) {
    Write-Error "Sin llave SSH y sin CONTABO_PASS. Ejecuta: `$env:CONTABO_PASS = 'tu_password'"
    exit 1
}

$SSH_OPTS = "-o StrictHostKeyChecking=no -o ConnectTimeout=15"

function Invoke-RemoteCommand {
    param([string]$Command)
    $proc = Start-Process -FilePath "ssh" -ArgumentList @(
        "-o", "StrictHostKeyChecking=no",
        "-o", "ConnectTimeout=15",
        "-o", "PasswordAuthentication=yes",
        "${CONTABO_USER}@${CONTABO_HOST}",
        $Command
    ) -NoNewWindow -Wait -PassThru -RedirectStandardInput "NUL"

    # sshpass workaround usando sshpass env var en el env de ssh
    # En Windows OpenSSH no soporta pasar contraseña por arg —
    # se requiere key preconfigurada o usar PuTTY.
    # Instrucción alternativa al usuario al final del script.
}

# ── Detectar clave SSH preconfigurada ──────────────────────────────
$sshKeyTest = & ssh -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=10 "${CONTABO_USER}@${CONTABO_HOST}" "echo OK" 2>&1
$hasSshKey = $sshKeyTest -match "OK"

if (-not $hasSshKey) {
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host " DEPLOY MANUAL REQUERIDO" -ForegroundColor Yellow
    Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Windows OpenSSH no soporta contraseña por CLI." -ForegroundColor Cyan
    Write-Host "Opciones:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  OPCION 1 — Configurar clave SSH (recomendado):" -ForegroundColor White
    Write-Host "    ssh-keygen -t ed25519 -C 'atlx-deploy'"
    Write-Host "    ssh-copy-id ${CONTABO_USER}@${CONTABO_HOST}"
    Write-Host "    # Luego volver a ejecutar este script"
    Write-Host ""
    Write-Host "  OPCION 2 — Deploy manual desde Git Bash con sshpass:" -ForegroundColor White
    Write-Host "    choco install sshpass  (o apt install sshpass en WSL)"
    Write-Host "    cd $REPO_ROOT"
    Write-Host "    export CONTABO_PASS='tu_password'"
    Write-Host "    bash scripts/deploy-contabo.sh"
    Write-Host ""
    Write-Host "  OPCION 3 — Comandos manuales por SSH:" -ForegroundColor White
    Write-Host "    1. scp -r apps/gt-api ${CONTABO_USER}@${CONTABO_HOST}:${REMOTE_DIR}/apps/gt-api"
    Write-Host "    2. ssh ${CONTABO_USER}@${CONTABO_HOST} 'cd ${REMOTE_DIR}/apps/gt-api && npm ci --omit=dev'"
    Write-Host "    3. ssh ${CONTABO_USER}@${CONTABO_HOST} 'cd ${REMOTE_DIR} && pm2 restart atlx-api-gt || pm2 reload atlx-api-gt'"
    if (-not $OnlyApi) {
        Write-Host "    4. scp -r apps/gt-web/dist ${CONTABO_USER}@${CONTABO_HOST}:${REMOTE_DIR}/apps/gt-web/dist"
    }
    Write-Host ""
    Write-Host "══════════════════════════════════════════════════════════" -ForegroundColor Yellow
    exit 0
}

# ── Deploy con SSH key ─────────────────────────────────────────────
$sshTarget = "${CONTABO_USER}@${CONTABO_HOST}"

if (-not $OnlyWeb) {
    Write-Host "==> [GT API] Copiando código..."
    & scp -r -o StrictHostKeyChecking=no -o ConnectTimeout=15 `
        "$REPO_ROOT\apps\gt-api\src\*" "${sshTarget}:${REMOTE_DIR}/apps/gt-api/src/"
    & scp -o StrictHostKeyChecking=no -o ConnectTimeout=15 `
        "$REPO_ROOT\apps\gt-api\package.json" `
        "$REPO_ROOT\apps\gt-api\package-lock.json" `
        "${sshTarget}:${REMOTE_DIR}/apps/gt-api/"

    Write-Host "==> [GT API] Instalando dependencias..."
    & ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 $sshTarget `
        "cd ${REMOTE_DIR}/apps/gt-api && npm ci --omit=dev"

    Write-Host "==> [GT API] Reiniciando servicio..."
    & ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 $sshTarget `
        "cd ${REMOTE_DIR} && (pm2 reload atlx-api-gt 2>/dev/null || pm2 restart atlx-api-gt 2>/dev/null || pm2 start apps/gt-api/src/server.js --name atlx-api-gt && pm2 save)"

    Write-Host "[OK] GT API desplegado." -ForegroundColor Green
}

if (-not $OnlyApi) {
    Write-Host "==> [GT Web] Construyendo..."
    Push-Location "$REPO_ROOT\apps\gt-web"
    npm run build 2>&1 | Write-Host
    Pop-Location

    Write-Host "==> [GT Web] Copiando dist al servidor..."
    & scp -r -o StrictHostKeyChecking=no -o ConnectTimeout=15 `
        "$REPO_ROOT\apps\gt-web\dist\*" "${sshTarget}:${REMOTE_DIR}/apps/gt-web/dist/"

    Write-Host "[OK] GT Web desplegado." -ForegroundColor Green
}

Write-Host ""
Write-Host "Deploy completado." -ForegroundColor Green
