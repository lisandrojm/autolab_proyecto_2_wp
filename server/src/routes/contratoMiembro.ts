import { Router } from "express";
import { Types } from "mongoose";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import UserProject from "../models/UserProject.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { Company } from "../models/Company.js";
import { Categoria } from "../models/Categoria.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Convenio } from "../models/Convenio.js";
import { ArcaSucursal } from "../models/ArcaSucursal.js";
import { Info } from "../models/Info.js";
import { alcanceDeResponsable } from "../utils/visibilidadResponsable.js";
import { esContratoVigente, fechaISO, getContratoActivo, hoyArgentina } from "../utils/contratoVigencia.js";
import { z } from "zod";
import { cambiarTurnoEnFila, idDe, sedeDe, sedePrincipalDe, type CambioDeTurno } from "../compartido/areaTurno.js";
import { contratosQueRigenDelProyecto } from "../utils/contratosQueRigen.js";
import { superponerContratos } from "../services/equipoSegunContratos.js";
import { asignarAreasDeMiembro } from "../services/areasDeMiembro.js";

/*
  EL CONTRATO DE UN MIEMBRO, EN SÓLO LECTURA (Mis equipos → ícono de contrato, en la app).

  Es lo que muestra «Configurar Miembro» en el panel —contrato y sueldo— con los NOMBRES ya resueltos:
  quien entra por la app no tiene permiso para los catálogos (áreas, turnos, empresas, categorías), así
  que si viajaran los ids la pantalla no tendría con qué traducirlos.

  QUIÉN LO VE: el COORDINADOR DEL PROYECTO (el responsable, `metadata.responsableId`) y un admin. Nadie
  más: trae sueldos. Quien supervisa áreas y turnos no, aunque tenga a la persona a cargo (así se decidió).

  Qué contrato: el que RIGE hoy (`getContratoActivo`), la misma regla que usa el resto de la plataforma.
*/
const router = Router();

const nada = Promise.resolve(null);
const idValido = (x: unknown) => !!x && Types.ObjectId.isValid(String(x));
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * ¿Quien pide es el COORDINADOR DEL PROYECTO (el responsable, `metadata.responsableId`) o un admin? Es la
 * puerta de todo lo que la app deja hacer sobre el equipo de un proyecto: ver contratos, cambiar de turno.
 * Quien supervisa áreas y turnos no pasa, aunque tenga a la persona a cargo.
 */
async function coordinaElProyecto(req: AuthenticatedRequest, tenantId: Types.ObjectId, projectId: string): Promise<boolean> {
  const roles = ((req.user as any)?.roles || []).map((r: unknown) => String(r).toLowerCase());
  const primario = String((req.user as any)?.primaryRole || "").toLowerCase();
  if (roles.includes("admin") || roles.includes("superadmin") || primario === "admin" || primario === "superadmin") return true;
  const { proyectos } = await alcanceDeResponsable(tenantId, req.user!.userId);
  return proyectos.some((p) => String(p) === String(projectId));
}

