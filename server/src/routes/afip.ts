import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Info } from "../models/Info.js";
import { AfipLog } from "../models/AfipLog.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import { normalizarCuit, cuitEsValido } from "../utils/constanciaPdf.js";
import { buildDocFileName } from "../utils/employeeDocData.js";
import { resolverCarpetaPorPatron } from "../utils/estadoCarpetas.js";
import { getTenantAfipConfig, verificarCredenciales, verificarServicioPadron, consultarPadron, clearTenantTicket, getCertificadoInfo, Ambiente } from "../services/afipService.js";
import { getTenantDropboxConfig, uploadFile, getTemporaryLink, deleteEntry } from "../services/dropboxService.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const isAdmin = (req: AuthenticatedRequest) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));

// GET /afip/status - ¿está conectado este tenant?
router.get("/status", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const a = (tenant as any)?.integrations?.afip;
    const connected = !!getTenantAfipConfig(tenant);
    const certInfo = connected && a?.certificadoPem ? getCertificadoInfo(String(a.certificadoPem)) : null;
    res.json({
      connected,
      cuitRepresentada: a?.cuitRepresentada || null,
      ambiente: a?.ambiente || "homologacion",
      connectedAt: a?.connectedAt || null,
      certificadoAlias: certInfo?.alias || null,
      certificadoVencimiento: certInfo?.vencimiento || null,
      canManageConnection: isAdmin(req),
      // Resultado de la última autoconsulta contra Consulta Padrón A13 (no re-chequea en vivo acá:
      // sería un round-trip a AFIP con timeout de 20s en cada carga de página — se refresca al
      // conectar o con POST /afip/verificar-servicio).
      servicioPadronOk: a?.servicioPadronOk ?? null,
      servicioPadronEstado: a?.servicioPadronEstado ?? null,
      servicioPadronDetalle: a?.servicioPadronDetalle ?? null,
      servicioPadronFaultCode: a?.servicioPadronFaultCode ?? null,
      servicioPadronFaultString: a?.servicioPadronFaultString ?? null,
      servicioPadronVerificadoAt: a?.servicioPadronVerificadoAt ?? null,
    });
  } catch (error) {
    console.error("AFIP status error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /afip/logs - últimos llamados reales a AFIP (Consulta Padrón / autoconsulta de servicio),
// para diagnosticar sin depender de haber visto el toast en el momento (solo admin).
router.get("/logs", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede ver los logs de AFIP." });
      return;
    }
    const logs = await AfipLog.find({ tenantId: req.tenantObjectId }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ logs });
  } catch (error) {
    console.error("AFIP logs error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /afip/connect - guarda credenciales (solo admin), validándolas contra AFIP (WSAA) antes de guardar
router.post("/connect", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede conectar AFIP." });
      return;
    }
    const { cuitRepresentada, certificadoPem, clavePrivadaPem, ambiente } = req.body || {};
    const cuit = normalizarCuit(cuitRepresentada);
    if (!cuit || !certificadoPem || !clavePrivadaPem) {
      res.status(400).json({ error: "Faltan datos: CUIT representada, certificado y clave privada son obligatorios." });
      return;
    }
    const amb: Ambiente = ambiente === "produccion" ? "produccion" : "homologacion";

    const cfgInput = { cuitRepresentada: cuit, certificadoPem: String(certificadoPem), clavePrivadaPem: String(clavePrivadaPem), ambiente: amb };
    try {
      await verificarCredenciales(String(req.tenantObjectId), cfgInput);
    } catch (e: any) {
      res.status(400).json({ error: `No se pudo validar contra AFIP: ${e?.message || "credenciales inválidas"}` });
      return;
    }

    // El login WSAA (arriba) prueba que el certificado/clave son válidos, pero NO que el servicio
    // Consulta Padrón A13 esté autorizado para este certificado en AFIP — eso requiere una consulta
    // real, que se hace acá vía autoconsulta (ver verificarServicioPadron). No bloquea el guardado si
    // falla: el certificado es igual de válido, y el admin puede necesitar arreglar la autorización
    // del lado de AFIP sin tener que volver a pegar el certificado/clave.
    const verificacionServicio = await verificarServicioPadron(String(req.tenantObjectId), cfgInput);

    await Tenant.updateOne(
      { _id: req.tenantObjectId },
      {
        $set: {
          "integrations.afip.cuitRepresentada": cuit,
          "integrations.afip.certificadoPem": String(certificadoPem),
          "integrations.afip.clavePrivadaEnc": encryptSecret(String(clavePrivadaPem)),
          "integrations.afip.ambiente": amb,
          "integrations.afip.connectedAt": new Date(),
          "integrations.afip.servicioPadronOk": verificacionServicio.ok,
          "integrations.afip.servicioPadronEstado": verificacionServicio.estado,
          "integrations.afip.servicioPadronDetalle": verificacionServicio.detalle,
          "integrations.afip.servicioPadronFaultCode": verificacionServicio.faultCode || null,
          "integrations.afip.servicioPadronFaultString": verificacionServicio.faultString || null,
          "integrations.afip.servicioPadronVerificadoAt": verificacionServicio.verificadoAt,
        },
      },
    );
    res.json({
      connected: true,
      cuitRepresentada: cuit,
      ambiente: amb,
      connectedAt: new Date(),
      servicioPadronOk: verificacionServicio.ok,
      servicioPadronEstado: verificacionServicio.estado,
      servicioPadronDetalle: verificacionServicio.detalle,
    });
  } catch (error) {
    console.error("AFIP connect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /afip/disconnect - borra las credenciales del tenant (solo admin)
router.post("/disconnect", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede desconectar AFIP." });
      return;
    }
    await Tenant.updateOne({ _id: req.tenantObjectId }, { $unset: { "integrations.afip": "" } });
    clearTenantTicket(String(req.tenantObjectId));
    res.json({ connected: false });
  } catch (error) {
    console.error("AFIP disconnect error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /afip/verificar-servicio - re-corre la autoconsulta de prueba contra Padrón A13 con las
// credenciales YA guardadas (no hace falta re-pegar certificado/clave) — para revalidar después de
// arreglar la autorización del servicio en el Administrador de Relaciones de AFIP.
router.post("/verificar-servicio", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    if (!isAdmin(req)) {
      res.status(403).json({ error: "Solo un administrador puede revalidar el servicio de AFIP." });
      return;
    }
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg) {
      res.status(400).json({ error: "AFIP no está conectado para esta organización." });
      return;
    }
    const verificacion = await verificarServicioPadron(String(req.tenantObjectId), cfg);
    await Tenant.updateOne(
      { _id: req.tenantObjectId },
      {
        $set: {
          "integrations.afip.servicioPadronOk": verificacion.ok,
          "integrations.afip.servicioPadronEstado": verificacion.estado,
          "integrations.afip.servicioPadronDetalle": verificacion.detalle,
          "integrations.afip.servicioPadronFaultCode": verificacion.faultCode || null,
          "integrations.afip.servicioPadronFaultString": verificacion.faultString || null,
          "integrations.afip.servicioPadronVerificadoAt": verificacion.verificadoAt,
        },
      },
    );
    res.json(verificacion);
  } catch (error) {
    console.error("AFIP verificar-servicio error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /afip/constancia-link?projectId&userId&contractIndex - link temporal (Dropbox lo vence a las
// pocas horas, por eso se pide al vuelo en vez de guardar una URL fija) para ver el JSON archivado.
router.get("/constancia-link", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId, contractIndex } = req.query as { projectId?: string; userId?: string; contractIndex?: string };
    const idx = Number(contractIndex);
    if (!projectId || !userId || !Number.isInteger(idx)) {
      res.status(400).json({ error: "Faltan projectId/userId/contractIndex." });
      return;
    }
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const dropboxCfg = getTenantDropboxConfig(tenant);
    if (!dropboxCfg) {
      res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
      return;
    }
    // UserProject no tiene tenantId propio — se valida que el proyecto y el usuario pertenezcan a
    // este tenant antes de confiar en projectId/userId (mismo criterio que /consulta-padron/bulk).
    const [projectOk, userOk] = await Promise.all([
      Project.exists({ _id: projectId, tenantId: req.tenantObjectId }),
      User.exists({ _id: userId, tenantId: req.tenantObjectId }),
    ]);
    if (!projectOk || !userOk) {
      res.status(404).json({ error: "Contrato no encontrado." });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId }).lean();
    const path = (up as any)?.contracts?.[idx]?.constanciaAfipDropboxPath;
    if (!path) {
      res.status(404).json({ error: "Este contrato todavía no tiene una constancia archivada en Dropbox." });
      return;
    }
    const url = await getTemporaryLink(String(req.tenantObjectId), dropboxCfg, path);
    res.json({ url });
  } catch (error: any) {
    console.error("AFIP constancia-link error:", error);
    res.status(500).json({ error: error?.response?.data ? JSON.stringify(error.response.data) : "No se pudo generar el link." });
  }
});

const padronTargetSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
});

