#!/usr/bin/env bash
# Arma el paquete para el VPS: build + package.json + catálogo (solo lo que usa el servicio).
#
# Uso: bash scripts/deploy/empaquetar.sh
# Deja build/tango-connector.tgz. El catálogo va sin los -form.json ni -data.json: el servicio
# solo lee api.csv, campos.csv y los -api.json.
set -euo pipefail
cd "$(dirname "$0")/../.."

CATALOGO="${CATALOGO_DIR:-docs/tango/catalogo/2026-10-08}"
rm -rf build && mkdir -p build/paquete

npm run build >/dev/null
cp -r dist package.json package-lock.json ecosystem.config.cjs build/paquete/

mkdir -p "build/paquete/$CATALOGO"
cp "$CATALOGO/api.csv" "$CATALOGO/campos.csv" "build/paquete/$CATALOGO/"
( cd "$CATALOGO" && find procesos -name '*-api.json' ) | while read -r f; do
  mkdir -p "build/paquete/$CATALOGO/$(dirname "$f")"
  cp "$CATALOGO/$f" "build/paquete/$CATALOGO/$f"
done

tar -czf build/tango-connector.tgz -C build/paquete .
echo "build/tango-connector.tgz ($(du -h build/tango-connector.tgz | cut -f1)), catálogo $CATALOGO"
