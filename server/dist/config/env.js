// apps/api/src/config/env.ts
import { z } from "zod";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import "dotenv/config";
// Resolver paths absolutos a apps/api/.env y .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Determinar qué archivo .env usar basado en NODE_ENV
const nodeEnv = process.env.NODE_ENV || "development";
const envFileName = nodeEnv === "production" ? ".env.production" : ".env.development";
const ENV_PATH = resolve(__dirname, `../../${envFileName}`);
const ENV_LOCAL_PATH = resolve(__dirname, "../../.env.local");
// Cargar primero el archivo específico del entorno y luego .env.local (override)
config({ path: ENV_PATH });
config({ path: ENV_LOCAL_PATH, override: true });
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    PORT: z
        .string()
        .default("8080")
        .transform((v) => Number(v)),
    // 🔽 NUEVO: HTTPS condicional
    USE_HTTPS: z.preprocess((v) => String(v).toLowerCase().trim(), z.enum(["true", "false"]).default("false")).transform((v) => v === "true"),
    SSL_KEY_PATH: z.string().optional(),
    SSL_CERT_PATH: z.string().optional(),
    MONGO_URI: z.string().min(1),
    MONGO_DB_NAME: z.string().min(1),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRES_IN: z.string().default("7d"),
    // Llave del server para cifrar secretos de integraciones por tenant (Dropbox, etc.).
    // Opcional: si no está, se deriva del JWT_SECRET.
    ENCRYPTION_KEY: z.string().optional(),
    CORS_ORIGIN: z.string().default("*"),
    TENANCY_HEADER: z.string().default("X-Tenant-Id"),
    SEED_TENANT_SLUG: z.string().default("demo-tenant"),
    SEED_ON_START: z.string().default("false"),
    SEED_ADMIN_EMAIL: z.string().default("admin@example.com"),
    SEED_ADMIN_PASS: z.string().default("admin123"),
    SEED_CLIENT_EMAIL: z.string().default("cliente@example.com"),
    SEED_CLIENT_PASS: z.string().default("changeme"),
    DEFAULT_TENANT_USER_PASSWORD: z.string().default("tenant123"),
    API_URL: z.string().url().default("http://localhost:8080"),
});
export const env = envSchema.parse(process.env);