/** Busca, entre los Estados con transición automática configurada, la carpeta de Dropbox anotada
 *  como "Constancia de cuit" — es la misma que ya vigila estadoDropboxCronService.ts para avanzar el
 *  estado. No hay un vínculo de esquema fuerte (el `detalle` es una nota libre del admin), así que se
 *  matchea por texto; si no está configurada, devuelve null y el archivo simplemente no se sube. */
async function resolverCarpetaConstanciaCuit(): Promise<string | null> {
  const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
    .select("data.transicionAutomatica")
    .lean();
  for (const e of estados) {
    const carpetas = ((e as any)?.data?.transicionAutomatica?.carpetas || []) as { dropboxCarpeta?: string; detalle?: string }[];
    const match = carpetas.find((c) => {
      // `detalle` es una nota libre opcional que en la práctica casi nunca se completa — el nombre
      // que realmente se ve en "Carpetas vigiladas" (EscaneoDropboxConfigPage.tsx, nombreCarpeta())
      // es el ÚLTIMO tramo del path de `dropboxCarpeta`, así que hay que matchear ahí también, no
      // solo contra `detalle` (que era el único lugar donde se buscaba antes, y por eso nunca
      // encontraba la carpeta aunque estuviera perfectamente configurada y visible en esa pantalla).
      const nombreCarpeta = (c.dropboxCarpeta || "").split("/").filter(Boolean).pop() || "";
      const texto = `${c.detalle || ""} ${nombreCarpeta}`;
      return /constancia/i.test(texto) && /cuit/i.test(texto);
    });
    if (match?.dropboxCarpeta) return match.dropboxCarpeta;
  }
  return null;
}

