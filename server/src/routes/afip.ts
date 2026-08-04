import { Router } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { encryptSecret } from "../utils/secretCrypto.js";
import { normalizarCuit } from "../utils/constanciaPdf.js";
import { getTenantAfipConfig, verificarCredenciales, consultarPadron, clearTenantTicket, Ambiente } from "../services/afipService.js";

const router = Router();

router.use(requireTenant, authenticateToken);

const isAdmin = (req: AuthenticatedRequest) => (req.user?.roles || []).some((r) => ["admin", "superadmin"].includes(r.toLowerCase()));

// GET /afip/status - ¿está conectado este tenant?
router.get("/status", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenant = await Tenant.findById(req.tenantObjectId).lean();
    const a = (tenant as any)?.integrations?.afip;
    const connected = !!getTenantAfipConfig(tenant);
    res.json({
      connected,
      cuitRepresentada: a?.cuitRepresentada || null,
      ambiente: a?.ambiente || "homologacion",
      connectedAt: a?.connectedAt || null,
      canManageConnection: isAdmin(req),
    });
  } catch (error) {
    console.error("AFIP status error:", error);
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

    try {
      await verificarCredenciales(String(req.tenantObjectId), { cuitRepresentada: cuit, certificadoPem: String(certificadoPem), clavePrivadaPem: String(clavePrivadaPem), ambiente: amb });
    } catch (e: any) {
      res.status(400).json({ error: `No se pudo validar contra AFIP: ${e?.message || "credenciales inválidas"}` });
      return;
    }

    await Tenant.updateOne(
      { _id: req.tenantObjectId },
      {
        $set: {
          "integrations.afip.cuitRepresentada": cuit,
          "integrations.afip.certificadoPem": String(certificadoPem),
          "integrations.afip.clavePrivadaEnc": encryptSecret(String(clavePrivadaPem)),
          "integrations.afip.ambiente": amb,
          "integrations.afip.connectedAt": new Date(),
        },
      },
    );
    res.json({ connected: true, cuitRepresentada: cuit, ambiente: amb, connectedAt: new Date() });
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

const padronTargetSchema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  contractIndex: z.number().int().min(0),
});

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
    const resultados: { cuit: string; estado?: string; encontrado?: boolean; denominacion?: string; error?: string; contratosActualizados: number }[] = [];

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
            let contratosActualizados = 0;
            for (const t of matches) {
              const key = `${t.projectId}|${t.userId}`;
              let up = docsCache.get(key);
              if (!up) {
                up = await UserProject.findOne({ projectId: t.projectId, userId: t.userId });
                if (!up) continue;
                docsCache.set(key, up);
              }
              if (t.contractIndex < 0 || t.contractIndex >= up.contracts.length) continue;
              up.contracts[t.contractIndex] = {
                ...(up.contracts[t.contractIndex] as any).toObject(),
                constanciaAfipEstado: resultado.estado,
                constanciaAfipConsultadaAt: new Date(),
                constanciaAfipRaw: resultado.raw,
              } as any;
              up.markModified("contracts");
              contratosActualizados++;
            }
            resultados.push({ cuit, estado: resultado.estado, encontrado: resultado.encontrado, denominacion: resultado.denominacion, contratosActualizados });
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
