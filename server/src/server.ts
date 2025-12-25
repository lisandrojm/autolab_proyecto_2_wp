// Local + VPS según .env.development o .env.production
import "./config/env.js";
import { env } from "./config/env.js";

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import fs from "fs";
import http from "http";
import https from "https";
import path, { dirname } from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./config/db.js";
import { seedOnStart, ensureSuperAdmin } from "./scripts/seedOnStart.js";
import { ensureAllTenantsHaveDefaultRoles } from "./services/roleInitService.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFoundHandler.js";

import { authRoutes } from "./routes/auth.js";
import { secureRoutes } from "./routes/secure.js";
import { healthRoutes } from "./routes/health.js";
import { clientRoutes } from "./routes/clients.js";
import { campaignRoutes } from "./routes/campaigns.js";
import { postRoutes } from "./routes/posts.js";

import { roleRoutes } from "./routes/roles.js";
import { userRoutes } from "./routes/users.js";
import { projectRoutes } from "./routes/projects.js";
import { tenantRoutes } from "./routes/tenants.js";
import { clientAssetsRoutes } from "./routes/clientAssets.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import platformRoutes from "./routes/platform.js";
import { vercelRoutes } from "./routes/vercel.js";
import { envRoutes } from "./routes/env.js";
import { profileRoutes } from "./routes/profile.js";

import { documentRoutes } from "./routes/documents.js";
import { orderRoutes } from "./routes/orders.js";
import { orderCategoryRoutes } from "./routes/orderCategories.js";
import { calendarRoutes } from "./routes/calendar.js";
import { notificationRoutes } from "./routes/notifications.js";
import { activityRoutes } from "./routes/activity.js";
import { hrAdminRoutes } from "./routes/hr-admin.js";
import { hrManagementRoutes } from "./routes/hr-management.js";
import { requestRoutes } from "./routes/requests.js";
import { requestTypeRoutes } from "./routes/requestTypes.js";
import { futureActionsRoutes } from "./routes/futureActions.js";
import { positionRoutes } from "./routes/positions.js";
import { areaRoutes } from "./routes/areas.js";
import { levelRoutes } from "./routes/levels.js";
import { pdfTemplateRoutes } from "./routes/pdfTemplates.js";
import { pdfGlobalConfigRoutes } from "./routes/pdfGlobalConfig.js";
import { pdfTemplatePreviewRoutes } from "./routes/pdfPreview.js";
import { globalVacationConfigRoutes } from "./routes/globalVacationConfig.js";
import { vacationsRoutes } from "./routes/vacations.js";
import { vacationOverlapRoutes } from "./routes/vacationOverlaps.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = Number(env.PORT) || 8080;
const USE_HTTPS = String(env.USE_HTTPS) === "true";
// ───────────────── AGREGAR ESTA LÍNEA ─────────────────
// SOLUCIÓN AL ERROR: Le indica a Express que confíe en el encabezado X-Forwarded-For
// enviado por el Proxy Inverso (Apache). '1' es el número de proxies a confiar.
app.set("trust proxy", 1);
// ───────────────── Middlewares base ─────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// express.json() solo para rutas que NO son uploads de archivos
app.use((req, res, next) => {
  if (req.path.includes("/upload") && req.method === "POST") {
    return next();
  }
  express.json({ limit: "1mb" })(req, res, next);
});

app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