// POST /afip/consulta-padron/bulk { targets: [{projectId, userId, contractIndex}] } - consulta el
// Padrón de AFIP para cada persona (deduplicado por CUIT) y actualiza sus contratos.
router.post("/consulta-padron/bulk", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const cfg = getTenantAfipConfig(tenant);
    if (!cfg) {
      res.status(400).json({ error: "AFIP no está conectado para esta organización." });
      return;
    }
    // El archivado en Dropbox es best-effort: si no está conectado o no hay carpeta configurada, la
    // consulta a AFIP sigue funcionando igual — solo que el contrato queda "activo pero sin archivar"
    // en vez de completo, hasta que se resuelva esa configuración.
    const dropboxCfg = getTenantDropboxConfig(tenant);
    // "Best-effort" de verdad: si resolver la carpeta falla (Mongo lento, Dropbox caído), la consulta
    // a AFIP tiene que seguir igual. Antes una excepción acá tiraba toda la request con 500 y no se
    // validaba ningún CUIT, aunque AFIP estuviera perfecto.
    let carpetaConstancia: string | null = null;
    if (dropboxCfg) {
      try {
        carpetaConstancia = await resolverCarpetaConstanciaCuit();
      } catch (e: any) {
        console.error("AFIP: no se pudo resolver la carpeta de Constancia de CUIT (se sigue sin archivar):", e?.message || e);
      }
    }

    let targets: { projectId: string; userId: string; contractIndex: number }[] = [];
    try {
      targets = z.array(padronTargetSchema).max(5000).parse(req.body?.targets) as typeof targets;
    } catch {
      res.status(400).json({ error: "El listado de contratos (targets) es inválido." });
      return;
    }
    if (targets.length === 0) {
      res.status(400).json({ error: "No se seleccionó ningún contrato." });
      return;
    }

    const projectIds = [...new Set(targets.map((t) => t.projectId))].filter((id) => Types.ObjectId.isValid(id));
    const userIds = [...new Set(targets.map((t) => t.userId))].filter((id) => Types.ObjectId.isValid(id));
    const [projects, users] = await Promise.all([
      Project.find({ _id: { $in: projectIds }, tenantId: req.tenantObjectId }).select("_id").lean(),
      User.find({ _id: { $in: userIds }, tenantId: req.tenantObjectId }).select("_id firstName lastName email metadata.cuit").lean(),
    ]);
    const projectIdsValidos = new Set(projects.map((p: any) => String(p._id)));
    const userById = new Map(users.map((u: any) => [String(u._id), u]));

    // CUIT (11 dígitos) → targets de esa persona — se consulta UNA vez por CUIT aunque tenga varios contratos.
    type Target = { projectId: string; userId: string; contractIndex: number };
    const targetsPorCuit = new Map<string, Target[]>();
    const sinCuit: Target[] = [];
    for (const t of targets) {
      const user = userById.get(t.userId);
      if (!user || !projectIdsValidos.has(t.projectId)) continue;
      const cuit = normalizarCuit((user as any)?.metadata?.cuit);
      // Un CUIT que no pasa el dígito verificador (típico: 00000000000) no se consulta: AFIP solo
      // devuelve error y queda registrado como un fallo del webservice que en realidad es un dato mal
      // cargado. Cuenta como "sin CUIT" para que la UI lo muestre como pendiente de corregir.
      if (!cuit || !cuitEsValido(cuit)) {
        sinCuit.push(t);
        continue;
      }
      const lista = targetsPorCuit.get(cuit) || [];
      lista.push(t);
      targetsPorCuit.set(cuit, lista);
    }

    const tenantId = String(req.tenantObjectId);
    const docsCache = new Map<string, any>(); // `${projectId}|${userId}` → documento UserProject
    const resultados: { cuit: string; estado?: string; encontrado?: boolean; denominacion?: string; error?: string; contratosActualizados: number; dropboxSubido?: boolean; dropboxError?: string; cuitRepresentada?: string; ambiente?: string; raw?: any; faultCode?: string; faultString?: string }[] = [];

    // Concurrencia acotada: no golpear el webservice de AFIP con todo el lote en simultáneo.
    const CONCURRENCIA = 3;
    const cuits = [...targetsPorCuit.keys()];
    for (let i = 0; i < cuits.length; i += CONCURRENCIA) {
      const lote = cuits.slice(i, i + CONCURRENCIA);
      await Promise.all(
        lote.map(async (cuit) => {
          const matches = targetsPorCuit.get(cuit) || [];
          try {
            const resultado = await consultarPadron(tenantId, cfg, cuit);
            // "desconocido" es sospechoso (el mapeo de estadoClave todavía no se validó contra una
            // respuesta real de AFIP en producción — ver comentario en afipService.ts): se deja el raw
            // completo en el log para poder ajustar el mapeo sin tener que volver a consultar.
            if (resultado.estado === "desconocido") {
              console.warn(`AFIP: estado desconocido para CUIT ${cuit} (encontrado=${resultado.encontrado}, faultCode=${resultado.faultCode || "-"}, faultString=${resultado.faultString || "-"}). Raw:`, JSON.stringify(resultado.raw));
            }
            let contratosActualizados = 0;
            let dropboxSubido: boolean | undefined;
            let dropboxError: string | undefined;
            for (const t of matches) {
              const key = `${t.projectId}|${t.userId}`;
              let up = docsCache.get(key);
              if (!up) {
                up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
                if (!up) continue;
                docsCache.set(key, up);
              }
              if (t.contractIndex < 0 || t.contractIndex >= up.contracts.length) continue;

              // El JSON solo se archiva cuando AFIP confirma "activo": es justo lo que dispara el
              // avance automático de estado (estadoDropboxCronService.ts vigila esa misma carpeta), y
              // no tiene sentido destrabar ese paso si la persona figura inactiva.
              let subidaAt: Date | undefined;
              let dropboxPath: string | undefined;
              if (resultado.estado === "activo") {
                if (!dropboxCfg) {
                  dropboxSubido = false;
                  dropboxError = "Dropbox no está conectado para esta organización.";
                } else if (!carpetaConstancia) {
                  dropboxSubido = false;
                  dropboxError = 'No se encontró ninguna carpeta de Dropbox configurada como "Constancia de cuit" en Documentos → Configurar transición automática.';
                } else {
                  try {
                    const user = userById.get(t.userId);
                    const contract = up.contracts[t.contractIndex];
                    const nombreArchivo = buildDocFileName({ tipo: "ConstanciaCUIT", user, up, contract, docName: "ValidacionAFIP" });
                    const contenido = Buffer.from(
                      JSON.stringify(
                        {
                          cuit,
                          estado: resultado.estado,
                          encontrado: resultado.encontrado,
                          denominacion: resultado.denominacion,
                          consultadoEn: new Date().toISOString(),
                          persona: { userId: t.userId, nombre: (user as any)?.firstName, apellido: (user as any)?.lastName },
                          proyecto: { id: t.projectId, nombre: up.nombre_proyecto },
                          contrato: { index: t.contractIndex, fechaAlta: contract?.fecha_alta_contrato, fechaBaja: contract?.fecha_baja_contrato },
                          raw: resultado.raw,
                        },
                        null,
                        2,
                      ),
                    );
                    const subida = await uploadFile(tenantId, dropboxCfg, `${carpetaConstancia.replace(/\/$/, "")}/${nombreArchivo}.json`, contenido);
                    // `uploadFile` sube con autorename: true — si ya existía un archivo con ese
                    // nombre, Dropbox le cambia el nombre solo, así que el path final puede diferir
                    // del pedido. Se guarda el que realmente devolvió Dropbox.
                    dropboxPath = subida.path;
                    subidaAt = new Date();
                    dropboxSubido = true;
                  } catch (e: any) {
                    const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
                    console.error(`AFIP: no se pudo archivar la constancia en Dropbox (CUIT ${cuit}, carpeta "${carpetaConstancia}"):`, detalle);
                    dropboxSubido = dropboxSubido ?? false;
                    dropboxError = `No se pudo subir a Dropbox (carpeta "${carpetaConstancia}"): ${detalle}`;
                  }
                }
              }

              up.contracts[t.contractIndex] = {
                ...(up.contracts[t.contractIndex] as any).toObject(),
                constanciaAfipEstado: resultado.estado,
                constanciaAfipConsultadaAt: new Date(),
                constanciaAfipRaw: resultado.raw,
                ...(subidaAt ? { constanciaAfipDropboxSubidaAt: subidaAt, constanciaAfipDropboxPath: dropboxPath } : {}),
              } as any;
              up.markModified("contracts");
              contratosActualizados++;
            }
            // Se devuelve el raw completo + con qué CUIT representada/ambiente se consultó — para poder
            // ver en el momento, desde la UI, exactamente qué se mandó y qué contestó AFIP, sin
            // necesitar acceso a los logs del server ni a la base.
            resultados.push({ cuit, estado: resultado.estado, encontrado: resultado.encontrado, denominacion: resultado.denominacion, contratosActualizados, dropboxSubido, dropboxError, cuitRepresentada: cfg.cuitRepresentada, ambiente: cfg.ambiente, raw: resultado.raw, faultCode: resultado.faultCode, faultString: resultado.faultString });
          } catch (e: any) {
            resultados.push({ cuit, error: e?.message || "Error al consultar AFIP", contratosActualizados: 0 });
          }
        }),
      );
    }

    await Promise.all([...docsCache.values()].map((up) => up.save()));

    res.json({
      resultados,
      consultados: cuits.length,
      sinCuit: sinCuit.length,
      contratosActualizados: resultados.reduce((acc, r) => acc + r.contratosActualizados, 0),
    });
  } catch (error: any) {
    // El motivo va al cliente: "Internal server error" obligaba a entrar al server para saber si
    // había fallado AFIP, Mongo o Dropbox.
    console.error("AFIP consulta padrón bulk error:", error);
    res.status(500).json({ error: `No se pudo completar la consulta al Padrón: ${error?.message || "error interno"}` });
  }
});

