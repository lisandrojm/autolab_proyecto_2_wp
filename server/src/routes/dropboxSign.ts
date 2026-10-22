import { Router } from "express";
import { z } from "zod";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { Tenant } from "../models/Tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import { leerCasillaDropboxSign, registrarLectura } from "../services/dropboxSignMailService.js";
import { armarCola, arrancarCorridaEnvio, configDelTenant, corridaEnvioDe, desencolar, detenerCorridaEnvio, enSecoForzado, encolar, estadoDeArchivos } from "../services/dropboxSignBot/corridaEnvio.js";
import { cupoDelDia, fechaYHoraArgentina, puedeCorrer } from "../services/dropboxSignBot/planificador.js";
import { DropboxSignEnvio } from "../models/DropboxSignEnvio.js";
import { DropboxSignEnvioLog } from "../models/DropboxSignEnvioLog.js";
import { guardarReglasDelTenant, reglasDelTenant } from "../services/dropboxSignBot/reglasTenant.js";
import { arrancarVerificacion, detenerVerificacion, previsualizarColocacion, verificacionDe, type AlcanceVerificacion } from "../services/dropboxSignBot/colocacion.js";
import { REGLAS_BASE, TIPOS_ANCLA } from "../compartido/reglasColocacionFirma.js";

/**
 * Configuración de "DropboxSign | Firmas": la casilla de correo que recibe las copias de
 * "documento enviado" de Dropbox Sign.
 *
 * Para qué sirve: Dropbox Sign no avisa por API (en el plan actual) qué contratos ya se enviaron a
 * firmar, pero sí manda una copia por mail de cada envío. Leyendo esa casilla se puede detectar el
 * envío y mover el archivo de "Outbox" a "Pendbox", que es lo que separa la bandeja "Para Firmar"
 * de "Pendiente de firma" y evita que un contrato se mande a firmar dos veces.
 *
 * Acá solo se guarda la configuración. La lectura de la casilla es un job aparte, que no corre
 * mientras `enabled` esté en false.
 */
const router = Router();
router.use(requireTenant, authenticateToken);

const isAdmin = (req: AuthenticatedRequest): boolean => !!req.user?.roles?.some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));

const configSchema = z.object({
  email: z.string().email("El correo no es válido"),
  imapHost: z.string().min(1, "Falta el servidor IMAP"),
  imapPort: z.number().int().min(1).max(65535).optional(),
  imapSecure: z.boolean().optional(),
  imapUser: z.string().optional(),
  /** Solo se manda cuando se quiere cambiar: si viene vacía, se conserva la guardada. */
  imapPassword: z.string().optional(),
  enabled: z.boolean().optional(),
});

/** GET /dropbox-sign/config - configuración actual. La contraseña NUNCA se devuelve. */
router.get("/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).select("integrations.dropboxSign").lean();
    const cfg: any = (tenant as any)?.integrations?.dropboxSign || {};
    res.json({
      email: cfg.email || "",
      imapHost: cfg.imapHost || "",
      imapPort: cfg.imapPort ?? 993,
      imapSecure: cfg.imapSecure ?? true,
      imapUser: cfg.imapUser || "",
      // No se devuelve la contraseña: solo si hay una guardada, para que la UI no la pida de nuevo.
      tienePassword: !!cfg.imapPasswordEnc,
      enabled: !!cfg.enabled,
      configuredAt: cfg.configuredAt || null,
      lastCheckAt: cfg.lastCheckAt || null,
      lastCheckOk: cfg.lastCheckOk ?? null,
      lastCheckDetalle: cfg.lastCheckDetalle || "",
      lastCheckHistorial: cfg.lastCheckHistorial || [],
    });
  } catch (error) {
    console.error("Dropbox Sign config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/** PUT /dropbox-sign/config - guarda la configuración (solo admin). */
router.put("/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede configurar Dropbox Sign." });
      return;
    }
    const parsed = configSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
      return;
    }
    const data = parsed.data;

    const set: any = {
      "integrations.dropboxSign.email": data.email.trim(),
      "integrations.dropboxSign.imapHost": data.imapHost.trim(),
      "integrations.dropboxSign.imapPort": data.imapPort ?? 993,
      "integrations.dropboxSign.imapSecure": data.imapSecure ?? true,
      "integrations.dropboxSign.imapUser": (data.imapUser || data.email).trim(),
      "integrations.dropboxSign.enabled": !!data.enabled,
      "integrations.dropboxSign.configuredAt": new Date(),
    };
    // La contraseña solo se pisa si mandaron una nueva (la UI no la trae de vuelta).
    if (data.imapPassword) set["integrations.dropboxSign.imapPasswordEnc"] = encryptSecret(data.imapPassword);

    const tenant = await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: set }, { new: true }).select("integrations.dropboxSign").lean();
    const cfg: any = (tenant as any)?.integrations?.dropboxSign || {};

    // No se puede habilitar la lectura sin contraseña: quedaría prendida sin poder conectarse.
    if (cfg.enabled && !cfg.imapPasswordEnc) {
      await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: { "integrations.dropboxSign.enabled": false } });
      res.status(400).json({ error: "Para activar la lectura hay que cargar la contraseña de la casilla." });
      return;
    }

    res.json({ ok: true, tienePassword: !!cfg.imapPasswordEnc, enabled: !!cfg.enabled });
  } catch (error) {
    console.error("Dropbox Sign save config error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /dropbox-sign/leer - corre la lectura de la casilla ahora mismo (solo admin).
 * `prueba: true` solo verifica la conexión y cuenta los avisos, sin escribir nada en Dropbox.
 */
router.post("/leer", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede leer la casilla." });
      return;
    }
    const soloPrueba = req.body?.prueba === true;
    const r = await leerCasillaDropboxSign(String(req.tenantObjectId), soloPrueba);
    // El resultado queda registrado para poder verlo después desde la configuración.
    if (!soloPrueba) {
      await Tenant.findByIdAndUpdate(req.tenantObjectId, registrarLectura(r));
    }
    res.json(r);
  } catch (error: any) {
    console.error("Dropbox Sign leer error:", error);
    res.status(500).json({ error: error?.message || "No se pudo leer la casilla." });
  }
});

