# Post Content Format Migration - Usage Guide

## Overview

This guide explains how to run the post content format migration script that adds `contentFormat` and `channels[]` fields to existing posts.

## Prerequisites

1. Ensure your MongoDB Atlas connection is configured in `.env.development` or `.env.production`
2. Verify your IP address is whitelisted in MongoDB Atlas
3. Ensure you have the correct database credentials

## Running the Migration

### Development Database

**Dry Run (Preview changes without applying):**
```bash
cd server
npm run migrate:posts
```

**Apply Changes:**
```bash
cd server
npm run migrate:posts -- --exec
```

### Production Database

**Dry Run (Preview changes without applying):**
```bash
cd server
npm run migrate:posts:prod
```

**Apply Changes:**
```bash
cd server
npm run migrate:posts:prod -- --exec
```

## What the Migration Does

The script performs the following operations:

1. **For Social Posts:**
   - Infers `contentFormat` from the existing `channel` field if missing
   - Generates `channels[]` array from `contentFormat` + `platforms`
   - If `platforms` is empty, infers platform from `channel`

2. **For Email Posts:**
   - Assigns `channels: ["email"]` if missing

3. **For Push Posts:**
   - Assigns `channels: ["push_notification"]` if missing

## Output Examples

### Dry Run Output
```
🚀 Iniciando migración de posts...
Modo: DRY RUN (sin cambios reales)
Entorno: development
----------------------------------------
🔌 Conectando a: mongodb+srv://***:***@autolab.n2rqx6g.mongodb.net/brandme
✅ Conectado a MongoDB: brandme
📊 Total de posts encontrados: 25

  📝 Post 68fa91b8e481faa6282bc652: Inferido formato "reel" desde channel "instagram_reel"
  📝 Post 68fa91b8e481faa6282bc652: Generados channels [instagram_reel, facebook_reel]

----------------------------------------
📊 Resumen de migración:
  ✅ Posts migrados: 15
  ⏭️  Posts omitidos (ya migrados): 10
  ❌ Errores: 0
----------------------------------------
⚠️  MODO DRY RUN: No se realizaron cambios reales en la base de datos
💡 Ejecuta con --exec para aplicar los cambios
💡 Ejemplo: npm run migrate:posts -- --exec
```

### Real Execution Output
```
🚀 Iniciando migración de posts...
Modo: EJECUCIÓN REAL
Entorno: development
----------------------------------------
✅ Conectado a MongoDB: brandme
📊 Total de posts encontrados: 25
...
----------------------------------------
✅ Migración completada exitosamente
⚠️  IMPORTANTE: Verifica los cambios en tu base de datos
```

## Troubleshooting

### Connection Errors

If you see `MongooseServerSelectionError`, the script will provide helpful suggestions:

```
❌ Error en la migración: MongooseServerSelectionError

💡 Posibles soluciones:
   1. Verifica que MONGO_URI esté correctamente configurada
   2. Asegúrate de que tu IP esté en la whitelist de MongoDB Atlas
   3. Verifica que las credenciales de la base de datos sean correctas
   4. Comprueba tu conexión a internet
```

### Environment Variable Issues

If environment variables are missing:
```
❌ Error: MONGO_URI no está definida en las variables de entorno
📂 Intentando cargar desde: /path/to/server/.env.development
💡 Asegúrate de tener configurado el archivo .env correspondiente
```

## Safety Features

1. **Dry Run by Default** - The script runs in dry-run mode unless you explicitly add `--exec`
2. **Idempotent** - Safe to run multiple times; already migrated posts are skipped
3. **Detailed Logging** - Shows exactly what changes will be/were made
4. **Error Isolation** - Errors in individual posts don't stop the entire migration
5. **Connection Validation** - Verifies database connection before starting

## Post-Migration Verification

After running the migration with `--exec`, verify the changes:

1. Check a few posts in your database to confirm the new fields exist
2. Verify that `contentFormat` matches the expected format (post, reel, story, etc.)
3. Confirm that `channels[]` array contains all expected channels
4. Test the frontend to ensure posts display correctly

## Notes

- The `channel` singular field is maintained for backward compatibility
- The pre-hook in the Post model will automatically generate `channels[]` for new posts
- This migration is a one-time operation for existing posts