/**
 * POST /afip/constancia-archivada/eliminar - borra de Dropbox el JSON de la validación y limpia la
 * marca en el contrato.
 *
 * Para qué: ese archivo es justamente lo que el escaneo automático vigila para avanzar el contrato
 * de bandeja. Si se validó por error (o hay que rehacerlo), borrarlo desde acá evita que en la
 * próxima sincronización el contrato se mueva solo.
 */
router.post("/constancia-archivada/eliminar", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const parsed = padronTargetSchema.safeParse(req.body || {});
    if (!parsed.success) {
      res.status(400).json({ error: "Faltan datos del contrato." });
      return;
    }
    const { projectId, userId, contractIndex } = parsed.data;

    const project = await Project.findOne({ _id: projectId, tenantId: req.tenantObjectId }).select("_id").lean();
    if (!project) {
      res.status(404).json({ error: "Proyecto no encontrado" });
      return;
    }
    const up = await UserProject.findOne({ projectId, userId });
    if (!up || contractIndex < 0 || contractIndex >= up.contracts.length) {
      res.status(404).json({ error: "Contrato no encontrado" });
      return;
    }

    const contrato: any = up.contracts[contractIndex];
    const path = contrato?.constanciaAfipDropboxPath;

    // Borrar en Dropbox es best-effort: si el archivo ya no está (o Dropbox falla), igual se limpia
    // la marca — si no, el contrato quedaría marcado como archivado para siempre y sin forma de
    // corregirlo desde la aplicación.
    let avisoDropbox = "";
    if (path) {
      try {
        const tenant = await Tenant.findById(req.tenantObjectId).lean();
        const dropboxCfg = getTenantDropboxConfig(tenant);
        if (dropboxCfg) await deleteEntry(String(req.tenantObjectId), dropboxCfg, path);
        else avisoDropbox = "Dropbox no está conectado: el archivo sigue en la carpeta.";
      } catch (e: any) {
        avisoDropbox = `No se pudo borrar el archivo de Dropbox (${e?.message || "error"}), pero se quitó la marca.`;
      }
    }

    up.contracts[contractIndex] = { ...contrato.toObject(), constanciaAfipDropboxSubidaAt: undefined, constanciaAfipDropboxPath: undefined } as any;
    up.markModified("contracts");
    await up.save();

    res.json({ ok: true, aviso: avisoDropbox });
  } catch (error: any) {
    console.error("AFIP eliminar constancia archivada error:", error);
    res.status(500).json({ error: `No se pudo eliminar el archivo: ${error?.message || "error interno"}` });
  }
});