router.get("/projects/:projectId/miembros/:userId/contrato", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId } = req.params;
    if (!idValido(projectId) || !idValido(userId)) {
      res.status(400).json({ error: "Proyecto o persona inválidos." });
      return;
    }
    const tenantId = req.tenantObjectId!;

    const proyecto: any = await Project.findOne({ _id: projectId, tenantId }).select("name").lean();
    if (!proyecto) {
      res.status(404).json({ error: "Proyecto no encontrado." });
      return;
    }

    if (!(await coordinaElProyecto(req, tenantId, projectId))) {
      res.status(403).json({ error: "Sólo el coordinador del proyecto puede ver los contratos de su equipo." });
      return;
    }

    const [asignacion, persona]: any[] = await Promise.all([
      UserProject.findOne({ projectId, userId }).select("contracts").lean(),
      User.findOne({ _id: userId, tenantId }).select("firstName lastName email metadata.fullName metadata.cuit").lean(),
    ]);
    if (!persona) {
      res.status(404).json({ error: "Persona no encontrada." });
      return;
    }

    const hoy = hoyArgentina();
    const c: any = getContratoActivo(asignacion?.contracts || [], hoy);
    if (!c) {
      res.json({ contrato: null });
      return;
    }

    // Área y turnos del contrato: la lista nueva, o el par viejo `areaId`/`shiftId` si es un contrato anterior.
    const asignaciones: { areaId: string; shiftIds: string[] }[] = (c.areaShiftAssignments || []).map((a: any) => ({ areaId: String(a.areaId || ""), shiftIds: (a.shiftIds || []).map(String) })).filter((a: any) => idValido(a.areaId));
    if (asignaciones.length === 0 && idValido(c.areaId)) asignaciones.push({ areaId: String(c.areaId), shiftIds: idValido(c.shiftId) ? [String(c.shiftId)] : [] });

    const categoriaId = Number(c.categoria_sat_id);
    const [areas, turnos, empresaContrato, empresaRelease, categoria, categoriaSat, sucursal, obraSocial, rol, reemplazado] = (await Promise.all([
      asignaciones.length > 0 ? Area.find({ _id: { $in: asignaciones.map((a) => a.areaId) } }).select("name").lean().exec() : Promise.resolve([]),
      asignaciones.some((a) => a.shiftIds.length > 0) ? Shift.find({ _id: { $in: asignaciones.flatMap((a) => a.shiftIds).filter(idValido) } }).select("name").lean().exec() : Promise.resolve([]),
      !c.nombre_empresa_contrato && idValido(c.empresaContratoId) ? Company.findById(c.empresaContratoId).select("razonSocial").lean().exec() : nada,
      !c.nombre_empresa_release && idValido(c.empresaReleaseId) ? Company.findById(c.empresaReleaseId).select("razonSocial").lean().exec() : nada,
      categoriaId > 0 ? Categoria.findOne({ legacyId: categoriaId }).select("codigoArca nombre convenio").lean().exec() : nada,
      categoriaId > 0 ? CategoriaSat.findOne({ "data.id": categoriaId }).select("name data.convenio").lean().exec() : nada,
      idValido(c.sucursalArcaId) ? ArcaSucursal.findById(c.sucursalArcaId).select("codigo domicilio localidad").lean().exec() : nada,
      c.obraSocialId != null ? Info.findOne({ type: "obra-social", "data.id": Number(c.obraSocialId) }).select("name").lean().exec() : nada,
      !c.nombre_rol_frame && Number(c.rol_frame_id) > 0 ? RoleFrame.findOne({ "data.rol.id": Number(c.rol_frame_id) }).select("name").lean().exec() : nada,
      c.reemplazo && Number(c.empleado_id_reemplezado) > 0 ? User.findOne({ tenantId, "metadata.id": Number(c.empleado_id_reemplezado) }).select("firstName lastName metadata.fullName").lean().exec() : nada,
    ])) as any[];

    // El convenio sale de la categoría: es a la que pertenece la categoría del contrato.
    const codigoConvenio: string = categoria?.convenio || categoriaSat?.data?.convenio || "";
    const convenio: any = codigoConvenio ? await Convenio.findOne({ externalId: codigoConvenio }).select("name").lean() : null;

    const areaDe = new Map((areas as any[]).map((a) => [String(a._id), a.name]));
    const turnoDe = new Map((turnos as any[]).map((s) => [String(s._id), s.name]));
    const nombreDe = (u: any) => u?.metadata?.fullName || `${u?.firstName || ""} ${u?.lastName || ""}`.trim();

    res.json({
      contrato: {
        empleado: nombreDe(persona) || persona.email || "",
        email: persona.email || "",
        cuil: persona.metadata?.cuit || "",
        proyecto: proyecto.name || "",
        rolFrame: c.nombre_rol_frame || rol?.name || "",
        empresaContrato: c.nombre_empresa_contrato || empresaContrato?.razonSocial || "",
        empresaRelease: c.nombre_empresa_release || empresaRelease?.razonSocial || "",
        convenio: codigoConvenio ? (convenio?.name ? `${codigoConvenio} — ${convenio.name}` : codigoConvenio) : "",
        // Como la muestra el panel: «código ARCA — nombre».
        categoria: categoria ? `${categoria.codigoArca ? `${categoria.codigoArca} — ` : ""}${categoria.nombre}` : c.nombre_categoria_sat || categoriaSat?.name || "",
        tipoContrato: c.nombre_contrato || "",
        estado: c.nombre_estado_empleado || "",
        fechaAlta: fechaISO(c.fecha_alta_contrato),
        fechaBaja: fechaISO(c.fecha_baja_contrato),
        vigente: esContratoVigente(c, hoy),
        horario: c.hora_inicio && c.hora_fin ? `${c.hora_inicio} a ${c.hora_fin}` : "",
        sede: c.nombre_sede || "",
        diasSemana: Array.isArray(c.dias_semana) ? c.dias_semana : [],
        diasPorSemana: num(c.dias_por_semana),
        diasRotativos: !!c.dias_rotativos,
        reemplazo: !!c.reemplazo,
        reemplazado: nombreDe(reemplazado),
        areasTurnos: asignaciones.map((a) => ({ area: areaDe.get(a.areaId) || c.nombre_area || "Área", turnos: a.shiftIds.map((s) => turnoDe.get(s)).filter(Boolean) })),
        sucursalArca: sucursal ? `${sucursal.codigo} — ${sucursal.domicilio}${sucursal.localidad ? `, ${sucursal.localidad}` : ""}` : "",
        actividadArca: c.actividadArca || "",
        obraSocial: obraSocial?.name || "",
        observaciones: c.observaciones || "",
        sueldo: {
          jornadas: num(c.cantidad_jornadas_laborales),
          porJornada: num(c.sueldo_jornada),
          enMano: num(c.sueldo_mano),
          enManoTexto: c.sueldo_mano_texto || "",
          diarioNeto: num(c.sueldo_diario_neto),
          diferenciaDiariaNeto: num(c.diferencia_diaria_neto),
          neto: num(c.sueldo_neto),
          bruto: num(c.sueldo_bruto),
        },
      },
    });
  } catch (error) {
    console.error("Contrato de miembro error:", error);
    res.status(500).json({ error: "No se pudo cargar el contrato." });
  }
});

