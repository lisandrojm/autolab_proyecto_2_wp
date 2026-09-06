import { Router } from "express";
import multer from "multer";
import PizZip from "pizzip";
import { Tenant } from "../models/Tenant.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import {
  getTenantDropboxConfig,
  verifyAccount,
  listFolder,
  getTemporaryLink,
  downloadFileContent,
  uploadFile,
  deleteEntry,
  moveEntry,
  createFolder,
  clearTenantToken,
  isWithinRoot,
} from "../services/dropboxService.js";
import { escanearTenantAhora, getEscaneoConfig, setEscaneoIntervalo, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES } from "../services/estadoDropboxCronService.js";
import { diagnosticoCarpetas } from "../utils/estadoCarpetas.js";
import { etiquetaProposito } from "../utils/propositosCarpeta.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/*
  Límite de la descarga masiva (ZIP): el PESO, no la cantidad.
  
  Había además un tope de 50 archivos. Se sacó: no protegía de nada que el peso no cubriera ya —el ZIP
  se arma entero en memoria, así que lo que puede tumbar al server son los bytes— y en cambio frenaba
  el caso normal, bajar la carpeta de un mes completa (129 altas de ~280 KB son 36 MB, holgadamente
  adentro del tope). Partir la descarga en tres tandas de 50 no hacía el server más seguro; hacía el
  trabajo más largo.
  
  El peso sí se sigue mirando, y se corta apenas se pasa: los archivos se bajan de a uno y el
  acumulado se chequea en cada vuelta, así que una selección enorme se rechaza sin llegar a juntarla
  entera en memoria.
*/
const ZIP_MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200 MB descomprimidos

router.use(requireTenant, authenticateToken);

const isAdmin = (req: AuthenticatedRequest) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));

/**
 * Traduce errores de Dropbox a algo legible (cubre errores RPC, de OAuth y de contenido).
 *
 * El decodificado del Buffer no es cosmético. Las llamadas de contenido —`/files/download`— piden
 * `responseType: "arraybuffer"`, así que cuando Dropbox contesta un error, axios entrega el cuerpo
 * como Buffer y no como JSON: `error_summary` queda adentro, sin leer, y el mensaje se degradaba al
 * genérico de axios — «Request failed with status code 409», que no dice absolutamente nada. El
 * motivo real (`path/not_found`, `path/restricted_content`, …) estuvo siempre ahí.
 */
function dropboxError(res: any, error: any) {
  let dbx = error?.response?.data;
  if (Buffer.isBuffer(dbx) || dbx instanceof ArrayBuffer) {
    const txt = Buffer.from(dbx as any).toString("utf8");
    try {
      dbx = JSON.parse(txt);
    } catch {
      dbx = txt;
    }
  }
  const oauth = dbx?.error_description || (typeof dbx?.error === "string" ? dbx.error : "");
  const summary = dbx?.error_summary || oauth || (typeof dbx === "string" ? dbx : "") || error?.message || "Error de Dropbox";
  // Pista para el error más común: pegar un access token en vez de un refresh token.
  const hint = oauth === "invalid_grant" ? " (¿el refresh token es válido y de tipo offline? no un access token)" : oauth === "invalid_client" ? " (revisá App key / App secret)" : "";
  const archivo = error?.__archivo ? ` — al bajar «${error.__archivo}»` : "";
  console.error("[Dropbox]", summary, archivo, JSON.stringify(dbx || {}));
  res.status(400).json({ error: `Dropbox: ${summary}${archivo}${hint}` });
}

