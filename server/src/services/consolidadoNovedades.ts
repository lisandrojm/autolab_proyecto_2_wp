/**
 * EL CONSOLIDADO DE NOVEDADES: de la base a la entrada de la regla (`utils/consolidadoNovedades.ts`).
 *
 * Junta, para un período y uno o más proyectos: los partes con su asistencia, los contratos de todo el
 * que tenga vínculo con el proyecto o figure en un parte, y los catálogos para poner nombres (áreas,
 * turnos, empresas, categorías, tipos de contrato, motivos, feriados, centro de costo). La regla es pura
 * y está testeada aparte; acá sólo se resuelven ids y nombres. Nada se escribe.
 *
 * Es por proyecto a propósito: una persona sin ningún parte en el mes es una alerta, y sin proyecto que
 * la acote serían las 1.500 personas del tenant.
 */
import { Types } from "mongoose";
import { Request } from "../models/Request.js";
import UserProject from "../models/UserProject.js";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Client } from "../models/Client.js";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Company } from "../models/Company.js";
import { CategoriaSat } from "../models/CategoriaSat.js";
import { Info } from "../models/Info.js";
import { RequestConfig } from "../models/RequestConfig.js";
import { Holiday } from "../models/Holiday.js";
import { CentroCosto } from "../models/CentroCosto.js";
import { Convenio } from "../models/Convenio.js";
import { ObraSocial } from "../models/ObraSocial.js";
import { CONVENIO_EXCLUIDO } from "../compartido/arca/afipCompleteness.js";
import { fechaISO } from "../utils/contratoVigencia.js";
import { consolidarNovedades, type Consolidado, type ContratoConsolidado, type EntradaConsolidado, type ParteConsolidado, type PersonaConsolidado } from "../utils/consolidadoNovedades.js";

export interface ProyectoDelConsolidado {
  id: string;
  nombre: string;
  cliente: string;
  /** «426 - La Nacion» (código y descripción del catálogo Tango). */
  centroCosto: string;
  /** Las dos columnas de la planilla de liquidación: CC («426») y Descripción («La Nacion»). */
  centroCostoCodigo: string;
  centroCostoDescripcion: string;
}

export interface ConsolidadoNovedades extends Consolidado {
  desde: string;
  hasta: string;
  proyectos: ProyectoDelConsolidado[];
  feriados: { fecha: string; nombre: string }[];
  motivos: string[];
  totales: { resumen: number; detalle: number; partes: number; revisar: number };
}

const oid = (v: unknown) => (v && Types.ObjectId.isValid(String(v)) ? new Types.ObjectId(String(v)) : null);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v)).trim();
const num = (v: unknown): number | null => { const n = Number(v); return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : n; };
const etiquetaTurno = (t: any) => (t ? `${t.name}${t.startTime && t.endTime ? ` (${t.startTime} - ${t.endTime})` : ""}` : "");

