/**
 * Quién ve el cumplimiento de quién. SÓLO LECTURA.
 *
 *   npx tsx src/scripts/medirAlcanceCumplimiento.ts <tenantId>
 *
 * Contesta lo que hay que saber antes de tocar el alcance: cuántos proyectos y cuántas personas
 * vería hoy cada quien que tiene el permiso, y por qué camino los alcanza.
 *
 * Existe porque "ve a todos" puede significar tres cosas distintas —es admin, es responsable de
 * todos los proyectos, o el filtro no filtra— y cada una se arregla de una forma diferente.
 */
import mongoose, { Types } from "mongoose";
import "../config/env.js";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { Project } from "../models/Project.js";
import { MOBILE_ACTIVITY_COMPLIANCE } from "../utils/permisosMobile.js";

const idStr = (v: any): string => (v && typeof v === "object" ? String(v._id || v) : String(v));

async function main() {
  const tenantId = new Types.ObjectId(process.argv[2]);
  await mongoose.connect(env.MONGO_URI, { dbName: env.MONGO_DB_NAME });

  const roles: any[] = await Role.find({ tenantId }).select("name permissions").lean();
  const conPermiso = roles.filter((r: any) => (r.permissions || []).includes(MOBILE_ACTIVITY_COMPLIANCE));
  console.log(`Roles con "${MOBILE_ACTIVITY_COMPLIANCE}": ${conPermiso.map((r: any) => r.name).join(", ") || "(ninguno)"}`);

  const proyectos: any[] = await Project.find({ tenantId }).select("name metadata.responsableId coordinatorAssignments").lean();
  console.log(`Proyectos: ${proyectos.length}`);

  /* Cuántas personas distintas están asignadas como coordinador, en total y por proyecto. */
  const todosLosAsignados = new Set<string>();
  const asignadosPorProyecto = new Map<string, Set<string>>();
  for (const p of proyectos) {
    const suyos = new Set<string>();
    for (const a of p.coordinatorAssignments || []) {
      const u = idStr(a.userId);
      if (!u || u === "undefined") continue;
      suyos.add(u);
      todosLosAsignados.add(u);
    }
    asignadosPorProyecto.set(String(p._id), suyos);
  }
  console.log(`Personas asignadas como coordinador en algún proyecto: ${todosLosAsignados.size}`);
  console.log(`Proyectos CON asignaciones: ${[...asignadosPorProyecto.values()].filter((s) => s.size > 0).length}\n`);

  const nombres = new Map<string, string>(
    (await User.find({ _id: { $in: [...todosLosAsignados] } }).select("firstName lastName").lean()).map((u: any) => [
      String(u._id),
      `${u.lastName || ""}, ${u.firstName || ""}`.trim(),
    ]),
  );

  console.log("PROYECTOS CON COORDINADORES ASIGNADOS:");
  for (const p of proyectos) {
    const suyos = asignadosPorProyecto.get(String(p._id))!;
    if (suyos.size === 0) continue;
    console.log(`   ${p.name}   responsableId=${p.metadata?.responsableId ?? "—"}   ${suyos.size} coordinador(es): ${[...suyos].map((u) => nombres.get(u) || u).join(" | ")}`);
  }

  /*
    Y ahora, por cada persona con el permiso: qué vería antes y qué ve ahora.

    `User.roles` son ObjectIds; el token lleva los NOMBRES. Hay que resolverlos o no matchea nada.
  */
  const nombrePorRolId = new Map(roles.map((r) => [String(r._id), r.name]));
  const idsConPermiso = new Set(conPermiso.map((r) => String(r._id)));

  const usuarios: any[] = await User.find({ tenantId, isSystem: { $ne: true } })
    .select("firstName lastName email roles primaryRole projectIds metadata.id")
    .lean();

  const candidatos = usuarios.filter((u: any) => (u.roles || []).some((r: any) => idsConPermiso.has(String(r))));
  console.log(`
PERSONAS QUE PUEDEN ENTRAR A CUMPLIMIENTO: ${candidatos.length}`);

  for (const u of candidatos) {
    const nombresDeSusRoles = (u.roles || []).map((r: any) => nombrePorRolId.get(String(r)) || String(r));
    const esAdmin = nombresDeSusRoles.some((n: string) => ["admin", "superadmin"].includes(String(n).toLowerCase()));
    const idFrame = Number(u.metadata?.id);

    const comoResponsable = Number.isFinite(idFrame) ? proyectos.filter((p: any) => Number(p.metadata?.responsableId) === idFrame) : [];
    const comoCoordinador = proyectos.filter((p: any) => asignadosPorProyecto.get(String(p._id))!.has(String(u._id)));
    const comoMiembro = proyectos.filter((p: any) => ((u.projectIds || []) as any[]).some((id) => String(id) === String(p._id)));

    /* Lo que veía: admin todo, el resto sólo donde era responsable. */
    const antes = esAdmin ? proyectos : comoResponsable;
    /* Lo que ve ahora en el TELÉFONO: los proyectos donde participa, por cualquiera de los tres caminos. */
    const ahora = [...new Map([...comoResponsable, ...comoCoordinador, ...comoMiembro].map((p: any) => [String(p._id), p])).values()];

    const gente = (lista: any[]) => {
      const s = new Set<string>();
      lista.forEach((p: any) => asignadosPorProyecto.get(String(p._id))!.forEach((x) => s.add(x)));
      return s.size;
    };

    console.log(
      `   ${((u.lastName || "") + ", " + (u.firstName || "")).padEnd(34)}` +
        `${(esAdmin ? "[admin]" : "[" + nombresDeSusRoles.join(",") + "]").padEnd(18)}` +
        `resp=${comoResponsable.length} coord=${comoCoordinador.length} miembro=${comoMiembro.length}` +
        `   →   web: ${gente(antes)} persona(s)   ·   móvil: ${gente(ahora)}`,
    );
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