// GET /dropbox/status - ¿está conectado este tenant?
router.get("/status", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const d = (tenant as any)?.integrations?.dropbox;
    const connected = !!(d?.appKey && d?.appSecretEnc && d?.refreshTokenEnc);
    res.json({
      connected,
      rootPath: d?.rootPath || "/HelloSign",
      accountEmail: d?.accountEmail || null,
      connectedAt: d?.connectedAt || null,
      canManageConnection: isAdmin(req),
    });
  } catch (error) {
    console.error("Dropbox status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /dropbox/connect - guarda credenciales (solo admin), validándolas contra Dropbox
router.post("/connect", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede conectar Dropbox." });
      return;
    }
    const { appKey, appSecret, refreshToken, rootPath } = req.body || {};
    if (!appKey || !appSecret || !refreshToken) {
      res.status(400).json({ error: "Faltan credenciales: appKey, appSecret y refreshToken son obligatorios." });
      return;
    }
    let root = String(rootPath || "/HelloSign").trim();
    if (!root.startsWith("/")) root = "/" + root;
    if (root.length > 1 && root.endsWith("/")) root = root.slice(0, -1);

    // Validar contra Dropbox antes de guardar.
    const cfg = { appKey: String(appKey), appSecret: String(appSecret), refreshToken: String(refreshToken), rootPath: root };
    let account: { email?: string; name?: string; accountId?: string };
    try {
      account = await verifyAccount(String(req.tenantObjectId), cfg);
    } catch (e) {
      dropboxError(res, e);
      return;
    }

    await Tenant.updateOne(
      { _id: req.tenantObjectId },
      {
        $set: {
          "integrations.dropbox.appKey": String(appKey),
          "integrations.dropbox.appSecretEnc": encryptSecret(String(appSecret)),
          "integrations.dropbox.refreshTokenEnc": encryptSecret(String(refreshToken)),
          "integrations.dropbox.rootPath": root,
          "integrations.dropbox.accountEmail": account.email || null,
          // Sin esto, una notificación del webhook no se puede atribuir a ningún tenant: la
          // notificación trae el account_id y nada más. Ver `dropboxWebhookService.ts`.
          "integrations.dropbox.accountId": account.accountId || null,
          "integrations.dropbox.connectedAt": new Date(),
        },
      },
    );
    clearTenantToken(String(req.tenantObjectId));
    res.json({ connected: true, rootPath: root, accountEmail: account.email || null, connectedAt: new Date() });
  } catch (error) {
    console.error("Dropbox connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /dropbox/disconnect - borra las credenciales del tenant (solo admin)
router.post("/disconnect", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede desconectar Dropbox." });
      return;
    }
    await Tenant.updateOne({ _id: req.tenantObjectId }, { $unset: { "integrations.dropbox": "" } });
    clearTenantToken(String(req.tenantObjectId));
    res.json({ connected: false });
  } catch (error) {
    console.error("Dropbox disconnect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper: carga tenant + config (o responde 400 si no está conectado).
async function requireConfig(req: AuthenticatedRequest & TenantRequest, res: any) {
  const tenant = await Tenant.findById(req.tenantObjectId).lean();
  const cfg = getTenantDropboxConfig(tenant);
  if (!cfg) {
    res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
    return null;
  }
  return cfg;
}

// GET /dropbox/list?path=&full= - lista una carpeta (por defecto, el rootPath). Con full=1, ignora el
// límite del rootPath y navega desde una raíz más amplia (p. ej. para elegir una carpeta de "Transición
// automática" que viva fuera del subárbol de rootPath, como una carpeta "AFIP" separada de "HelloSign").
router.get("/list", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    const path = String(req.query.path || "");
    const full = req.query.full === "1" || req.query.full === "true";
    if (path && !full && !isWithinRoot(cfg, path)) {
      res.status(403).json({ error: "Ruta fuera de la carpeta permitida." });
      return;
    }
    const result = await listFolder(String(req.tenantObjectId), cfg, path, full);
    res.json({ ...result, rootPath: cfg.rootPath });
  } catch (error) {
    dropboxError(res, error);
  }
});

// GET /dropbox/temp-link?path=&full= - link temporal para descargar/previsualizar. Con full=1, permite
// una ruta fuera del rootPath (p. ej. la carpeta AFIP) — igual que /list, /upload, /create-folder, etc.
router.get("/temp-link", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    const path = String(req.query.path || "");
    const id = String(req.query.id || "");
    const full = req.query.full === "1" || req.query.full === "true";
    if (!path || (!full && !isWithinRoot(cfg, path))) {
      res.status(403).json({ error: "Ruta inválida." });
      return;
    }
    // Mismo criterio que el ZIP: se valida con el path (es lo único que dice dónde vive el archivo) y
    // se le pide a Dropbox por id, que no depende de cómo se llame.
    const link = await getTemporaryLink(String(req.tenantObjectId), cfg, id ? (id.startsWith("id:") ? id : `id:${id}`) : path);
    res.json({ link });
  } catch (error) {
    dropboxError(res, error);
  }
});