/** La entrada de la regla pura (personas, contratos, partes, feriados, motivos), ya con nombres resueltos. Sirve sola para medir (scripts). */
export async function entradaDelConsolidado(tenantId: Types.ObjectId, o: { desde: string; hasta: string; proyectoIds: string[] }): Promise<{ proyectos: ProyectoDelConsolidado[]; entrada: EntradaConsolidado }> {
  const proyectoOids = o.proyectoIds.map(oid).filter(Boolean) as Types.ObjectId[];
  const proyectosRaw: any[] = await Project.find({ _id: { $in: proyectoOids }, tenantId }).select("name clientId metadata.centroCostoId metadata.centroCostoEmpresaTangoId").lean();
  const clientes: any[] = await Client.find({ _id: { $in: proyectosRaw.map((p) => p.clientId).filter(Boolean) } }).select("name").lean();
  const centrosRaw: any[] = await CentroCosto.find({ "data.id": { $in: proyectosRaw.map((p) => p.metadata?.centroCostoId).filter((x) => Number.isFinite(Number(x)) && x !== null) } }).select("codAuxiliar descAuxiliar name data empresaTangoId").lean();
  const nombreCliente = new Map(clientes.map((c) => [String(c._id), str(c.name)]));
  const centroDe = (p: any) => {
    const candidatos = centrosRaw.filter((c) => Number(c.data?.id) === Number(p.metadata?.centroCostoId));
    const c = candidatos.find((x) => !p.metadata?.centroCostoEmpresaTangoId || x.empresaTangoId === p.metadata?.centroCostoEmpresaTangoId) || candidatos[0];
    if (!c) return { codigo: "", descripcion: "", etiqueta: "" };
    const codigo = str(c.codAuxiliar) || str(c.name);
    // El catálogo trae «426 - La Nacion»: la descripción sola es lo que la planilla pone en su columna.
    const descripcion = (str(c.descAuxiliar) || str(c.name)).replace(new RegExp(`^${codigo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-?\\s*`), "").trim() || codigo;
    return { codigo, descripcion, etiqueta: codigo && descripcion !== codigo ? `${codigo} - ${descripcion}` : codigo || descripcion };
  };
  const proyectos: ProyectoDelConsolidado[] = proyectosRaw.map((p) => { const cc = centroDe(p); return { id: String(p._id), nombre: str(p.name), cliente: nombreCliente.get(String(p.clientId || "")) || "", centroCosto: cc.etiqueta, centroCostoCodigo: cc.codigo, centroCostoDescripcion: cc.descripcion }; });
  const proyectoDe = new Map(proyectos.map((p) => [p.id, p]));
  const idsProyecto = proyectos.map((p) => new Types.ObjectId(p.id));

  const [partesRaw, ups, areas, turnos, empresas, categorias, tipos, motivosRaw, feriadosRaw, convenios, obrasSociales] = await Promise.all([
    Request.find({ tenantId, projectId: { $in: idsProyecto }, date: { $gte: o.desde, $lte: o.hasta } }).select("reportNumber date projectId areaId shiftId userId comments attendance").lean() as Promise<any[]>,
    UserProject.find({ projectId: { $in: idsProyecto } }).select("userId projectId contracts").lean() as Promise<any[]>,
    Area.find({ tenantId }).select("name").lean() as Promise<any[]>,
    Shift.find({ tenantId }).select("name startTime endTime").lean() as Promise<any[]>,
    Company.find({}).select("razonSocial obraSocialDefaultId obraSocialId").lean() as Promise<any[]>,
    CategoriaSat.find({}).select("name data.id data.numeroCategoria data.convenio").lean() as Promise<any[]>,
    Info.find({ type: "contrato" }).select("name data.id").lean() as Promise<any[]>,
    RequestConfig.find({ tenantId }).select("name order").sort({ order: 1, name: 1 }).lean() as Promise<any[]>,
    Holiday.find({ tenantId, date: { $gte: new Date(`${o.desde}T00:00:00Z`), $lte: new Date(`${o.hasta}T23:59:59Z`) } }).select("date name").lean() as Promise<any[]>,
    Convenio.find({}).select("externalId obraSocialDefaultId").lean() as Promise<any[]>,
    ObraSocial.find({}).select("externalId data.id").lean() as Promise<any[]>,
  ]);
  const areaPorId = new Map(areas.map((a) => [String(a._id), str(a.name)]));
  const turnoPorId = new Map(turnos.map((t) => [String(t._id), t]));
  const empresaPorId = new Map(empresas.map((e) => [String(e._id), str(e.razonSocial)]));
  const categoriaPorNum = new Map(categorias.map((c) => [Number(c.data?.id), str(c.name)]));
  const categoriaDatos = new Map(categorias.map((c) => [Number(c.data?.id), { grupo: num(c.data?.numeroCategoria), convenio: str(c.data?.convenio) }]));
  // La cascada de obra social de ARCA (`afipCompleteness.ts`): contrato → convenio de la categoría → empleadora si la categoría está excluida de convenio.
  const rnosPorDataId = new Map(obrasSociales.map((os) => [Number(os.data?.id), str(os.externalId)]));
  const osDelConvenio = new Map(convenios.map((c) => [str(c.externalId), num(c.obraSocialDefaultId)]));
  const osDeLaEmpresa = new Map(empresas.map((e) => [String(e._id), num(e.obraSocialDefaultId ?? e.obraSocialId)]));
  const obraSocialDe = (c: any): { codigo: string; origen: ContratoConsolidado["obraSocialOrigen"] } => {
    const propia = rnosPorDataId.get(Number(c.obraSocialId));
    if (c.obraSocialId && propia) return { codigo: propia, origen: "contrato" };
    const convenio = categoriaDatos.get(Number(c.categoria_sat_id))?.convenio || "";
    const delConvenio = rnosPorDataId.get(Number(osDelConvenio.get(convenio)));
    if (delConvenio) return { codigo: delConvenio, origen: "convenio" };
    const deLaEmpresa = convenio === CONVENIO_EXCLUIDO ? rnosPorDataId.get(Number(osDeLaEmpresa.get(String(c.empresaContratoId || "")))) : undefined;
    if (deLaEmpresa) return { codigo: deLaEmpresa, origen: "empresa" };
    return { codigo: "", origen: "" };
  };
  const tipoPorNum = new Map(tipos.map((t) => [Number(t.data?.id), str(t.name)]));
  const unicoPorHorario = (entrada: string, salida: string) => { if (!entrada || !salida) return null; const m = turnos.filter((t) => t.startTime === entrada && t.endTime === salida); return m.length === 1 ? m[0] : null; };

  // Personas: vínculos del proyecto, quien figure en un parte, reemplazantes y responsables.
  const idsPersonas = new Set<string>();
  for (const up of ups) idsPersonas.add(String(up.userId));
  for (const p of partesRaw) { idsPersonas.add(String(p.userId || "")); for (const a of p.attendance || []) { idsPersonas.add(String(a.employeeId || "")); if (a.replacementId) idsPersonas.add(String(a.replacementId)); } }
  idsPersonas.delete("");
  const usuarios: any[] = await User.find({ _id: { $in: [...idsPersonas].map(oid).filter(Boolean) } }).select("firstName lastName email metadata.cuit metadata.numeroLegajoTango metadata.fullName metadata.apellido metadata.nombre").lean();
  const personas: PersonaConsolidado[] = usuarios.map((u) => ({
    id: String(u._id),
    nombre: [str(u.lastName), str(u.firstName)].filter(Boolean).join(", ") || str(u.metadata?.fullName) || str(u.email) || String(u._id),
    // La ficha ya los tiene separados (`metadata.apellido`/`nombre`); si no, lo que diga el usuario.
    apellido: str(u.metadata?.apellido) || str(u.lastName),
    nombrePila: str(u.metadata?.nombre) || str(u.firstName),
    cuil: str(u.metadata?.cuit).replace(/\D/g, ""),
    legajo: str(u.metadata?.numeroLegajoTango),
  }));
  const nombreDe = new Map(personas.map((p) => [p.id, p.nombre]));

  const contratos: ContratoConsolidado[] = [];
  for (const up of ups) {
    const proyecto = proyectoDe.get(String(up.projectId));
    if (!proyecto) continue;
    (up.contracts || []).forEach((c: any, i: number) => {
      if (!c || c.estadoContrato === "ANULADO") return; // lápida (etapa 2b)
      const alta = fechaISO(c.fecha_alta_contrato);
      if (!alta) return;
      const asignaciones: any[] = Array.isArray(c.areaShiftAssignments) ? c.areaShiftAssignments : [];
      const idsTurno = [...new Set([...(c.shiftId ? [String(c.shiftId)] : []), ...asignaciones.flatMap((a) => (a?.shiftIds || []).map(String))])];
      contratos.push({
        key: String(c.contratoKey || `${up._id}#${i}`),
        personaId: String(up.userId),
        proyectoId: proyecto.id,
        proyecto: proyecto.nombre,
        centroCosto: proyecto.centroCosto,
        alta,
        baja: fechaISO(c.fecha_baja_contrato),
        tipo: str(c.nombre_contrato) || tipoPorNum.get(Number(c.tipo_contrato_id)) || "",
        tipoId: str(c.tipo_contrato_id),
        empresa: str(c.nombre_empresa_contrato) || empresaPorId.get(String(c.empresaContratoId || "")) || "",
        empresaId: str(c.empresaContratoId),
        // El catálogo primero: el nombre guardado en el contrato envejece («Sin categoria» con el id de Asistente de Iluminación).
        categoria: categoriaPorNum.get(Number(c.categoria_sat_id)) || str(c.nombre_categoria_sat) || "",
        categoriaId: str(c.categoria_sat_id),
        grupo: categoriaDatos.get(Number(c.categoria_sat_id))?.grupo ?? null,
        obraSocialCodigo: obraSocialDe(c).codigo,
        obraSocialOrigen: obraSocialDe(c).origen,
        area: str(c.nombre_area) || areaPorId.get(String(c.areaId || asignaciones[0]?.areaId || "")) || "",
        turno: str(c.nombre_turno) || idsTurno.map((id) => str(turnoPorId.get(id)?.name)).filter(Boolean).join(", "),
        horaInicio: str(c.hora_inicio),
        horaFin: str(c.hora_fin),
        sueldoJornada: num(c.sueldo_jornada),
        sueldoMano: num(c.sueldo_mano),
        fechasTrabajadas: [...new Set((Array.isArray(c.fechas_trabajadas) ? c.fechas_trabajadas : []).map((f: unknown) => fechaISO(String(f))).filter(Boolean))].sort() as string[],
        diasSemana: [...new Set((Array.isArray(c.dias_semana) ? c.dias_semana : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))] as number[],
        rotativo: !!c.dias_rotativos,
      });
    });
  }

  const partes: ParteConsolidado[] = partesRaw.map((p) => {
    const proyecto = proyectoDe.get(String(p.projectId || ""))!;
    const turnoParte = turnoPorId.get(String(p.shiftId || ""));
    return {
      numero: str(p.reportNumber),
      fecha: str(p.date).slice(0, 10),
      proyectoId: proyecto.id,
      proyecto: proyecto.nombre,
      area: areaPorId.get(String(p.areaId || "")) || "",
      turno: etiquetaTurno(turnoParte),
      responsable: nombreDe.get(String(p.userId || "")) || "",
      comentario: str(p.comments),
      registros: (p.attendance || []).map((a: any) => {
        const entradaPrevista = str(a.scheduleInTime), salidaPrevista = str(a.scheduleOutTime);
        // El turno de la fila: el suyo si va dos veces en el parte, el del parte, o el único que tiene ese horario.
        const turno = turnoPorId.get(String(a.shiftId || "")) || turnoParte || unicoPorHorario(entradaPrevista, salidaPrevista);
        return {
          personaId: String(a.employeeId || ""),
          status: str(a.status),
          motivo: str(a.absenceReason),
          reemplazanteId: a.replacementId ? String(a.replacementId) : "",
          extras: Number(a.overtimeHours) || 0,
          h50: Number(a.overtimeHours50) || 0,
          h100: Number(a.overtimeHours100) || 0,
          entradaReal: str(a.inTime),
          salidaReal: str(a.outTime),
          entradaPrevista,
          salidaPrevista,
          area: areaPorId.get(String(a.areaId || p.areaId || "")) || "",
          turno: etiquetaTurno(turno),
        };
      }),
    };
  });

  const feriados = feriadosRaw.map((h) => ({ fecha: new Date(h.date).toISOString().slice(0, 10), nombre: str(h.name) })).filter((h) => h.fecha >= o.desde && h.fecha <= o.hasta).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const motivos = [...new Set(motivosRaw.map((m) => str(m.name)).filter(Boolean))];
  return { proyectos, entrada: { desde: o.desde, hasta: o.hasta, personas, contratos, partes, feriados, motivos } };
}

export async function armarConsolidado(tenantId: Types.ObjectId, o: { desde: string; hasta: string; proyectoIds: string[] }): Promise<ConsolidadoNovedades> {
  const { proyectos, entrada } = await entradaDelConsolidado(tenantId, o);
  const resultado = consolidarNovedades(entrada);
  return { desde: o.desde, hasta: o.hasta, proyectos, feriados: entrada.feriados, motivos: entrada.motivos, ...resultado, totales: { resumen: resultado.resumen.length, detalle: resultado.detalle.length, partes: resultado.partes.length, revisar: resultado.revisar.length } };
}
