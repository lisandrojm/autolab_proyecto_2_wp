import "dotenv/config";
import { connectDB, disconnectDB } from "../config/db.js";
import { Tenant } from "../models/Tenant.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Info } from "../models/Info.js";
import { idDe, sedeDe, sedePrincipalDe, clavesDelMiembro } from "../compartido/areaTurno.js";

/**
 * COMPLETAR LA SEDE EN LAS ASIGNACIONES YA CARGADAS (área × sede explícita, 18/10/2026).
 *
 * Desde ahora la fila (sede) de cada persona en un área sale de la `sedeId` de su asignación, sin
 * deducir nada del contrato. Las asignaciones de antes no tienen sede. Este script se la completa,
 * para que quede todo explícito:
 *
 *   · si el área tiene UNA sola fila en el proyecto → la sede de esa fila (la principal del proyecto si
 *     la fila es la sin sede);
 *   · si tiene varias → la principal del proyecto;
 *   · EXCEPCIÓN pedida por el usuario: el área «Libertador» → la sede «Libertador» (por nombre; se pueden
 *     forzar otras con FORZAR).
 *
 * Sólo COMPLETA `sedeId` donde falta: nunca agrega ni borra asignaciones, ni cambia una sede ya
 * elegida. Toca `projects.teamConfig[].areaShiftAssignments` y
 * `users_&_projects.contracts[].areaShiftAssignments`. Los supervisores (`coordinatorAssignments`) no
 * se tocan: siguen en la fila sin sede, que es la principal.
 *
 * ORDEN EN PRODUCCIÓN: primero deploy del código con la regla explícita; después este script en DRY;
 * después sin DRY. Con el código VIEJO no se corre: la regla vieja trataba la sede principal como una
 * fila aparte y desacomodaría supervisores y conteos.
 *
 * Variables de entorno:
 *   DRY=true                    -> no escribe; lista qué haría (DEFAULT recomendado la primera vez).
 *   TENANT_SLUG / TENANT_ID     -> (opcional) un solo tenant; sin esto, todos.
 *   PROJECT_ID=<ObjectId>       -> (opcional) un solo proyecto.
 *   AREA_EXCEPCION=Libertador   -> (opcional) nombre del área que va a su propia sede (default «Libertador»).
 *   SEDE_EXCEPCION=Libertador   -> (opcional) nombre de esa sede (default «Libertador»).
 *   FORZAR="<projectId>:<areaId>=<sedeId>,..." -> (opcional) más excepciones por id.
 *
 * Uso: npm run sede:asignaciones:dry   (y después)   npm run sede:asignaciones
 */

const DRY = String(process.env.DRY).toLowerCase() === "true";
const norm = (s: unknown) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

function forzadas(): Map<string, number> {
  const m = new Map<string, number>();
  for (const parte of String(process.env.FORZAR || "").split(",").map((x) => x.trim()).filter(Boolean)) {
    const [clave, sede] = parte.split("=");
    const [pid, aid] = String(clave || "").split(":");
    if (pid && aid && sedeDe(sede)) m.set(`${pid}:${aid}`, sedeDe(sede)!);
    else console.warn(`FORZAR ignorado (formato <projectId>:<areaId>=<sedeId>): ${parte}`);
  }
  return m;
}

