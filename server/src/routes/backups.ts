import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant } from "../middleware/tenant.js";
import { correrBackup, backupEnCurso, CARPETA_BACKUPS, INTERVALO_HORAS_DEFAULT, RETENER_DEFAULT, INTERVALOS_VALIDOS } from "../services/backupService.js";
import { getTenantDropboxConfig, listFolder, downloadFileContent, getTemporaryLink } from "../services/dropboxService.js";
import { Tenant } from "../models/Tenant.js";
import { uriDeBackup, prefijoDeBase, esClusterAparte } from "../services/backupDestinoMongo.js";

/**
 * Forzar un backup a mano, sin esperar a la corrida de las 12 horas.
 *
 * Es para el momento de "voy a tocar algo grande y quiero una copia de AHORA": migrar datos, correr un
 * script de los que escriben, probar un import.
 */
const router = Router();

router.use(requireTenant, authenticateToken);

const isAdmin = (req: AuthenticatedRequest) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));

/**
 * GET /backups/config — lo que muestra la pantalla «MongoDB» de DDBB: cada cuánto se copia, cuántas
 * se conservan, cuándo fue la última y si la última falló.
 *
 * La configuración es de la BASE, que es una sola, así que se lee del mismo tenant que usa el
 * scheduler: el primero con Dropbox conectado.
 */
router.get("/config", async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Solo un administrador puede ver la configuración de los backups." });
    return;
  }
  const tenant: any = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 }).lean();
  const b = tenant?.integrations?.backup || {};

  /*
    Estado del segundo destino. Se informan tres casos distintos y no un booleano: «sin configurar» es
    una instalación que todavía no lo activó, y «mal configurado» es una URI que apunta a la base de la
    aplicación —que no sería un backup—. Nunca se devuelve la URI: solo el nombre de la base.
  */
  let mongoDestino: { estado: "ok" | "sin_configurar" | "error"; prefijo?: string; clusterAparte?: boolean; ultimaBase?: string; error?: string };
  try {
    const uri = uriDeBackup();
    mongoDestino = uri
      ? {
          estado: "ok",
          // El prefijo, no la base final: la base lleva la fecha y cambia con cada copia.
          prefijo: prefijoDeBase(String(process.env.MONGO_DB_NAME || "weprodu")),
          clusterAparte: esClusterAparte(),
          ultimaBase: b.ultimaBaseCopia || undefined,
        }
      : { estado: "sin_configurar" };
  } catch (e: any) {
    mongoDestino = { estado: "error", error: String(e?.message || e) };
  }

  res.json({
    mongoDestino,
    enCurso: backupEnCurso(),
    carpeta: CARPETA_BACKUPS,
    intervaloHoras: Number(b.intervaloHoras) || INTERVALO_HORAS_DEFAULT,
    retener: Number(b.retener) || RETENER_DEFAULT,
    ultimoBackupAt: b.ultimoBackupAt || null,
    ultimoError: b.ultimoError || null,
    intervalosValidos: INTERVALOS_VALIDOS,
    dropboxConectado: !!tenant,
  });
});

/**
 * PUT /backups/config — cambia frecuencia y retención.
 *
 * El scheduler lee esto en cada vuelta (cada 15 minutos), así que el cambio toma efecto sin reiniciar
 * el server. Se valida acá y no solo en el front: un intervalo de 0 dejaría el job corriendo sin parar
 * y una retención de 0 borraría todas las copias apenas suba la próxima.
 */
router.put("/config", async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Solo un administrador puede cambiar la configuración de los backups." });
    return;
  }
  const intervaloHoras = Number(req.body?.intervaloHoras);
  const retener = Number(req.body?.retener);

  if (!INTERVALOS_VALIDOS.includes(intervaloHoras as any)) {
    res.status(400).json({ error: `La frecuencia tiene que ser una de: ${INTERVALOS_VALIDOS.join(", ")} horas.` });
    return;
  }
  if (!Number.isInteger(retener) || retener < 1 || retener > 200) {
    res.status(400).json({ error: "La cantidad de copias a conservar tiene que ser un número entre 1 y 200." });
    return;
  }

  const tenant: any = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 });
  if (!tenant) {
    res.status(400).json({ error: "Dropbox no está conectado: no hay backups que configurar." });
    return;
  }
  await Tenant.updateOne({ _id: tenant._id }, { $set: { "integrations.backup.intervaloHoras": intervaloHoras, "integrations.backup.retener": retener } });
  res.json({ intervaloHoras, retener });
});

