#!/bin/bash
# Cargar .env.development
export $(cat .env.development | grep -v '^#' | xargs)
# Ejecutar seed
npx tsx src/scripts/seedOnStart.ts
