import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { User } from "../models/User.js";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Role } from "../models/Role.js";

/**
 * BACKFILL de área/turno para los contratos marcados como REEMPLAZO.
 *
 * Desde ahora, al elegir a quién reemplaza un miembro, el wizard le copia el área/turno de la persona
 * reemplazada. Este script hace lo mismo con los reemplazos que YA estaban cargados: busca contratos con
 * `reemplazo: true` + `empleado_id_reemplezado` que quedaron sin área/turno y les copia el del reemplazado
 * (mismo proyecto).
 *
 * Reglas (las mismas que aplica la UI):
 *   - El área debe seguir configurada en el proyecto (project.areasConfig).
 *   - Los turnos deben seguir ofrecidos por esa área.
 *   - Las áreas de sistema (coordinador) solo se copian si el reemplazante tiene rol "mobile-coordinador".
 *   - Origen del área/turno del reemplazado: project.teamConfig y, si ahí no hay, su último contrato.
 *
 * Escribe en `users_&_projects.contracts[i].areaShiftAssignments` y, si el miembro ya tiene entrada en
 * `projects.teamConfig` sin asignaciones, también ahí (no crea entradas nuevas en teamConfig).
 *
 * Variables de entorno:
 *   TENANT_SLUG=<slug>    -> tenant a procesar (o TENANT_ID=<ObjectId>). REQUERIDO.
 *   PROJECT_ID=<ObjectId> -> (opcional) procesa un solo proyecto.
 *   DRY=true              -> (opcional) no escribe nada; solo reporta qué haría.
 *   FORCE=true            -> (opcional) pisa el área/turno aunque el reemplazante ya tenga uno.
 *   ALL_CONTRACTS=true    -> (opcional) procesa todos los contratos, no solo el último de cada miembro.
 *                            OJO: en contratos viejos se copia el área ACTUAL del reemplazado, que puede
 *                            no ser la que tenía en esa época.
 *
 * Uso: TENANT_SLUG=demo-tenant npm run fix:reemplazo-areas:dry
 *      TENANT_SLUG=demo-tenant npm run fix:reemplazo-areas
 */

type Assignment = { areaId: string; shiftIds: string[] };

const idOf = (v: any): string => String(v?._id ?? v ?? "");

const normalizeAssignments = (raw: any[]): Assignment[] =>
  (raw || [])
    .map((a: any) => ({ areaId: idOf(a?.areaId), shiftIds: (a?.shiftIds || []).map(idOf).filter(Boolean) }))
    .filter((a) => a.areaId && a.shiftIds.length > 0);