async function main() {
  await connectDB();
  const nombreAreaExcepcion = norm(process.env.AREA_EXCEPCION || "Libertador");
  const nombreSedeExcepcion = norm(process.env.SEDE_EXCEPCION || "Libertador");
  const forzar = forzadas();

  // La sede de la excepción, en el catálogo global de sedes (Info type "sede", sin tenantId).
  const sedes: any[] = await Info.find({ type: "sede" }).select("name data.id data.nombre").lean();
  const sedeExcepcion = sedes.find((s) => norm(s.data?.nombre || s.name) === nombreSedeExcepcion);
  const idSedeExcepcion = sedeDe(sedeExcepcion?.data?.id);
  const nombreSede = (id: number | null | undefined) => (id ? String(sedes.find((s) => Number(s.data?.id) === id)?.data?.nombre || sedes.find((s) => Number(s.data?.id) === id)?.name || `Sede ${id}`) : "—");
  console.log(`\n${DRY ? "DRY RUN (no escribe nada)" : "APLICANDO CAMBIOS"}`);
  console.log(`Excepción: área «${process.env.AREA_EXCEPCION || "Libertador"}» → sede ${idSedeExcepcion ? `«${nombreSede(idSedeExcepcion)}» (id ${idSedeExcepcion})` : "NO ENCONTRADA (no se aplica)"}`);
  if (forzar.size) console.log(`FORZAR: ${[...forzar.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`);

  const tenantSlug = process.env.TENANT_SLUG?.trim();
  const tenantIdEnv = process.env.TENANT_ID?.trim();
  const tenants: any[] = await Tenant.find(tenantIdEnv ? { _id: tenantIdEnv } : tenantSlug ? { slug: tenantSlug } : {}).select("_id slug name").lean();

  let totalTeam = 0;
  let totalContratos = 0;
  let totalMovidos = 0;

  for (const tenant of tenants) {
    const tenantId = tenant._id;
    const areas: any[] = await Area.find({ tenantId }).select("_id name").lean();
    const nombreArea = new Map(areas.map((a) => [String(a._id), a.name]));
    const filtro: any = { tenantId };
    if (process.env.PROJECT_ID) filtro._id = process.env.PROJECT_ID.trim();
    const proyectos: any[] = await Project.find(filtro).select("_id name areasConfig teamConfig metadata.sedeIds metadata.sedeId").lean();

    for (const p of proyectos) {
      const pid = String(p._id);
      const areasConfig: any[] = p.areasConfig || [];
      if (areasConfig.length === 0) continue;
      const principal = sedePrincipalDe(p.metadata);

      /** La sede a completar para una asignación de esa área, o null si no se completa. */
      const sedePara = (areaId: string): number | null => {
        const f = forzar.get(`${pid}:${areaId}`);
        if (f) return f;
        const filas = areasConfig.filter((x) => idDe(x.areaId) === areaId);
        if (filas.length === 0) return null; // el área ya no está en el proyecto: no se toca
        if (idSedeExcepcion && norm(nombreArea.get(areaId)) === nombreAreaExcepcion) return idSedeExcepcion;
        if (filas.length === 1) return sedeDe(filas[0].sedeId) ?? principal;
        return principal;
      };

      const completar = (asignaciones: any[]): { nuevas: any[]; cambios: number } => {
        let cambios = 0;
        const nuevas = (asignaciones || []).map((a: any) => {
          if (sedeDe(a?.sedeId)) return a;
          const sede = sedePara(idDe(a?.areaId));
          if (!sede) return a;
          cambios++;
          return { ...a, sedeId: sede };
        });
        return { nuevas, cambios };
      };

      // ── teamConfig ──
      const team: any[] = p.teamConfig || [];
      let cambiosTeam = 0;
      const teamNuevo = team.map((c: any) => {
        const { nuevas, cambios } = completar(c.areaShiftAssignments || []);
        cambiosTeam += cambios;
        return cambios ? { ...c, areaShiftAssignments: nuevas } : c;
      });

      // ── contratos ──
      const ups: any[] = await UserProject.find({ projectId: p._id }).select("_id userId contracts.areaShiftAssignments").lean();
      const setsContratos: Array<{ _id: any; set: Record<string, any> }> = [];
      let cambiosContratos = 0;
      for (const up of ups) {
        const set: Record<string, any> = {};
        (up.contracts || []).forEach((c: any, i: number) => {
          const { nuevas, cambios } = completar(c?.areaShiftAssignments || []);
          if (cambios) {
            set[`contracts.${i}.areaShiftAssignments`] = nuevas;
            cambiosContratos += cambios;
          }
        });
        if (Object.keys(set).length) setsContratos.push({ _id: up._id, set });
      }

      if (!cambiosTeam && !cambiosContratos) continue;

      // ── Antes / después: en qué fila queda cada persona (con la regla nueva). Tiene que dar igual salvo la excepción. ──
      const ctx = { areasConfig, sedePrincipal: principal };
      const ultimoContrato = new Map<string, any[]>(ups.map((up) => [String(up.userId), (up.contracts || []).slice(-1)[0]?.areaShiftAssignments || []]));
      const teamPorUsuario = new Map<string, any>(team.map((c: any) => [String(c.userId), c]));
      const teamNuevoPorUsuario = new Map<string, any>(teamNuevo.map((c: any) => [String(c.userId), c]));
      const usuarios = new Set<string>([...teamPorUsuario.keys(), ...ultimoContrato.keys()]);
      const movidos: string[] = [];
      for (const uid of usuarios) {
        const antes = (teamPorUsuario.get(uid)?.areaShiftAssignments || []).length ? teamPorUsuario.get(uid).areaShiftAssignments : ultimoContrato.get(uid) || [];
        const despuesBase = (teamNuevoPorUsuario.get(uid)?.areaShiftAssignments || []).length ? teamNuevoPorUsuario.get(uid).areaShiftAssignments : completar(ultimoContrato.get(uid) || []).nuevas;
        const a = [...clavesDelMiembro(antes, ctx)].sort().join("|");
        const d = [...clavesDelMiembro(despuesBase, ctx)].sort().join("|");
        if (a !== d) movidos.push(uid);
      }
      const nombres = movidos.length ? ((await User.find({ _id: { $in: movidos.slice(0, 15) } }).select("firstName lastName").lean()) as any[]).map((u) => `${u.firstName || ""} ${u.lastName || ""}`.trim()) : [];

      // Resumen por área.
      const porArea = new Map<string, number>();
      for (const c of team) for (const a of c.areaShiftAssignments || []) if (!sedeDe(a?.sedeId) && sedePara(idDe(a?.areaId))) porArea.set(idDe(a.areaId), (porArea.get(idDe(a.areaId)) || 0) + 1);
      console.log(`\n[${tenant.slug || tenant.name}] ${p.name} — principal: ${nombreSede(principal)}`);
      for (const [aid, n] of porArea) console.log(`   ${nombreArea.get(aid) || aid}: ${n} asignación(es) de equipo → ${nombreSede(sedePara(aid))}`);
      console.log(`   teamConfig: ${cambiosTeam} asignación(es) · contratos: ${cambiosContratos} asignación(es) en ${setsContratos.length} vínculo(s)`);
      console.log(`   Cambian de fila: ${movidos.length}${nombres.length ? ` (${nombres.join(", ")}${movidos.length > nombres.length ? ", …" : ""})` : ""}`);

      totalTeam += cambiosTeam;
      totalContratos += cambiosContratos;
      totalMovidos += movidos.length;

      if (!DRY) {
        if (cambiosTeam) await Project.updateOne({ _id: p._id, tenantId }, { $set: { teamConfig: teamNuevo } });
        for (const s of setsContratos) await UserProject.updateOne({ _id: s._id, projectId: p._id }, { $set: s.set });
      }
    }
  }

  console.log(`\nTOTAL: teamConfig ${totalTeam} · contratos ${totalContratos} · personas que cambian de fila ${totalMovidos}`);
  console.log(DRY ? "Nada se escribió (DRY). Revisá que «cambian de fila» sea sólo la gente del área de la excepción." : "Listo.");
  await disconnectDB();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDB();
  process.exit(1);
});