/*
  ═════════════════════════════ EL BOT DE ENVÍO A LA FIRMA ═════════════════════════════
  Ver `services/dropboxSignBot/`. Credenciales y sesión cifradas: nunca vuelven al navegador.
*/
const BOT = "integrations.dropboxSign.bot";

const botConfigSchema = z.object({
  loginEmail: z.string().email("El usuario de Dropbox Sign no es un correo válido").optional(),
  /** Sólo se manda cuando se quiere cambiar. */
  loginPassword: z.string().optional(),
  envio: z
    .object({
      activo: z.boolean().optional(),
      tamanoTanda: z.number().int().min(1).max(50).optional(),
      intervaloHoras: z.number().min(0.5).max(48).optional(),
      topeDiario: z.number().int().min(1).max(60).optional(),
      enfriamientoHoras: z.number().min(1).max(48).optional(),
      horaDesde: z.number().int().min(0).max(23).optional(),
      horaHasta: z.number().int().min(1).max(24).optional(),
    })
    .optional(),
});

/** Lo que la UI puede ver de la configuración del bot: sin contraseña ni sesión. */
async function configDelBotParaUi(tenantId: string) {
  const { config, estado, cc, bot } = await configDelTenant(tenantId);
  const corrida = corridaEnvioDe(tenantId);
  const ahora = new Date();
  const puede = puedeCorrer(config, estado, ahora);
  return {
    loginEmail: bot.loginEmail || "",
    tienePassword: !!bot.loginPasswordEnc,
    tieneSesion: !!bot.sesionEnc,
    sesionGuardadaAt: bot.sesionGuardadaAt || null,
    ultimoLoginAt: bot.ultimoLoginAt || null,
    cc,
    envio: config,
    enviadosHoy: estado.contadorDia.fecha === fechaYHoraArgentina(ahora).fecha ? estado.contadorDia.enviados : 0,
    cupoHoy: cupoDelDia(config, estado, ahora),
    enfriadoHasta: estado.enfriadoHasta,
    ultimaCorridaAt: estado.ultimaCorridaAt,
    ultimaCorrida: bot.ultimaCorrida || null,
    ultimoError: bot.ultimoError || null,
    proximaCorrida: puede.ok ? "Le toca en el próximo minuto del scheduler." : puede.motivo || "",
    corriendo: !!corrida && !corrida.terminada,
    enSecoForzado: enSecoForzado(),
  };
}