async function backfillReplacementAreaShifts() {
  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const tenantIdEnv = process.env.TENANT_ID?.trim();
  const projectIdEnv = process.env.PROJECT_ID?.trim();
  const dryRun = String(process.env.DRY).toLowerCase() === "true";
  const force = String(process.env.FORCE).toLowerCase() === "true";
  const allContracts = String(process.env.ALL_CONTRACTS).toLowerCase() === "true";

  if (!tenantSlug && !tenantIdEnv) {
    console.error("❌ Falta TENANT_SLUG=<slug> (o TENANT_ID=<ObjectId>).");
    process.exit(1);
  }

  console.log("🌱 Conectando a la base de datos...");
  await connectDB();

  try {
    const tenant = tenantIdEnv
      ? await Tenant.findById(tenantIdEnv).select("_id slug name")
      : await Tenant.findOne({ slug: tenantSlug }).select("_id slug name");

    if (!tenant) {
      console.error(`❌ Tenant no encontrado (${tenantIdEnv || tenantSlug}).`);
      process.exit(1);
    }

    console.log(`\n🏢 Tenant: ${tenant.name} (${tenant.slug})`);
    console.log(`⚙️  Modo: ${dryRun ? "DRY RUN (no escribe)" : "ESCRITURA"}${force ? " | FORCE" : ""}${allContracts ? " | TODOS los contratos" : " | solo último contrato"}\n`);

    // ── Catálogos ──────────────────────────────────────────────────────
    const projectFilter: any = { tenantId: tenant._id };
    if (projectIdEnv) projectFilter._id = projectIdEnv;
    const projects = await Project.find(projectFilter).select("_id name areasConfig teamConfig").lean();
    if (projects.length === 0) {
      console.log("No hay proyectos para procesar.");
      return;
    }
    const projectMap = new Map(projects.map((p: any) => [String(p._id), p]));

    const areas = await Area.find({}).select("_id name isSystem").lean();
    const areaMap = new Map(areas.map((a: any) => [String(a._id), a]));
    const shifts = await Shift.find({}).select("_id name").lean();
    const shiftMap = new Map(shifts.map((s: any) => [String(s._id), s.name]));
    const coordinadorRoleIds = new Set(
      (await Role.find({}).select("_id name").lean())
        .filter((r: any) => String(r.name || "").toLowerCase().includes("mobile-coordinador"))
        .map((r: any) => String(r._id)),
    );

    // ── UserProjects del tenant (los de los proyectos filtrados) ───────
    const ups = await UserProject.find({ projectId: { $in: projects.map((p: any) => p._id) } });
    console.log(`📄 ${ups.length} asignaciones usuario-proyecto a revisar.\n`);

    // Índice: (projectId + userId) -> assignments actuales, para resolver al reemplazado.
    const assignmentsByProjectUser = new Map<string, Assignment[]>();
    for (const up of ups as any[]) {
      const key = `${idOf(up.projectId)}|${idOf(up.userId)}`;
      const contracts: any[] = up.contracts || [];
      const last = contracts.length ? contracts[contracts.length - 1] : null;
      assignmentsByProjectUser.set(key, normalizeAssignments(last?.areaShiftAssignments || []));
    }

    const teamConfigAssignments = (projectId: string, userId: string): Assignment[] => {
      const project: any = projectMap.get(projectId);
      const entry = (project?.teamConfig || []).find((c: any) => idOf(c.userId) === userId);
      return normalizeAssignments(entry?.areaShiftAssignments || []);
    };

    const currentAssignments = (projectId: string, userId: string): Assignment[] => {
      const fromConfig = teamConfigAssignments(projectId, userId);
      if (fromConfig.length > 0) return fromConfig;
      return assignmentsByProjectUser.get(`${projectId}|${userId}`) || [];
    };

    // Usuarios del tenant indexados por metadata.id (el id externo que guarda empleado_id_reemplezado).
    const users = await User.find({ tenantId: tenant._id }).select("_id firstName lastName metadata.id roles").lean();
    const userByExternalId = new Map<string, any>();
    const userById = new Map<string, any>();
    for (const u of users as any[]) {
      userById.set(String(u._id), u);
      const ext = (u.metadata as any)?.id;
      if (ext != null) userByExternalId.set(String(ext), u);
    }

    let conReemplazo = 0;
    let actualizados = 0;
    const skips = { yaTiene: 0, sinReemplazado: 0, reemplazadoSinArea: 0, nadaAplicable: 0 };

    for (const up of ups as any[]) {
      const projectId = idOf(up.projectId);
      const userId = idOf(up.userId);
      const project: any = projectMap.get(projectId);
      if (!project) continue;

      const contracts: any[] = up.contracts || [];
      if (contracts.length === 0) continue;

      const targets = allContracts ? contracts.map((c, i) => ({ c, i })) : [{ c: contracts[contracts.length - 1], i: contracts.length - 1 }];

      const member = userById.get(userId);
      const memberName = member ? `${member.firstName || ""} ${member.lastName || ""}`.trim() : userId;
      const isCoordinador = (member?.roles || []).some((r: any) => coordinadorRoleIds.has(String(r)));

      let upTouched = false;

      for (const { c, i } of targets) {
        if (!c?.reemplazo || c.empleado_id_reemplezado == null) continue;
        conReemplazo++;

        const propias = allContracts ? normalizeAssignments(c.areaShiftAssignments || []) : currentAssignments(projectId, userId);
        if (propias.length > 0 && !force) {
          skips.yaTiene++;
          continue;
        }

        const replaced = userByExternalId.get(String(c.empleado_id_reemplezado));
        if (!replaced) {
          skips.sinReemplazado++;
          console.log(`  ⚠️  ${project.name} | ${memberName}: no se encontró al empleado reemplazado (id externo ${c.empleado_id_reemplezado}).`);
          continue;
        }

        const origen = currentAssignments(projectId, String(replaced._id));
        if (origen.length === 0) {
          skips.reemplazadoSinArea++;
          continue;
        }

        // Filtrar contra la configuración vigente del proyecto.
        const heredadas: Assignment[] = [];
        for (const a of origen) {
          const areaConfig = (project.areasConfig || []).find((ac: any) => idOf(ac.areaId) === a.areaId);
          if (!areaConfig) continue;
          const areaDoc: any = areaMap.get(a.areaId);
          if (areaDoc?.isSystem && !isCoordinador) continue;
          const permitidos = (areaConfig.shiftIds || []).map(idOf);
          const shiftIds = a.shiftIds.filter((s) => permitidos.includes(s));
          if (shiftIds.length > 0) heredadas.push({ areaId: a.areaId, shiftIds });
        }

        if (heredadas.length === 0) {
          skips.nadaAplicable++;
          continue;
        }

        const detalle = heredadas
          .map((a) => `${areaMap.get(a.areaId)?.name || a.areaId} [${a.shiftIds.map((s) => shiftMap.get(s) || s).join(", ")}]`)
          .join(" + ");
        const replacedName = `${replaced.firstName || ""} ${replaced.lastName || ""}`.trim();
        console.log(`  ✅ ${project.name} | ${memberName} (contrato #${i + 1}) ← ${replacedName}: ${detalle}`);
        actualizados++;

        if (!dryRun) {
          up.contracts[i].areaShiftAssignments = heredadas.map((a) => ({ areaId: a.areaId, shiftIds: a.shiftIds })) as any;
          up.markModified(`contracts.${i}.areaShiftAssignments`);
          upTouched = true;

          // Si el miembro ya tiene entrada en teamConfig sin asignaciones, se completa también ahí (es la
          // fuente que la UI mira primero). No se crean entradas nuevas.
          const entryIdx = (project.teamConfig || []).findIndex((tc: any) => idOf(tc.userId) === userId);
          if (entryIdx >= 0 && (force || teamConfigAssignments(projectId, userId).length === 0)) {
            await Project.updateOne(
              { _id: project._id },
              { $set: { [`teamConfig.${entryIdx}.areaShiftAssignments`]: heredadas.map((a) => ({ areaId: a.areaId, shiftIds: a.shiftIds })) } },
            );
            project.teamConfig[entryIdx].areaShiftAssignments = heredadas;
          }
        }
      }

      if (upTouched) await up.save();
    }

    console.log("\n───────────── Resumen ─────────────");
    console.log(`Contratos con reemplazo revisados: ${conReemplazo}`);
    console.log(`Actualizados${dryRun ? " (simulado)" : ""}:            ${actualizados}`);
    console.log(`Sin cambios - ya tenían área:      ${skips.yaTiene}`);
    console.log(`Sin cambios - reemplazado no hallado: ${skips.sinReemplazado}`);
    console.log(`Sin cambios - reemplazado sin área:   ${skips.reemplazadoSinArea}`);
    console.log(`Sin cambios - área/turno ya no válido: ${skips.nadaAplicable}`);
    if (dryRun) console.log("\n(DRY RUN: no se escribió nada. Volvé a correr sin DRY=true para aplicar.)");
  } finally {
    await disconnectDB();
  }
}

backfillReplacementAreaShifts().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