// Rate limiter
app.use(
  rateLimit({
    windowMs: 60_000,
    max: env.NODE_ENV === "development" ? 500 : 200,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// ───────────────── CORS ─────────────────
const ENV_ALLOWED = (env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED = new Set<string>([...ENV_ALLOWED, "https://autolab-proyecto-2-wp.vercel.app", "https://autolab.fun", "http://localhost:5173"]);

// Ayuda a caches/proxies a variar por Origin
app.use((_, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

app.use(
  cors({
    origin: (origin, cb) => {
      if (env.NODE_ENV === "development") return cb(null, true); // Dev: permitir todo
      if (!origin) return cb(null, true); // SSR/curl/postman
      if (origin.includes("local-credentialless.webcontainer-api.io")) return cb(null, true);
      if (origin.endsWith(".netlify.app")) return cb(null, true);
      if (ALLOWED.has(origin)) return cb(null, true);
      return cb(null, false); // Browser bloqueará por CORS
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-Tenant-Id"],
  })
);

// Preflight
app.options("*", cors());

// ───────────────── Archivos estáticos ─────────────────
const storagePath = path.join(process.cwd(), "storage");
console.log("[SERVER] Storage path configured:", storagePath);
app.use("/storage", express.static(storagePath));
app.use("/api/v1/storage", express.static(storagePath));
// ───────────────── Rutas API (/api/v1/...) ─────────────────
app.use("/api/v1/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/secure", secureRoutes);
app.use("/api/v1/clients", clientRoutes);
app.use("/api/v1/campaigns", campaignRoutes);
app.use("/api/v1/posts", postRoutes);

app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1", projectRoutes);
app.use("/api/v1/client-assets", clientAssetsRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/platform", platformRoutes);
app.use("/api/v1", vercelRoutes);
app.use("/api/v1", envRoutes);

// ───────────────── HR Module Routes ─────────────────
app.use("/api/v1/profile", profileRoutes);

app.use("/api/v1/documents", documentRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/order-categories", orderCategoryRoutes);
app.use("/api/v1/calendar", calendarRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/activity", activityRoutes);
app.use("/api/v1/hr-admin", hrAdminRoutes);
app.use("/api/v1/hr-management", hrManagementRoutes);
app.use("/api/v1/requests", requestRoutes);
app.use("/api/v1/request-types", requestTypeRoutes);
app.use("/api/v1/future-actions", futureActionsRoutes);
app.use("/api/v1/positions", positionRoutes);
app.use("/api/v1/areas", areaRoutes);
app.use("/api/v1/levels", levelRoutes);
app.use("/api/v1/pdf-templates", pdfTemplateRoutes);
app.use("/api/v1/pdf-global-config", pdfGlobalConfigRoutes);
app.use("/api/v1/pdf-preview", pdfTemplatePreviewRoutes);

app.use("/api/v1/global-vacation-config", globalVacationConfigRoutes);
app.use("/api/v1/vacation-overlaps", vacationOverlapRoutes);
app.use("/api/v1/vacations", vacationsRoutes);

// ───────────────── 404 + errores (al final) ─────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ───────────────── Boot ─────────────────
connectDB()
  .then(async () => {
    try {
      await ensureSuperAdmin();
    } catch (error) {
      console.error("❌ Failed to ensure superadmin:", error);
    }

    try {
      console.log("🔍 Verifying all tenants have default roles...");
      await ensureAllTenantsHaveDefaultRoles();
      console.log("✅ Role verification completed successfully");
    } catch (error) {
      console.error("❌ Role verification failed:", error);
    }

    if (String(env.SEED_ON_START) === "true") {
      try {
        console.log("🌱 Starting auto-seed process...");
        await seedOnStart();
        console.log("✅ Auto-seed completed successfully");
      } catch (error) {
        console.error("❌ Auto-seed failed:", error);
      }
    }

    if (USE_HTTPS) {
      const keyPath = env.SSL_KEY_PATH!;
      const certPath = env.SSL_CERT_PATH!;
      const sslOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };
      https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`🚀 HTTPS Server running on port ${PORT}`);
        console.log(`📱 Environment: ${env.NODE_ENV}`);
        console.log(`🔗 CORS origins (env): ${ENV_ALLOWED.join(", ") || "(none)"}`);
        console.log(`🩺 Health:        https://localhost:${PORT}/api/v1/health`);
        console.log(`🌍 Env info:       https://localhost:${PORT}/api/v1/env`);
      });
    } else {
      http.createServer(app).listen(PORT, () => {
        console.log(`🚀 HTTP Server running on port ${PORT}`);
        console.log(`📱 Environment: ${env.NODE_ENV}`);
        console.log(`🔗 CORS origins (env): ${ENV_ALLOWED.join(", ") || "(none)"}`);
        console.log(`🩺 Health:        http://localhost:${PORT}/api/v1/health`);
        console.log(`🌍 Env info:       http://localhost:${PORT}/api/v1/env`);
      });
    }
  })
  .catch((e) => {
    console.error("Fatal boot error", e);
    process.exit(1);
  });

export default app;
