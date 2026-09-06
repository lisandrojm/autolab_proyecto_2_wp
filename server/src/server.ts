// Local + VPS según .env.development o .env.production
// Trigger reload 2
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
import { ensureAllTenantsHaveDefaultShifts } from "./services/shiftInitService.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { initCronScheduler } from "./services/cronService.js";
import { initEstadoDropboxScheduler } from "./services/estadoDropboxCronService.js";
import { initParitariasScheduler } from "./services/paritariasCronService.js";
import { initDropboxSignMailScheduler } from "./services/dropboxSignMailService.js";




import { notFoundHandler } from "./middleware/notFoundHandler.js";

import { authRoutes } from "./routes/auth.js";
import { secureRoutes } from "./routes/secure.js";
import { healthRoutes } from "./routes/health.js";
import { clientRoutes } from "./routes/clients.js";
import { roleRoutes } from "./routes/roles.js";
import { userRoutes } from "./routes/users.js";
import { registroLinkRoutes } from "./routes/registroLinks.js";
import { projectRoutes } from "./routes/projects.js";
import { nomenclaturaRoutes } from "./routes/nomenclaturas.js";
import { cleanupRoutes } from "./routes/cleanup.js";
import { tenantRoutes } from "./routes/tenants.js";
import { clientAssetsRoutes } from "./routes/clientAssets.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import platformRoutes from "./routes/platform.js";
import { vercelRoutes } from "./routes/vercel.js";
import { envRoutes } from "./routes/env.js";
import { profileRoutes } from "./routes/profile.js";
import { infoRoutes } from "./routes/info.js";
import { roleFrameRoutes } from "./routes/roleFrames.js";
import { categoriasSatRoutes } from "./routes/categoriasSat.js";
import { arcaCategoriasRoutes } from "./routes/arcaCategorias.js";
import { paritariasRoutes } from "./routes/paritarias.js";
import { bancoRoutes } from "./routes/bancos.js";
import { obraSocialRoutes } from "./routes/obrasSociales.js";
import { sindicatoRoutes } from "./routes/sindicatos.js";
// Tablas oficiales de ARCA (Simplificación Registral) usadas para armar el TXT de alta masiva.
import { arcaSucursalRoutes } from "./routes/arcaSucursales.js";
import { arcaModalidadContratacionRoutes } from "./routes/arcaModalidadesContratacion.js";
import { arcaTipoServicioRoutes } from "./routes/arcaTiposServicio.js";
import { arcaGrupoTipoServicioRoutes } from "./routes/arcaGruposTipoServicio.js";
import { arcaActividadRoutes } from "./routes/arcaActividades.js";
import { arcaModalidadLiquidacionRoutes } from "./routes/arcaModalidadesLiquidacion.js";
import { convenioRoutes } from "./routes/convenios.js";
import { centroCostoRoutes } from "./routes/centrosCosto.js";
import { companyRoutes } from "./routes/companies.js";
import { contratoFrameRoutes } from "./routes/contratosFrame.js";
import { contratoRoutes } from "./routes/contratos.js";
import { releaseTipoRoutes } from "./routes/releaseTipos.js";

import { orderRoutes } from "./routes/orders.js";
import { orderConfigRoutes } from "./routes/orderConfig.js";
import { calendarRoutes } from "./routes/calendar.js";
import { notificationRoutes } from "./routes/notifications.js";

import { hrAdminRoutes } from "./routes/hr-admin.js";
import { hrManagementRoutes } from "./routes/hr-management.js";
import { areaRoutes } from "./routes/areas.js";
import { PdfRoutes } from "./routes/pdfs.js";
import { ReleaseRoutes } from "./routes/releases.js";
import { pdfTemplatePreviewRoutes } from "./routes/pdfPreview.js";
import { vacationConfigRoutes } from "./routes/vacationConfig.js";
import { vacationsRoutes } from "./routes/vacations.js";
import { vacationOverlapRoutes } from "./routes/vacationOverlaps.js";
import { RequestConfigRoutes } from "./routes/requestConfig.js";
import { RequestRoutes } from "./routes/activityReports.js";
import { shiftRoutes } from "./routes/shifts.js";
import { holidayRoutes } from "./routes/holidays.js";