router.get("/bot/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    res.json(await configDelBotParaUi(String(req.tenantObjectId)));
  } catch (error: any) {
    console.error("Dropbox Sign bot config error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

router.put("/bot/config", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede configurar el envío automático." });
    const parsed = botConfigSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || "Datos inválidos" });
    const d = parsed.data;
    const set: any = {};
    if (d.loginEmail !== undefined) set[`${BOT}.loginEmail`] = d.loginEmail.trim();
    if (d.loginPassword) set[`${BOT}.loginPasswordEnc`] = encryptSecret(d.loginPassword);
    for (const [k, v] of Object.entries(d.envio || {})) if (v !== undefined) set[`${BOT}.envio.${k}`] = v;
    if (d.envio?.horaDesde !== undefined && d.envio?.horaHasta !== undefined && d.envio.horaDesde >= d.envio.horaHasta) return res.status(400).json({ error: "La ventana horaria tiene que empezar antes de terminar." });
    if (Object.keys(set).length) await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: set });
    const cfg = await configDelBotParaUi(String(req.tenantObjectId));
    // Activar sin sesión ni credenciales dejaría el scheduler fallando cada intervalo: se apaga y se avisa.
    if (cfg.envio.activo && !cfg.tieneSesion && !cfg.tienePassword) {
      await Tenant.findByIdAndUpdate(req.tenantObjectId, { $set: { [`${BOT}.envio.activo`]: false } });
      return res.status(400).json({ error: "Para activar el envío automático hace falta la sesión de Dropbox Sign (login manual) o usuario y contraseña." });
    }
    res.json({ ok: true, ...cfg });
  } catch (error: any) {
    console.error("Dropbox Sign bot save error:", error);
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

/** GET /bot/cola — qué enviaría la próxima tanda (lee el Outbox; no envía nada). */
router.get("/bot/cola", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    res.json(await armarCola(String(req.tenantObjectId), { manual: true }));
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "No se pudo armar la cola." });
  }
});

/*
  LA COLA, desde el tab «Para Firmar» (22/10/2026): nada se envía si no fue encolado.
*/
/** POST /bot/encolar {archivos: string[]} | {todosElegibles: true} → {encolados, rechazados, porMotivo}. */
router.post("/bot/encolar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede encolar envíos a la firma." });
    const parsed = z.object({ archivos: z.array(z.string().min(1)).max(2000).optional(), todosElegibles: z.boolean().optional() }).safeParse(req.body || {});
    if (!parsed.success || (!parsed.data.todosElegibles && !parsed.data.archivos?.length)) return res.status(400).json({ error: "Indicá qué archivos encolar." });
    res.json(await encolar(String(req.tenantObjectId), req.user?.userId, parsed.data));
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "No se pudo encolar." });
  }
});

/** POST /bot/desencolar {codigos: string[]} — sólo saca lo que está `en_cola`. */
router.post("/bot/desencolar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede quitar de la cola." });
    const parsed = z.object({ codigos: z.array(z.string().min(1)).min(1).max(2000) }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Indicá qué códigos quitar." });
    res.json(await desencolar(String(req.tenantObjectId), parsed.data.codigos));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "No se pudo quitar de la cola." });
  }
});

/** POST /bot/estado-archivos {archivos: string[]} — el estado de cada archivo del listado (una query, sin Dropbox). */
router.post("/bot/estado-archivos", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = z.object({ archivos: z.array(z.string()).max(5000) }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: "Datos inválidos" });
    res.json(await estadoDeArchivos(String(req.tenantObjectId), parsed.data.archivos));
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

/** POST /bot/corrida — enviar una tanda ahora (solo admin). `enSeco: true` recorre todo sin enviar. */
router.post("/bot/corrida", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede enviar a firmar." });
    const r = await arrancarCorridaEnvio(String(req.tenantObjectId), { automatica: false, enSeco: req.body?.enSeco === true });
    res.json({ arrancada: true, ...r });
  } catch (error: any) {
    res.status(error?.status || 400).json({ error: error?.message || "No se pudo arrancar la corrida." });
  }
});

router.post("/bot/corrida/detener", async (req: AuthenticatedRequest & TenantRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede detener la corrida." });
  const r = detenerCorridaEnvio(String(req.tenantObjectId));
  res.status(r.ok ? 200 : 409).json(r);
});

/** GET /bot/corrida — estado de la corrida en curso (o la última), para el polling de la UI. */
router.get("/bot/corrida", async (req: AuthenticatedRequest & TenantRequest, res) => {
  const tenantId = String(req.tenantObjectId);
  const c = corridaEnvioDe(tenantId);
  if (!c) return res.json({ hay: false, corriendo: false, eventos: [], enSecoForzado: enSecoForzado() });
  res.json({ hay: true, corriendo: !c.terminada, enSeco: c.enSeco, automatica: c.automatica, arrancadaEl: c.arrancadaEl, total: c.total, enviados: c.enviados, errores: c.errores, limite: c.limite, irreversible: c.irreversible, detenerPedido: c.señal.cortada, eventos: c.eventos, lineas: c.lineas, enSecoForzado: enSecoForzado() });
});

