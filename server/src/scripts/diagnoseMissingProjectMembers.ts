import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { ExternalApiService } from "../services/externalApiService.js";
import { Types } from "mongoose";

/**
 * DIAGNÓSTICO (SOLO LECTURA): detecta empleados que FRAME asigna a un proyecto pero que
 * en WeProdu faltan o quedaron sin rol_frame dentro de ese proyecto.
 *
 * Fuente de verdad: API FRAME (https://frame.weprodu.com/api). Por cada empleado se piden
 * sus proyectos/contratos (con rol_frame_id / nombre_rol_frame) y se compara contra WeProdu.
 *
 * NO escribe nada en la base: solo imprime un reporte.
 *
 * Variables de entorno:
 *   TENANT_SLUG=<slug>   -> tenant de WeProdu a chequear (o TENANT_ID=<ObjectId>). REQUERIDO.
 *   OUTPUT=json          -> vuelca el reporte como JSON (además del resumen legible).
 *   LIMIT=<n>            -> (opcional) procesa solo los primeros N empleados de FRAME (para pruebas).
 *
 * Uso: TENANT_SLUG=<slug> npm run diag:missing-members
 */

type Motivo =
  | "PROYECTO_NO_IMPORTADO"
  | "EMPLEADO_NO_IMPORTADO"
  | "VINCULO_FALTANTE"
  | "SIN_ROL_FRAME"
  | "NO_EN_ASSIGNEDUSERS";

interface Issue {
  empId: number;
  empEmail: string;
  empNombre: string;
  motivo: Motivo;
  rolFrameEsperado: string; // lo que FRAME dice que debería tener
}

interface ProjectReport {
  externalId: number;
  nombre: string;
  existeEnWeprodu: boolean;
  issues: Issue[];
}

const ROL_FRAME_VACIO = new Set(["", "sin rol frame", "sin rol_frame"]);

function isRolFrameEmpty(value?: string | null): boolean {
  return ROL_FRAME_VACIO.has(String(value || "").trim().toLowerCase());
}