import { userProjectRoutes } from "./routes/userProjects.js";
import { dropboxRoutes } from "./routes/dropbox.js";
import { dropboxWebhookRoutes } from "./routes/dropboxWebhook.js";
import { afipRoutes } from "./routes/afip.js";
import { firmaDigitalRoutes } from "./routes/firmaDigital.js";
import { dropboxSignRoutes } from "./routes/dropboxSign.js";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ───────────────── Red de seguridad a nivel proceso ─────────────────
// Sin estos handlers, una promesa rechazada sin catch (p.ej. un endpoint async
// que lanza sin try/catch) tira abajo TODO el server (Node cierra el proceso),
// y a partir de ahí cualquier request falla con CORS/ERR_FAILED. Logueamos el
// error real y mantenemos el server vivo para no cortar el servicio a todos.
process.on("unhandledRejection", (reason: unknown) => {
  console.error("🛑 [unhandledRejection] El server sigue vivo. Motivo:", reason);
});
process.on("uncaughtException", (err: unknown) => {
  console.error("🛑 [uncaughtException] El server sigue vivo. Error:", err);
});

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
  // Las cargas masivas de catálogo (`/bulk`) mandan el nomenclador entero en un request: 2.350
  // actividades son ~250 KB, pero un catálogo más grande no tiene por qué chocar contra el tope y
  // volver a empujar a cargar de a un registro, que es el problema que `/bulk` viene a resolver.
  const limite = req.path.endsWith("/bulk") && req.method === "POST" ? "10mb" : "1mb";
  express.json({
    limit: limite,
    /*
      EL CUERPO CRUDO DEL WEBHOOK DE DROPBOX, QUE ES LO QUE SE FIRMA.

      La notificación viene con un HMAC-SHA256 del body TAL CUAL viajó. Reconstruirlo desde el objeto
      ya parseado —`JSON.stringify(req.body)`— no sirve: cambia un espacio o el orden de una clave y
      la firma deja de coincidir, así que el webhook rechazaría todo sin decir por qué.

      Se guarda SOLO para esa ruta: quedarse con una copia del body de cada request de la app sería
      pagar memoria en todas para usarla en una.
    */
    verify: (r: any, _res, buf: Buffer) => {
      if (r.originalUrl?.startsWith("/api/v1/dropbox/webhook")) r.rawBody = Buffer.from(buf);
    },
  })(req, res, next);
});

app.use(cookieParser());
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

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
      // Permitimos cualquier origen de forma dinámica para evitar que Safari
      // o dominios de Vercel/Netlify alternativos sean bloqueados por CORS.
      cb(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Requested-With", "X-Tenant-Id"],
    // Permite que el navegador lea el nombre de archivo generado por el backend
    // (descargas de contratos/releases). Sin esto el header queda oculto por CORS.
    exposedHeaders: ["Content-Disposition"],
  }),
);

// Preflight
app.options("*", cors());

/**
 * Rate limiter — DESPUÉS de CORS, y no antes.
 *
 * Estaba montado arriba de todo, así que su 429 salía SIN los headers de CORS. El navegador entonces
 * bloqueaba la respuesta, axios la veía como "sin respuesta" (`!error.response`) y el interceptor la
 * trataba como caída del servidor: borraba el token y mandaba a /login. Por eso una carga masiva se
 * sentía como "se cortó la sesión" cada ~150 requests, en vez de como lo que era: un límite de tasa.
 *
 * El síntoma engañaba al punto de parecer un problema de autenticación. Con el limiter acá abajo el
 * 429 llega con sus headers, el front lo lee y puede reintentar.
 */
app.use(
  rateLimit({
    windowMs: 60_000,
    max: env.NODE_ENV === "development" ? 500 : 200,
    standardHeaders: true,
    legacyHeaders: false,
    /*
      EL WEBHOOK DE DROPBOX NO PASA POR EL LIMITADOR.

      El limitador cuenta por IP, y todas las notificaciones de Dropbox llegan de las suyas: una
      ráfaga —veinte archivos subidos juntos— gasta cuota compartida con los usuarios reales, y al
      pasarse devuelve 429. Para Dropbox un 429 es una entrega FALLIDA, y a fuerza de fallar espacia
      y termina cortando las notificaciones a este endpoint. O sea: el mecanismo que existe para
      cuidar el servidor es el que apagaría el webhook, y en silencio.

      No queda desprotegido: lo que autoriza acá no es la IP sino la FIRMA. Un cuerpo sin HMAC válido
      se descarta sin tocar la base ni disparar ningún escaneo, y el escaneo en sí ya está detrás de
      su propio candado por tenant y del debounce — así que ni siquiera una ráfaga real de avisos
      legítimos se traduce en más de un escaneo.
    */
    skip: (req) => req.path.startsWith("/api/v1/dropbox/webhook"),
  }),
);

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