/**
 * POST /afip/habilitar-firma { targets: [...], tipo: "alta_temprana_afip" | "constancia_cuit" }
 *
 * Salida para la gente SIN CUIT/CUIL argentino (típicamente extranjeros): esos trámites de AFIP no
 * les aplican —no hay CUIT que dar de alta ni constancia que validar—, así que no pueden avanzar por
 * el camino normal (Generar TXT / Validar en ARCA) y quedan trabados antes de Firma digital.
 *
 * En lugar de eso se archiva un JSON en la MISMA carpeta de Dropbox que vigila la transición
 * automática para ese trámite, con la misma nomenclatura que los PDF (`buildDocFileName`). El cron
 * `estadoDropboxCronService` lo ve, lo matchea con el contrato y lo pasa al estado de Firma digital
 * —igual que si hubiera llegado la constancia real—, y desde ahí ya se le puede generar el Contrato
 * y el Release.
 */
router.post("/habilitar-firma", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tipo = String(req.body?.tipo || "");
    if (tipo !== "alta_temprana_afip" && tipo !== "constancia_cuit") {
      res.status(400).json({ error: 'El trámite (tipo) debe ser "alta_temprana_afip" o "constancia_cuit".' });
      return;
    }

    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const dropboxCfg = getTenantDropboxConfig(tenant);
    if (!dropboxCfg) {
      res.status(400).json({ error: "Dropbox no está conectado para esta organización." });
      return;
    }

    // La misma carpeta que ya vigila la transición automática de ese trámite.
    const carpeta = await resolverCarpetaPorPatron(tipo === "alta_temprana_afip" ? [/alta/i, /temprana|afip/i] : [/constancia/i, /cuit/i]);
    if (!carpeta) {
      const nombre = tipo === "alta_temprana_afip" ? "Alta temprana de Afip" : "Constancia de cuit";
      res.status(400).json({ error: `No se encontró ninguna carpeta de Dropbox configurada como "${nombre}" en Documentos → Configurar transición automática.` });
      return;
    }

    let targets: { projectId: string; userId: string; contractIndex: number }[] = [];
    try {
      targets = z.array(padronTargetSchema).max(1000).parse(req.body?.targets) as typeof targets;
    } catch {
      res.status(400).json({ error: "El listado de contratos (targets) es inválido." });
      return;
    }
    if (targets.length === 0) {
      res.status(400).json({ error: "No se seleccionó ningún contrato." });
      return;
    }

    const projectIds = [...new Set(targets.map((t) => t.projectId))].filter((id) => Types.ObjectId.isValid(id));
    const userIds = [...new Set(targets.map((t) => t.userId))].filter((id) => Types.ObjectId.isValid(id));
    const [projects, users] = await Promise.all([
      Project.find({ _id: { $in: projectIds }, tenantId: req.tenantObjectId }).select("_id").lean(),
      User.find({ _id: { $in: userIds }, tenantId: req.tenantObjectId }).select("_id firstName lastName email metadata").lean(),
    ]);
    const projectOk = new Set(projects.map((p: any) => String(p._id)));
    const userById = new Map(users.map((u: any) => [String(u._id), u]));

    const habilitados: { userId: string; nombre: string; path: string }[] = [];
    const omitidos: { userId: string; nombre: string; motivo: string }[] = [];

    for (const t of targets) {
      const user = userById.get(t.userId);
      const nombre = `${(user as any)?.firstName || ""} ${(user as any)?.lastName || ""}`.trim() || t.userId;
      if (!projectOk.has(t.projectId) || !user) {
        omitidos.push({ userId: t.userId, nombre, motivo: "No se encontró la persona o el proyecto en esta organización." });
        continue;
      }
      // Guarda dura: esta salida es SOLO para quien no tiene CUIT. Si lo tiene, tiene que hacer el
      // trámite real de AFIP (que además deja el respaldo de la consulta al Padrón).
      const cuitDigitos = normalizarCuit((user as any)?.metadata?.cuit);
      if (cuitDigitos && !/^(\d)\1*$/.test(cuitDigitos)) {
        omitidos.push({ userId: t.userId, nombre, motivo: `Tiene CUIT cargado (${cuitDigitos}): corresponde el trámite normal de AFIP.` });
        continue;
      }

      const up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
      if (!up || t.contractIndex < 0 || t.contractIndex >= up.contracts.length) {
        omitidos.push({ userId: t.userId, nombre, motivo: "No se encontró el contrato indicado." });
        continue;
      }
      const contract: any = up.contracts[t.contractIndex];

      const docName = tipo === "alta_temprana_afip" ? "SinCuitAltaAFIP" : "SinCuitConstanciaCUIT";
      const nombreArchivo = buildDocFileName({ tipo: tipo === "alta_temprana_afip" ? "AltaAFIP" : "ConstanciaCUIT", user, up, contract, docName });
      const contenido = Buffer.from(
        JSON.stringify(
          {
            // Marca explícita de por qué existe este archivo (no vino de una consulta a AFIP).
            origen: "habilitacion-manual-sin-cuit",
            tramite: tipo,
            motivo: "La persona no posee CUIT/CUIL argentino, por lo que el trámite de AFIP no aplica.",
            cuit: null,
            documento: { tipoDocumentoId: (user as any)?.metadata?.tipoDocumentoId ?? null, numero: (user as any)?.metadata?.documento ?? null },
            nacionalidadId: (user as any)?.metadata?.nacionalidadId ?? null,
            habilitadoEn: new Date().toISOString(),
            habilitadoPor: req.user?.userId || null,
            persona: { userId: t.userId, nombre: (user as any)?.firstName, apellido: (user as any)?.lastName, email: (user as any)?.email },
            proyecto: { id: t.projectId, nombre: up.nombre_proyecto },
            contrato: { index: t.contractIndex, fechaAlta: contract?.fecha_alta_contrato, fechaBaja: contract?.fecha_baja_contrato },
          },
          null,
          2,
        ),
      );

      try {
        const subida = await uploadFile(req.tenantObjectId!.toString(), dropboxCfg, `${carpeta.replace(/\/$/, "")}/${nombreArchivo}.json`, contenido);
        // Se registra igual que la constancia real para que la UI pueda mostrar que ya está archivado
        // y para no volver a subirlo por error.
        up.contracts[t.contractIndex] = {
          ...contract.toObject(),
          constanciaAfipDropboxSubidaAt: new Date(),
          constanciaAfipDropboxPath: subida.path,
        } as any;
        up.markModified("contracts");
        await up.save();
        habilitados.push({ userId: t.userId, nombre, path: subida.path });
      } catch (e: any) {
        const detalle = e?.response?.data ? JSON.stringify(e.response.data) : e?.message || String(e);
        console.error(`AFIP habilitar-firma: no se pudo subir el JSON de "${nombre}" a "${carpeta}":`, detalle);
        omitidos.push({ userId: t.userId, nombre, motivo: `No se pudo subir a Dropbox: ${detalle}` });
      }
    }

    res.json({ ok: true, carpeta, habilitados, omitidos });
  } catch (error: any) {
    console.error("AFIP habilitar-firma error:", error);
    res.status(500).json({ error: `No se pudo habilitar la firma: ${error?.message || "error interno"}` });
  }
});

export { router as afipRoutes };