/** GET /bot/logs — las últimas 50 corridas (solo admin). Sin la captura, que pesa: va por id. */
router.get("/bot/logs", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede ver los logs." });
    const logs = await DropboxSignEnvioLog.find({ tenantId: req.tenantObjectId }).select("-capturaError").sort({ createdAt: -1 }).limit(50).lean();
    const revision = await DropboxSignEnvio.find({ tenantId: req.tenantObjectId, estado: { $in: ["requiere_revision", "error", "limite"] } }).sort({ updatedAt: -1 }).limit(200).lean();
    res.json({ logs, requierenRevision: revision });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

router.get("/bot/logs/:id/captura", async (req: AuthenticatedRequest & TenantRequest, res) => {
  const log: any = await DropboxSignEnvioLog.findOne({ _id: req.params.id, tenantId: req.tenantObjectId }).select("capturaError").lean().catch(() => null);
  if (!log?.capturaError) return res.status(404).json({ error: "Esa corrida no tiene captura." });
  res.setHeader("Content-Type", "image/png");
  res.send(Buffer.from(log.capturaError, "base64"));
});

/*
  ═══════════ REGLAS DE COLOCACIÓN DE LA FIRMA Y SU VERIFICACIÓN VISUAL (22/10/2026) ═══════════
  Ver `compartido/reglasColocacionFirma.ts` (las reglas) y `services/dropboxSignBot/colocacion.ts`
  (la detección fuera del navegador, la previsualización y «Verificar todos»).
*/

/** GET /bot/reglas — las reglas vigentes del tenant (editadas o el catálogo), más el catálogo de fábrica. */
router.get("/bot/reglas", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const r = await reglasDelTenant(String(req.tenantObjectId));
    res.json({ ...r, catalogo: REGLAS_BASE, tiposAncla: TIPOS_ANCLA });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

/** PUT /bot/reglas {reglas: [...]} guarda la lista entera (validada); {restaurar: true} vuelve al catálogo. */
router.put("/bot/reglas", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede editar las reglas de colocación." });
    const r = req.body?.restaurar === true ? await guardarReglasDelTenant(String(req.tenantObjectId), null) : await guardarReglasDelTenant(String(req.tenantObjectId), req.body?.reglas);
    res.json({ ok: true, ...r, catalogo: REGLAS_BASE, tiposAncla: TIPOS_ANCLA });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "No se pudieron guardar las reglas." });
  }
});

/** POST /bot/colocacion/previsualizar {archivo} — la detección más la página renderizada (base64) para dibujar encima. Baja el PDF del Outbox. */
router.post("/bot/colocacion/previsualizar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede previsualizar la colocación." });
    const archivo = String(req.body?.archivo || "").trim();
    if (!archivo) return res.status(400).json({ error: "Indicá el archivo." });
    res.json(await previsualizarColocacion(String(req.tenantObjectId), archivo));
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "No se pudo previsualizar." });
  }
});

/** POST /bot/colocacion/verificar-todos {alcance} — corre la detección en seco en segundo plano; se sigue con GET /bot/colocacion/verificacion. */
router.post("/bot/colocacion/verificar-todos", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede verificar la colocación." });
    const alcance = (["cola", "revision", "cola_y_revision", "outbox"].includes(req.body?.alcance) ? req.body.alcance : "cola_y_revision") as AlcanceVerificacion;
    res.json({ arrancada: true, ...(await arrancarVerificacion(String(req.tenantObjectId), alcance)) });
  } catch (error: any) {
    res.status(error?.status || 500).json({ error: error?.message || "No se pudo arrancar la verificación." });
  }
});

router.get("/bot/colocacion/verificacion", async (req: AuthenticatedRequest & TenantRequest, res) => {
  const v = verificacionDe(String(req.tenantObjectId));
  if (!v) return res.json({ hay: false, corriendo: false });
  res.json({ hay: true, corriendo: !v.terminadaEl, ...v });
});

router.post("/bot/colocacion/verificacion/detener", async (req: AuthenticatedRequest & TenantRequest, res) => {
  if (!isAdmin(req)) return res.status(403).json({ error: "Solo un administrador puede detener la verificación." });
  const r = detenerVerificacion(String(req.tenantObjectId));
  res.status(r.ok ? 200 : 409).json(r);
});

export { router as dropboxSignRoutes };