/**
 * POST /backups/ejecutar — corre un backup ahora y contesta cuando terminó.
 *
 * SOLO ADMIN: el backup lee la base entera, así que dispararlo es caro y quien lo hace tiene que poder
 * ver esos datos.
 *
 * Contesta recién al terminar, y no un 202 con "arrancó": quien aprieta el botón quiere saber si el
 * archivo QUEDÓ. Con la base grande esto puede tardar, así que el cliente manda un timeout largo.
 *
 * El 409 cuando ya hay uno en curso es la misma guarda que usa el scheduler: dos corridas juntas
 * dejarían dos carpetas del mismo momento y el doble de tráfico contra Dropbox.
 */
router.post("/ejecutar", async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Solo un administrador puede forzar un backup." });
    return;
  }
  if (backupEnCurso()) {
    res.status(409).json({ error: "Ya hay un backup en curso. Esperá a que termine." });
    return;
  }
  try {
    const resultado = await correrBackup("manual");
    if (!resultado) {
      res.status(400).json({ error: "Dropbox no está conectado: no hay dónde guardar el backup." });
      return;
    }
    res.json(resultado);
  } catch (error: any) {
    console.error("Backup manual falló:", error);
    res.status(500).json({ error: String(error?.message || "No se pudo generar el backup.") });
  }
});

/**
 * GET /backups/copias — el listado de la pestaña «DDBB Backup», con fecha y tamaño de cada copia.
 *
 * Dropbox NO devuelve el tamaño de una carpeta —solo el de los archivos—, así que la lista de carpetas
 * sola muestra un guion en esa columna. Los datos reales están adentro, en el `_backup.json` de cada
 * copia: la fecha en que se generó, cuántas colecciones tiene y cuántos bytes ocupa cada una.
 *
 * Por eso se lee un manifiesto por copia. Son archivos de pocos KB, y con 14 copias son 14 lecturas:
 * aceptable para una pantalla que se abre de a ratos. Una copia sin manifiesto se informa igual, marcada
 * como incompleta: es exactamente la señal de que la subida se cortó a la mitad.
 */
router.get("/copias", async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Solo un administrador puede ver las copias." });
    return;
  }
  try {
    const tenant: any = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 });
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!tenant || !cfg) {
      res.json({ copias: [], dropboxConectado: false });
      return;
    }
    const tenantId = String(tenant._id);
    const { entries } = await listFolder(tenantId, cfg, CARPETA_BACKUPS, true);
    const carpetas = entries.filter((e) => e.tag === "folder").sort((a, b) => b.name.localeCompare(a.name));

    const copias = await Promise.all(
      carpetas.map(async (c) => {
        try {
          const crudo = await downloadFileContent(tenantId, cfg, `${c.path}/_backup.json`);
          const m = JSON.parse(crudo.toString("utf8"));
          return {
            nombre: c.name,
            path: c.path,
            fecha: m.fecha || null,
            colecciones: Array.isArray(m.colecciones) ? m.colecciones.length : 0,
            documentos: Number(m.documentos) || 0,
            bytes: Array.isArray(m.colecciones) ? m.colecciones.reduce((a: number, x: any) => a + (Number(x.bytes) || 0), 0) : 0,
            completa: true,
          };
        } catch {
          // Sin manifiesto la copia está a medias: se muestra igual, para poder borrarla a conciencia.
          return { nombre: c.name, path: c.path, fecha: null, colecciones: 0, documentos: 0, bytes: 0, completa: false };
        }
      }),
    );

    res.json({ copias, dropboxConectado: true });
  } catch (error: any) {
    console.error("Listar copias falló:", error);
    res.status(500).json({ error: String(error?.message || "No se pudieron listar las copias.") });
  }
});

/**
 * GET /backups/copias/descargar?path=… — link temporal de Dropbox para bajar un archivo de una copia.
 *
 * El token NUNCA sale del servidor: se pide el link acá y al browser le llega solo la URL, que caduca.
 */
router.get("/copias/descargar", async (req: AuthenticatedRequest, res) => {
  if (!isAdmin(req)) {
    res.status(403).json({ error: "Solo un administrador puede descargar una copia." });
    return;
  }
  const path = String(req.query.path || "");
  if (!path.startsWith(CARPETA_BACKUPS + "/")) {
    // Sin esta comprobación, este endpoint sería un lector de toda la Dropbox del tenant.
    res.status(400).json({ error: "Ruta fuera de la carpeta de backups." });
    return;
  }
  try {
    const tenant: any = await Tenant.findOne({ "integrations.dropbox.refreshTokenEnc": { $exists: true } }).sort({ createdAt: 1 });
    const cfg = tenant ? getTenantDropboxConfig(tenant) : null;
    if (!cfg) {
      res.status(400).json({ error: "Dropbox no está conectado." });
      return;
    }
    res.json({ url: await getTemporaryLink(String(tenant._id), cfg, path) });
  } catch (error: any) {
    res.status(500).json({ error: String(error?.message || "No se pudo generar el link.") });
  }
});

export const backupRoutes = router;