/*
  CAMBIAR DE TURNO A UNA PERSONA DESDE LA APP (Equipos, 26/11/2026).

  Pedido: «tendría que poder cambiarlos de turno desde la plataforma mobile; una vez cambiados ya le pertenecen
  a otro supervisor; esto sólo lo puede hacer el coordinador». Lo último es lo que distingue a este endpoint
  del PATCH .../team-config/:userId/areas de la Jerarquía (que pasa con cualquier rol): acá sólo el
  coordinador del proyecto o un admin (`coordinaElProyecto`).

  Mueve a la persona de `deShiftId` a `aShiftId` DENTRO DE LA MISMA FILA DE ÁREA (área + sede): la regla es
  `cambiarTurnoEnFila` (compartido/areaTurno.ts). Sus otras áreas quedan como estaban. Cambiar de área sigue
  siendo de la Jerarquía del panel.

  Lo que escribe es exactamente lo mismo que la Jerarquía (`services/areasDeMiembro.ts`): la fila del equipo,
  el historial y el área/turno del contrato que rige. El supervisor nuevo sale solo: supervisor = quien tiene
  esa área y turno en `coordinatorAssignments`.

  La situación actual de la persona se lee como la ve la pantalla: el equipo con el contrato que rige
  superpuesto (`superponerContratos`). Si ya no está en ese turno —otro la movió, cambió el contrato que
  rige— se contesta 409 y la app vuelve a cargar la lista, en vez de inventarle una asignación.
*/
const cambiarTurnoSchema = z.object({
  areaId: z.string().refine(idValido, "Área inválida."),
  sedeId: z.coerce.number().int().positive().nullable().optional().transform((v) => v ?? null),
  deShiftId: z.string().refine(idValido, "Turno de origen inválido."),
  aShiftId: z.string().refine(idValido, "Turno de destino inválido."),
});

router.patch("/projects/:projectId/miembros/:userId/turno", requireTenant, authenticateToken, async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { projectId, userId } = req.params;
    if (!idValido(projectId) || !idValido(userId)) {
      res.status(400).json({ error: "Proyecto o persona inválidos." });
      return;
    }
    // Con `strictNullChecks` apagado zod infiere todo opcional: el esquema ya exigió cada campo.
    const cambio = cambiarTurnoSchema.parse(req.body) as CambioDeTurno & { areaId: string; deShiftId: string; aShiftId: string };
    if (cambio.deShiftId === cambio.aShiftId) {
      res.status(400).json({ error: "Elegí un turno distinto del actual." });
      return;
    }
    const tenantId = req.tenantObjectId!;

    const project = await Project.findOne({ _id: projectId, tenantId }).select("teamConfig areasConfig metadata.sedeIds metadata.sedeId");
    if (!project) {
      res.status(404).json({ error: "Proyecto no encontrado." });
      return;
    }
    if (!(await coordinaElProyecto(req, tenantId, projectId))) {
      res.status(403).json({ error: "Sólo el coordinador del proyecto puede cambiar de turno a su gente." });
      return;
    }

    // El destino tiene que ser un turno de ESA fila del área (área + sede) en el proyecto.
    const ctx = { areasConfig: (project as any).areasConfig as any[], sedePrincipal: sedePrincipalDe((project as any).metadata) };
    const fila = (ctx.areasConfig || []).find((f: any) => idDe(f.areaId) === cambio.areaId && sedeDe(f.sedeId) === cambio.sedeId);
    if (!fila || !(fila.shiftIds || []).some((s: unknown) => idDe(s) === cambio.aShiftId)) {
      res.status(400).json({ error: "Ese turno no está en el área del proyecto." });
      return;
    }

    const persona = await User.findOne({ _id: userId, tenantId, projectIds: project._id }).select("_id").lean();
    if (!persona) {
      res.status(404).json({ error: "La persona no está en el equipo de este proyecto." });
      return;
    }

    // Dónde está hoy, como lo muestra Equipos: la fila del equipo con el contrato que rige encima.
    const contratoDe = await contratosQueRigenDelProyecto(String(project._id), hoyArgentina());
    const filaDelEquipo = superponerContratos((project as any).teamConfig, contratoDe).find((c: any) => String(c.userId?._id ?? c.userId) === String(userId));
    const actuales: any[] = filaDelEquipo ? filaDelEquipo.areaShiftAssignments || [] : contratoDe.get(String(userId))?.areaShiftAssignments || [];
    const nuevas = cambiarTurnoEnFila(actuales, cambio, ctx);
    if (!nuevas) {
      res.status(409).json({ error: "La persona ya no está en ese turno. Se vuelve a cargar la lista." });
      return;
    }

    await asignarAreasDeMiembro({ tenantId, project, userId, asignaciones: nuevas, porUserId: req.user?.userId, origen: "mobile-equipos", payload: cambio });
    res.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors[0]?.message || "Datos inválidos.", details: error.errors });
      return;
    }
    console.error("Cambiar turno de miembro error:", error);
    res.status(500).json({ error: "No se pudo cambiar el turno." });
  }
});

export { router as contratoMiembroRoutes };