async function diagnoseMissingProjectMembers() {
  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const tenantIdEnv = process.env.TENANT_ID?.trim();
  const outputJson = String(process.env.OUTPUT).toLowerCase() === "json";
  const limit = process.env.LIMIT ? Number(process.env.LIMIT) : 0;

  if (!tenantSlug && !tenantIdEnv) {
    console.error("❌ Falta TENANT_SLUG=<slug> (o TENANT_ID=<ObjectId>).");
    process.exit(1);
  }

  console.log("🌱 Conectando a la base de datos...");
  await connectDB();

  try {
    // ── Resolver tenant ────────────────────────────────────────────────
    const tenant = tenantIdEnv
      ? await Tenant.findById(tenantIdEnv).select("_id slug name")
      : await Tenant.findOne({ slug: tenantSlug }).select("_id slug name");

    if (!tenant) {
      console.error(`❌ Tenant no encontrado (${tenantSlug || tenantIdEnv}).`);
      await disconnectDB();
      process.exit(1);
    }
    const tenantId = tenant._id as Types.ObjectId;
    console.log(`🏢 Tenant: ${tenant.name} (slug=${tenant.slug}, id=${tenantId})`);

    // ── Precargar estado de WeProdu para este tenant ───────────────────
    const projects = await Project.find({ tenantId }).select("_id name externalId assignedUsers").lean();
    const projByExtId = new Map<number, (typeof projects)[number]>();
    const assignedSetByProjId = new Map<string, Set<string>>();
    const tenantProjectIds: Types.ObjectId[] = [];
    for (const p of projects) {
      if (typeof p.externalId === "number") projByExtId.set(p.externalId, p);
      tenantProjectIds.push(p._id as Types.ObjectId);
      assignedSetByProjId.set(
        String(p._id),
        new Set((p.assignedUsers || []).map((u: any) => String(u))),
      );
    }

    const users = await User.find({ tenantId, "metadata.id": { $exists: true } })
      .select("_id firstName lastName email metadata.id")
      .lean();
    const userByExtId = new Map<number, (typeof users)[number]>();
    for (const u of users) {
      const extId = Number((u.metadata as any)?.id);
      if (!isNaN(extId)) userByExtId.set(extId, u);
    }

    const userProjects = await UserProject.find({ projectId: { $in: tenantProjectIds } })
      .select("projectId userId nombre_rol_frame")
      .lean();
    const upByKey = new Map<string, (typeof userProjects)[number]>();
    for (const up of userProjects) {
      upByKey.set(`${String(up.projectId)}_${String(up.userId)}`, up);
    }

    console.log(
      `📦 WeProdu: ${projects.length} proyectos (${projByExtId.size} con externalId), ` +
        `${users.length} empleados importados, ${userProjects.length} vínculos user-project.`,
    );

    // ── FRAME: empleados y sus asignaciones ────────────────────────────
    const external = new ExternalApiService();
    console.log("🔌 Consultando FRAME: empleados...");
    let employees = await external.getEmployees();
    employees = employees.filter((e: any) => e && e.id != null && e.email);
    if (limit > 0) employees = employees.slice(0, limit);
    console.log(`👥 FRAME: ${employees.length} empleados a chequear (con id y email).`);

    const reportByExtProj = new Map<number, ProjectReport>();
    const totals: Record<Motivo, number> = {
      PROYECTO_NO_IMPORTADO: 0,
      EMPLEADO_NO_IMPORTADO: 0,
      VINCULO_FALTANTE: 0,
      SIN_ROL_FRAME: 0,
      NO_EN_ASSIGNEDUSERS: 0,
    };
    let okCount = 0;
    let frameErrors = 0;

    const addIssue = (extProjId: number, nombreProyecto: string, existe: boolean, issue: Issue) => {
      let rep = reportByExtProj.get(extProjId);
      if (!rep) {
        rep = { externalId: extProjId, nombre: nombreProyecto, existeEnWeprodu: existe, issues: [] };
        reportByExtProj.set(extProjId, rep);
      }
      if (!rep.nombre && nombreProyecto) rep.nombre = nombreProyecto;
      rep.issues.push(issue);
      totals[issue.motivo]++;
    };

    let processed = 0;
    for (const emp of employees) {
      processed++;
      if (processed % 50 === 0) console.log(`   ...${processed}/${employees.length} empleados`);

      let asignaciones: any[];
      try {
        asignaciones = await external.getEmployeeProjects(emp.id);
      } catch (err) {
        frameErrors++;
        console.warn(`⚠️ FRAME falló para empleado ${emp.email} (id ${emp.id}); se omite.`);
        continue;
      }
      if (!Array.isArray(asignaciones) || asignaciones.length === 0) continue;

      // Agrupar por proyecto (igual que el sync)
      const grouped: Record<number, any[]> = {};
      for (const a of asignaciones) {
        if (a?.proyecto_id == null) continue;
        (grouped[a.proyecto_id] ||= []).push(a);
      }

      const empNombre = `${emp.nombre || ""} ${emp.apellido || ""}`.trim() || `ID ${emp.id}`;

      for (const extProjIdStr of Object.keys(grouped)) {
        const extProjId = Number(extProjIdStr);
        const contratos = grouped[extProjId];
        const nombreProyecto = contratos[0]?.nombre_proyecto || "";
        const rolFrameEsperado = String(contratos[0]?.nombre_rol_frame || "").trim() ||
          (contratos[0]?.rol_frame_id != null ? `rol_frame_id=${contratos[0].rol_frame_id}` : "(FRAME sin rol_frame)");

        const baseIssue = { empId: emp.id, empEmail: emp.email, empNombre, rolFrameEsperado };

        const project = projByExtId.get(extProjId);
        if (!project) {
          addIssue(extProjId, nombreProyecto, false, { ...baseIssue, motivo: "PROYECTO_NO_IMPORTADO" });
          continue;
        }

        const user = userByExtId.get(Number(emp.id));
        if (!user) {
          addIssue(extProjId, nombreProyecto || project.name, true, { ...baseIssue, motivo: "EMPLEADO_NO_IMPORTADO" });
          continue;
        }

        const up = upByKey.get(`${String(project._id)}_${String(user._id)}`);
        if (!up) {
          addIssue(extProjId, nombreProyecto || project.name, true, { ...baseIssue, motivo: "VINCULO_FALTANTE" });
          continue;
        }

        if (isRolFrameEmpty(up.nombre_rol_frame)) {
          addIssue(extProjId, nombreProyecto || project.name, true, { ...baseIssue, motivo: "SIN_ROL_FRAME" });
          continue;
        }

        const assignedSet = assignedSetByProjId.get(String(project._id));
        if (assignedSet && !assignedSet.has(String(user._id))) {
          addIssue(extProjId, nombreProyecto || project.name, true, { ...baseIssue, motivo: "NO_EN_ASSIGNEDUSERS" });
          continue;
        }

        okCount++;
      }
    }

    // ── Reporte ────────────────────────────────────────────────────────
    const reports = Array.from(reportByExtProj.values()).sort((a, b) => b.issues.length - a.issues.length);

    console.log("\n===================== REPORTE DE FALTANTES =====================");
    if (reports.length === 0) {
      console.log("✅ No se detectaron faltantes. Todos los empleados de FRAME están en sus proyectos con rol_frame.");
    } else {
      for (const rep of reports) {
        const flag = rep.existeEnWeprodu ? "" : "  ⛔ (proyecto NO existe en WeProdu)";
        console.log(`\n▸ Proyecto "${rep.nombre || "(sin nombre)"}" [externalId=${rep.externalId}] — ${rep.issues.length} faltante(s)${flag}`);
        for (const it of rep.issues) {
          console.log(`    - ${it.motivo.padEnd(22)} ${it.empNombre} <${it.empEmail}> (empId ${it.empId}) → esperaba rol_frame: ${it.rolFrameEsperado}`);
        }
      }
    }

    console.log("\n---------------------- RESUMEN ----------------------");
    console.log(`Proyectos con faltantes : ${reports.length}`);
    console.log(`OK (empleado+proyecto+rol_frame): ${okCount}`);
    for (const m of Object.keys(totals) as Motivo[]) {
      console.log(`${m.padEnd(24)}: ${totals[m]}`);
    }
    if (frameErrors > 0) console.log(`⚠️ Empleados omitidos por error de FRAME: ${frameErrors}`);
    console.log("-----------------------------------------------------");

    if (outputJson) {
      console.log("\n===================== JSON =====================");
      console.log(JSON.stringify({ tenant: { id: String(tenantId), slug: tenant.slug }, totals, okCount, reports }, null, 2));
    }

    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error en el diagnóstico:", error);
    await disconnectDB();
    process.exit(1);
  }
}

diagnoseMissingProjectMembers();