app.use("/api/v1/roles", roleRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/registro-links", registroLinkRoutes);
app.use("/api/v1/tenants", tenantRoutes);
app.use("/api/v1/cleanup", cleanupRoutes);
app.use("/api/v1/nomenclaturas", nomenclaturaRoutes);
app.use("/api/v1", projectRoutes);
app.use("/api/v1/client-assets", clientAssetsRoutes);
app.use("/api/v1/dashboard", dashboardRoutes);
app.use("/api/v1/platform", platformRoutes);
app.use("/api/v1", vercelRoutes);
app.use("/api/v1", envRoutes);

// ───────────────── HR Module Routes ─────────────────
app.use("/api/v1/profile", profileRoutes);
app.use("/api/v1/info", infoRoutes);
app.use("/api/v1/role-frames", roleFrameRoutes);
// Lectura plana para los consumidores viejos (TXT, completitud, Funciones FRAME, PDFs).
app.use("/api/v1/categorias-sat", categoriasSatRoutes);
app.use("/api/v1/bancos", bancoRoutes);
app.use("/api/v1/obras-sociales", obraSocialRoutes);
app.use("/api/v1/sindicatos", sindicatoRoutes);
// ABM de categorías en la forma de ARCA: convenio → grupo (escala) → categoría. Toda la escritura.
app.use("/api/v1/arca/categorias", arcaCategoriasRoutes);
app.use("/api/v1/paritarias", paritariasRoutes);
app.use("/api/v1/arca/sucursales", arcaSucursalRoutes);
app.use("/api/v1/arca/modalidades-contratacion", arcaModalidadContratacionRoutes);
app.use("/api/v1/arca/tipos-servicio", arcaTipoServicioRoutes);
app.use("/api/v1/arca/grupos-tipo-servicio", arcaGrupoTipoServicioRoutes);
app.use("/api/v1/arca/actividades", arcaActividadRoutes);
app.use("/api/v1/arca/modalidades-liquidacion", arcaModalidadLiquidacionRoutes);
app.use("/api/v1/convenios", convenioRoutes);
app.use("/api/v1/centros-costo", centroCostoRoutes);
app.use("/api/v1/companies", companyRoutes);
app.use("/api/v1/contratos-frame", contratoFrameRoutes);
app.use("/api/v1/contratos", contratoRoutes);

app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/order-config", orderConfigRoutes);
app.use("/api/v1/calendar", calendarRoutes);
app.use("/api/v1/notifications", notificationRoutes);

app.use("/api/v1/hr-admin", hrAdminRoutes);
app.use("/api/v1/hr-management", hrManagementRoutes);
app.use("/api/v1/areas", areaRoutes);
app.use("/api/v1/pdfs", PdfRoutes);
app.use("/api/v1/releases", ReleaseRoutes);
app.use("/api/v1/release-tipos", releaseTipoRoutes);
app.use("/api/v1/pdf-preview", pdfTemplatePreviewRoutes);

app.use("/api/v1/vacation-config", vacationConfigRoutes);
app.use("/api/v1/vacation-overlaps", vacationOverlapRoutes);
app.use("/api/v1/vacations", vacationsRoutes);
app.use("/api/v1/request-config", RequestConfigRoutes);
app.use("/api/v1/activity-reports", RequestRoutes);
app.use("/api/v1/shifts", shiftRoutes);
app.use("/api/v1/holidays", holidayRoutes);

app.use("/api/v1/user-projects", userProjectRoutes);
// ANTES que el router autenticado, y sobre el mismo prefijo: el webhook lo llama Dropbox, sin JWT ni
// tenant. Adentro de «dropboxRoutes» quedaría detrás de `requireTenant, authenticateToken` y
// devolvería 401 a cada notificación. Solo define /webhook; el resto cae al router de abajo.
app.use("/api/v1/dropbox", dropboxWebhookRoutes);
app.use("/api/v1/dropbox", dropboxRoutes);
app.use("/api/v1/afip", afipRoutes);
app.use("/api/v1/firma-digital", firmaDigitalRoutes);
app.use("/api/v1/dropbox-sign", dropboxSignRoutes);


// ───────────────── 404 + errores (al final) ─────────────────
app.use(notFoundHandler);
app.use(errorHandler);

app.use("/api/v1/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date() });
});

// ───────────────── Routes ─────────────────
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

    try {
      console.log("🔍 Verifying all tenants have default shifts...");
      await ensureAllTenantsHaveDefaultShifts();
      console.log("✅ Shift verification completed successfully");
    } catch (error) {
      console.error("❌ Shift verification failed:", error);
    }

    // Initialize the Import Users Background Scheduler
    try {
      initCronScheduler();
    } catch (error) {
      console.error("❌ Failed to initialize background scheduler:", error);
    }

    // Initialize the Estado auto-transition Dropbox folder scanner
    try {
      initEstadoDropboxScheduler();
      initParitariasScheduler();
    } catch (error) {
      console.error("❌ Failed to initialize estado-dropbox scheduler:", error);
    }

    // Lectura de la casilla de Dropbox Sign: detecta los envíos a firmar y los archiva en Pendbox.
    try {
      initDropboxSignMailScheduler();
    } catch (error) {
      console.error("❌ Failed to initialize dropbox-sign mail scheduler:", error);
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
      const keyPath = env.SSL_KEY_PATH;
      const certPath = env.SSL_CERT_PATH;

      if (keyPath && certPath && fs.existsSync(keyPath) && fs.existsSync(certPath)) {
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
        console.warn("⚠️  SSL Certificates not found or paths not configured. Falling back to HTTP.");
        http.createServer(app).listen(PORT, () => {
          console.log(`🚀 HTTP Server (Fallback) running on port ${PORT}`);
          console.log(`📱 Environment: ${env.NODE_ENV}`);
          console.log(`🔗 CORS origins (env): ${ENV_ALLOWED.join(", ") || "(none)"}`);
          console.log(`🩺 Health:        http://localhost:${PORT}/api/v1/health`);
          console.log(`🌍 Env info:       http://localhost:${PORT}/api/v1/env`);
        });
      }
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
