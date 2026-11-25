#!/usr/bin/env bash
# Actualiza el connector en el VPS: empaqueta, sube, migra y recarga PM2.
#
# Uso: bash scripts/deploy/actualizar.sh <development|production>
#
# Requiere .vps (ver .vps.example) y que el entorno ya esté instalado (base, .env, app de
# PM2, bloque de nginx): ver docs/operacion/deploy.md. Conserva el .env, los logs y la base.
set -euo pipefail
cd "$(dirname "$0")/../.."

ENTORNO="${1:?Uso: actualizar.sh <development|production>}"
case "$ENTORNO" in
  development) PUERTO=7007 ;;
  production) PUERTO=7008 ;;
  *) echo "Entorno desconocido: $ENTORNO" >&2; exit 1 ;;
esac

set -a; . ./.vps; set +a
SSH=(ssh -i "$VPS_SSH_KEY_PATH" -p "$VPS_PORT" -o BatchMode=yes "$VPS_USER@$VPS_HOST")

bash scripts/deploy/empaquetar.sh
scp -i "$VPS_SSH_KEY_PATH" -P "$VPS_PORT" -o BatchMode=yes build/tango-connector.tgz "$VPS_USER@$VPS_HOST:/tmp/tango-connector-$ENTORNO.tgz"

"${SSH[@]}" "ENTORNO=$ENTORNO PUERTO=$PUERTO bash -s" <<'REMOTO'
set -euo pipefail
DIR=/home/lumba/apps/$ENTORNO/tango-connector
test -f "$DIR/.env" || { echo "Falta $DIR/.env: el entorno no está instalado" >&2; exit 1; }
cd "$DIR"
rm -rf dist docs
tar -xzf "/tmp/tango-connector-$ENTORNO.tgz" -C "$DIR" && rm "/tmp/tango-connector-$ENTORNO.tgz"
npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -1
npm run -s migration:run 2>&1 | grep -E "executed successfully|No migrations|rror" | head -5 || true
pm2 reload ecosystem.config.cjs --update-env 2>&1 | grep -E "tango-connector|rror" | head -3
# Espera hasta 30 s a que levante (carga el catálogo al arrancar).
for i in $(seq 1 30); do
  SALUD=$(curl -fsS --max-time 5 "http://127.0.0.1:$PUERTO/v1/health" 2>/dev/null) || SALUD=""
  case "$SALUD" in *'"estado":"ok"'*) echo "$SALUD"; exit 0 ;; esac
  sleep 1
done
echo "El servicio no respondió /v1/health con estado ok en 30 s (último: ${SALUD:-sin respuesta}): ver pm2 logs" >&2; exit 1
REMOTO
