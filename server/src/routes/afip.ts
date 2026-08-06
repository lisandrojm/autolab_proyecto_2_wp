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
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { buildDocFileName } from "../utils/employeeDocData.js";
import { getTenantAfipConfig, verificarCredenciales, verificarServicioPadron, consultarPadron, clearTenantTicket, getCertificadoInfo, Ambiente } from "../services/afipService.js";
import { getTenantDropboxConfig, uploadFile, getTemporaryLink } from "../services/dropboxService.js";

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
    const carpetaConstancia = dropboxCfg ? await resolverCarpetaConstanciaCuit() : null;

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
      User.find({ _id: { $in: userIds }, tenantId: req.tenantObjectId }).select("_id firstName lastName metadata.cuit").lean(),
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
      if (!cuit) {
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
  } catch (error) {
    console.error("AFIP consulta padrón bulk error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as afipRoutes };
