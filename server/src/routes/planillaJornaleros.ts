import { Router } from "express";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requirePermission } from "../middleware/permissions.js";
import { datosPlanillaJornaleros, xlsxPlanillaJornaleros } from "../services/planillaJornaleros.js";
import { nombreDelArchivo } from "../utils/planillaJornaleros.js";

/*
  La planilla mensual de jornaleros (JORNALEROS_<MES>_<AÑO>.xlsx). Ver `services/planillaJornaleros.ts`.

  GET /?mes=YYYY-MM       → el resumen y las advertencias, para mirar antes de descargar.
  GET /xlsx?mes=YYYY-MM   → el libro.
*/
const router = Router();
const guardia = [requireTenant, authenticateToken, requirePermission("admin_contracts:view")];

const mesValido = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null);

router.get("/", ...guardia, async (req: AuthenticatedRequest & TenantRequest, res) => {
  const mes = mesValido(req.query.mes);
  if (!mes) return res.status(400).json({ message: "Elegí el mes (AAAA-MM)." });
  try {
    const p = await datosPlanillaJornaleros(req.tenantObjectId!, mes);
    res.json({ mes, archivo: nombreDelArchivo(mes), totales: p.totales, categorias: p.escala.length, advertencias: p.advertencias });
  } catch (e: any) {
    console.error("[planilla-jornaleros]", e);
    res.status(500).json({ message: "No se pudo armar la planilla." });
  }
});

router.get("/xlsx", ...guardia, async (req: AuthenticatedRequest & TenantRequest, res) => {
  const mes = mesValido(req.query.mes);
  if (!mes) return res.status(400).json({ message: "Elegí el mes (AAAA-MM)." });
  try {
    const p = await datosPlanillaJornaleros(req.tenantObjectId!, mes);
    const buf = await xlsxPlanillaJornaleros(p);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreDelArchivo(mes)}"`);
    res.send(buf);
  } catch (e: any) {
    console.error("[planilla-jornaleros]", e);
    res.status(500).json({ message: "No se pudo generar la planilla." });
  }
});

export { router as planillaJornalerosRoutes };