// POST /dropbox/download-zip { paths: string[], full? } - baja varios archivos y los devuelve como un
// único ZIP. Con full=true, permite rutas fuera del rootPath (ver /temp-link).
router.post("/download-zip", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;

    const full = !!req.body?.full;
    /*
      El front manda `items` con el path Y el id de cada archivo. Los dos hacen falta, para cosas
      distintas: el PATH es lo único que dice dónde vive el archivo, así que es con lo que se valida
      que la selección no se salga de la carpeta permitida (y de ahí sale el nombre dentro del ZIP);
      el ID es con lo que se le pide a Dropbox, porque no depende de cómo se llame el archivo.

      `paths` sigue aceptándose para la ventana de deploy: el front (Vercel) y el server (VPS) se
      publican por separado, así que un server nuevo puede recibir un rato pedidos de un front viejo.
    */
    const crudos: Array<{ path: string; id?: string }> = Array.isArray(req.body?.items)
      ? req.body.items.map((i: any) => ({ path: String(i?.path || ""), id: i?.id ? String(i.id) : undefined }))
      : (Array.isArray(req.body?.paths) ? req.body.paths : []).map((p: any) => ({ path: String(p || "") }));

    // Normaliza y deduplica por path.
    const porPath = new Map<string, { path: string; id?: string }>();
    for (const it of crudos) if (it.path) porPath.set(it.path, it);
    const items = [...porPath.values()];
    const paths = items.map((i) => i.path);
    if (items.length === 0) {
      res.status(400).json({ error: "No se seleccionó ningún archivo." });
      return;
    }
    if (!full && paths.some((p) => !isWithinRoot(cfg, p))) {
      res.status(403).json({ error: "Alguna ruta está fuera de la carpeta permitida." });
      return;
    }

    /*
      Se bajan de a ZIP_CONCURRENCIA en paralelo, no de a uno.

      En secuencia, cada archivo paga su ida y vuelta completa a Dropbox: 34 PDF tardaban más de un
      minuto y el pedido moría por timeout del cliente ANTES de que el ZIP estuviera armado —el
      trabajo se hacía entero y se tiraba a la basura—. De a 5, el mismo lote entra en una fracción
      del tiempo. Cinco y no cincuenta: Dropbox limita por app y una ráfaga grande devuelve 429, que
      es cambiar una espera larga por un error.
    */
    const ZIP_CONCURRENCIA = 5;
    const buffers: Buffer[] = new Array(items.length);
    for (let i = 0; i < items.length; i += ZIP_CONCURRENCIA) {
      const tanda = items.slice(i, i + ZIP_CONCURRENCIA);
      await Promise.all(
        tanda.map(async (item, n) => {
          /*
            Se pide POR ID cuando lo hay: `id:AbC123…` es un identificador opaco y ASCII, así que el
            archivo se baja igual se llame como se llame. Pedirlo por path lo ataba al texto del
            nombre —acentos, puntos suspensivos, la forma Unicode con la que quedó guardado— y
            cualquier diferencia ahí daba `path/not_found` sobre un archivo que estaba a la vista.

            El path queda de respaldo por si algún día una entrada llega sin id.
          */
          const referencia = item.id ? (item.id.startsWith("id:") ? item.id : `id:${item.id}`) : item.path;
          try {
            buffers[i + n] = await downloadFileContent(String(req.tenantObjectId), cfg, referencia);
          } catch (e: any) {
            // Qué archivo falló, no solo que "falló". Con 34 seleccionados, un error sin nombre deja
            // al operador sin nada que hacer salvo probar de a uno hasta encontrarlo.
            (e as any).__archivo = item.path.split("/").pop() || item.path;
            throw e;
          }
        }),
      );
    }

    const zip = new PizZip();
    const used = new Map<string, number>(); // evita colisiones de nombre en el ZIP
    let total = 0;
    // El ZIP se arma en el orden original, que es el de la lista que el operador vio.
    for (let i = 0; i < items.length; i++) {
      const p = items[i].path;
      const buf = buffers[i];
      total += buf.length;
      if (total > ZIP_MAX_TOTAL_BYTES) {
        res.status(400).json({ error: `La selección supera el máximo de ${Math.round(ZIP_MAX_TOTAL_BYTES / 1024 / 1024)} MB. Elegí menos archivos (no hay tope de cantidad: lo que se mide es el peso).` });
        return;
      }
      let name = p.split("/").pop() || "archivo";
      const seen = used.get(name) || 0;
      used.set(name, seen + 1);
      if (seen > 0) {
        const dot = name.lastIndexOf(".");
        name = dot > 0 ? `${name.slice(0, dot)} (${seen})${name.slice(dot)}` : `${name} (${seen})`;
      }
      zip.file(name, buf);
    }

    const out = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="documentos_${stamp}.zip"`);
    res.setHeader("Content-Length", out.length);
    res.end(out);
  } catch (error) {
    dropboxError(res, error);
  }
});

// POST /dropbox/upload (multipart: file + path=carpeta destino + full=)
router.post("/upload", upload.single("file"), async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    if (!req.file) {
      res.status(400).json({ error: "No se recibió ningún archivo." });
      return;
    }
    const full = req.body?.full === "1" || req.body?.full === "true";
    const folder = String((req.body?.path as string) || cfg.rootPath);
    if (!full && !isWithinRoot(cfg, folder)) {
      res.status(403).json({ error: "Ruta fuera de la carpeta permitida." });
      return;
    }
    const dest = `${folder.replace(/\/$/, "")}/${req.file.originalname}`;
    const entry = await uploadFile(String(req.tenantObjectId), cfg, dest, req.file.buffer);
    res.json(entry);
  } catch (error) {
    dropboxError(res, error);
  }
});

// POST /dropbox/create-folder { path, full? }
router.post("/create-folder", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    const full = !!req.body?.full;
    const path = String(req.body?.path || "");
    if (!path || (!full && !isWithinRoot(cfg, path))) {
      res.status(403).json({ error: "Ruta inválida." });
      return;
    }
    const entry = await createFolder(String(req.tenantObjectId), cfg, path);
    res.json(entry);
  } catch (error) {
    dropboxError(res, error);
  }
});

// POST /dropbox/move { fromPath, toPath, full? } (renombrar o mover)
router.post("/move", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    const full = !!req.body?.full;
    const fromPath = String(req.body?.fromPath || "");
    const toPath = String(req.body?.toPath || "");
    if (!fromPath || !toPath || (!full && (!isWithinRoot(cfg, fromPath) || !isWithinRoot(cfg, toPath)))) {
      res.status(403).json({ error: "Ruta inválida." });
      return;
    }
    const entry = await moveEntry(String(req.tenantObjectId), cfg, fromPath, toPath);
    res.json(entry);
  } catch (error) {
    dropboxError(res, error);
  }
});

// DELETE /dropbox/delete { path, full? }
router.delete("/delete", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const cfg = await requireConfig(req, res);
    if (!cfg) return;
    const full = !!req.body?.full;
    const path = String(req.body?.path || req.query?.path || "");
    if (!path || (!full && !isWithinRoot(cfg, path))) {
      res.status(403).json({ error: "Ruta inválida." });
      return;
    }
    await deleteEntry(String(req.tenantObjectId), cfg, path);
    res.json({ ok: true });
  } catch (error) {
    dropboxError(res, error);
  }
});

// POST /dropbox/estado-scan/trigger - fuerza ya mismo el escaneo de transición automática de ESTE
// tenant (solo admin), en vez de esperar la corrida periódica del cron (según su intervalo configurado).
router.post("/estado-scan/trigger", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede forzar el escaneo." });
      return;
    }
    const resultado = await escanearTenantAhora(String(req.tenantObjectId));
    if (resultado.enCurso) {
      res.status(409).json({ error: "Ya hay un escaneo en curso. Esperá a que termine e intentá de nuevo." });
      return;
    }
    if (resultado.error === "dropbox_no_conectado") {
      res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
      return;
    }
    if (resultado.error === "sin_transiciones_configuradas") {
      res.status(400).json({ error: "No hay ninguna transición automática configurada todavía." });
      return;
    }
    res.json({ estadosEscaneados: resultado.estadosEscaneados, transicionesAplicadas: resultado.transicionesAplicadas });
  } catch (error) {
    dropboxError(res, error);
  }
});

/**
 * GET /dropbox/diagnostico-carpetas — el síntoma que hoy no existe.
 *
 * Hasta acá, una carpeta que no se podía resolver NO producía ningún síntoma: el escaneo pasaba de
 * largo y el problema aparecía semanas después como «los contratos dejaron de avanzar». Esto lo hace
 * visible en la misma pantalla donde se ve la última lectura.
 *
 * Dice tres cosas distintas por propósito:
 *   proposito     resolvió por el propósito cargado. Sobrevive a que renombren la carpeta.
 *   patron        resolvió POR EL NOMBRE. Anda hoy y se rompe el día que la renombren.
 *   derivada      la ruta se dedujo; puede no existir y no está vigilada por el cron.
 *   no_resuelta   nadie la va a encontrar. Esa función no se puede usar.
 *
 * Y para cada una, si la ruta EXISTE en el Dropbox de este tenant. Son cosas independientes: se
 * puede resolver perfecto una ruta que no existe.
 *
 * NO bloquea nada: que falte un propósito puede ser legítimo — un tenant puede no usar esa función.
 */
router.get("/diagnostico-carpetas", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const diag = await diagnosticoCarpetas();
    const cfg = getTenantDropboxConfig(await Tenant.findById(req.tenantObjectId).lean());
    const out = [];
    for (const d of diag) {
      let existe: boolean | null = null;
      let motivo = "";
      if (cfg && d.carpeta) {
        try {
          await listFolder(String(req.tenantObjectId), cfg, d.carpeta, true);
          existe = true;
        } catch (e: any) {
          existe = false;
          motivo = e?.response?.data?.error_summary || e?.message || "no se pudo leer";
        }
      }
      out.push({ ...d, etiqueta: etiquetaProposito(d.proposito), existe, motivo });
    }
    res.json({ carpetas: out, dropboxConectado: !!cfg });
  } catch (error) {
    dropboxError(res, error);
  }
});

// GET /dropbox/estado-scan/config - intervalo configurado + cuándo fue el último escaneo / cuándo es
// el próximo, para mostrar la cuenta regresiva en la UI.
router.get("/estado-scan/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const config = await getEscaneoConfig(String(req.tenantObjectId));
    res.json(config);
  } catch (error) {
    dropboxError(res, error);
  }
});

// PATCH /dropbox/estado-scan/config { intervalMinutos } - cambia cada cuánto se revisan las carpetas
// vigiladas (solo admin).
router.patch("/estado-scan/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede cambiar el intervalo de escaneo." });
      return;
    }
    const intervalMinutos = Number(req.body?.intervalMinutos);
    if (!Number.isFinite(intervalMinutos)) {
      res.status(400).json({ error: "intervalMinutos inválido." });
      return;
    }
    if (intervalMinutos < MIN_INTERVAL_MINUTES || intervalMinutos > MAX_INTERVAL_MINUTES) {
      res.status(400).json({ error: `El intervalo tiene que estar entre ${MIN_INTERVAL_MINUTES} y ${MAX_INTERVAL_MINUTES} minutos.` });
      return;
    }
    const config = await setEscaneoIntervalo(String(req.tenantObjectId), intervalMinutos);
    res.json(config);
  } catch (error) {
    dropboxError(res, error);
  }
});

export { router as dropboxRoutes };
