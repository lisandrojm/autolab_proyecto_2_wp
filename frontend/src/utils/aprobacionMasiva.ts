/**
 * ═══════════════════════════════════════════════════════════════════════
 * APROBAR UNA SOLICITUD SIN ABRIR EL FORMULARIO
 * ═══════════════════════════════════════════════════════════════════════
 *
 * «Aprobar N» en Admin → Solicitudes aprueba todas de una, tal cual se pidieron. El contrato que se
 * guarda tiene que ser EL MISMO que armaría el formulario de Agregar Miembro si se lo abriera y se
 * tocara Guardar sin cambiar nada: esta función repite, en el mismo orden, lo que hacen
 * `abrirWizardAhora` (qué se precarga y de dónde), sus efectos (jornadas del calendario, sueldos
 * derivados de la categoría) y `faltantesPaso1` (qué es obligatorio) en `pages/ProjectTeamPage.tsx`.
 * Si cambia una regla allá, cambia acá.
 *
 * Lo que el formulario resolvería preguntando —una categoría que falta, una plantilla entre varias,
 * el motivo de una categoría de otra valoración— acá NO se inventa: la solicitud queda pendiente con
 * el motivo, para aprobarla a mano con «Editar para Aprobar». Las reglas que valida el server (días,
 * valoración) las sigue validando él al guardar (`assign-member`), igual que desde el formulario.
 */

import { User } from "../api/users";
import { CategoriaSatItem } from "../api/categoriasSat";
import { InfoItem } from "../api/info";
import { tramiteSinConvenioNiCategoria } from "@compartido/tramiteSinEscala";
import { RoleFrameItem } from "../api/roleFrames";
import { ContratoFrameItem, plantillaEsDeContrato } from "../api/contratosFrame";
import { ContratoItem } from "../api/contratos";
import { getContratoActivo } from "./contratoVigencia";
import { estadoImpositivoDePlantilla, tipoImpositivoDeContrato } from "./tramiteImpositivo";
import { erroresDeJornadas, jornadasCalculadasDelPedido, periodoDeCalculo } from "./jornadas";
import { horasDelHorario } from "./horario";
import { faltaDefinirDias } from "../components/contratos/DiasDeTrabajo";
import { numeroALetras } from "./numeroALetras";

/** Los catálogos con que el formulario traduce la solicitud. Mismas listas que carga `ProjectTeamPage`. */
export interface CatalogosAprobacion {
  categoriasSat: CategoriaSatItem[];
  estados: InfoItem[];
  sedes: InfoItem[];
  roleFrames: RoleFrameItem[];
  contratoFrames: ContratoFrameItem[];
  contratos: ContratoItem[];
}

/** Lo mínimo del proyecto que usa el armado. */
export interface ProyectoAprobacion {
  _id: string;
  externalId?: unknown;
  metadata?: any;
  teamConfig?: Array<{ userId: unknown; areaShiftAssignments?: any[] }>;
}

export interface ContratoArmado {
  /** El `contract` que se manda a `assign-member`, igual que desde el formulario. */
  contract: Record<string, any>;
  /** El rol pedido, si la persona no lo tiene en su ficha: se le suma después de guardar. */
  rolParaLaFicha: RoleFrameItem | null;
}

const fecha = (v: unknown): string => {
  if (!v) return "";
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
};
const idDe = (x: any): string => String(x && typeof x === "object" ? x._id : x || "");

/**
 * Arma el contrato de una solicitud, o dice qué le falta.
 *
 * `solicitud` es la solicitud completa; `persona`, la persona real a la que va el contrato (la
 * solicitud misma si no apunta a otra). Es la misma distinción del formulario: el contrato anterior
 * y el historial son los de quien va a firmar.
 */
export function contratoDesdeSolicitud({ solicitud, persona, proyecto, cat }: { solicitud: User; persona: User; proyecto: ProyectoAprobacion; cat: CatalogosAprobacion }): { ok: true; armado: ContratoArmado } | { ok: false; faltan: string[] } {
  const ms: any = solicitud.metadata || {};

  // ── El contrato anterior de la persona: sólo punto de partida (aprobar SIEMPRE agrega uno nuevo). ──
  const proyectosDeLaPersona: any[] = (persona.metadata as any)?.projects || [];
  const enEsteProyecto = proyectosDeLaPersona.find((p) => idDe(p.projectId) === String(proyecto._id));
  const ultimoProyecto = enEsteProyecto || (proyectosDeLaPersona.length ? proyectosDeLaPersona[proyectosDeLaPersona.length - 1] : null);
  const anterior: any = getContratoActivo((ultimoProyecto?.contracts as any[]) || []) || null;

  // ── La plantilla y el tipo de contrato pedidos (si la solicitud no los trae, los del anterior). ──
  const cfAnterior = cat.contratoFrames.find((cf) => cf.name === anterior?.nombre_contrato) || (anterior?.tipo_contrato_id != null ? cat.contratoFrames.find((cf) => cf.data?.id != null && String(cf.data.id) === String(anterior.tipo_contrato_id)) : undefined);
  const plantillasPedidas = ms.contratoId ? cat.contratoFrames.filter((cf) => plantillaEsDeContrato(cf, ms.contratoId)) : [];
  const plantillaPedida = plantillasPedidas.length === 1 ? plantillasPedidas[0] : plantillasPedidas.find((cf) => cf._id === cfAnterior?._id);
  const cf = ms.contratoId ? plantillaPedida : cfAnterior;
  // Sin pedido: el tipo del contrato anterior (`contrato_id`) y, si no lo guardó, el principal de su
  // plantilla — que puede ser de varios tipos (`contratoIds`), así que es la última opción.
  const contratoId = ms.contratoId ? String(ms.contratoId) : idDe(anterior?.contrato_id) || idDe(cfAnterior?.contratoId) || String((persona.metadata as any)?.contratoId || "");

  // ── Rol, categoría, sede, estado ──
  const rolIdPedido = idDe(ms.roles_frame?.[0] ?? ms.rolesFrameIds?.[0]);
  const rolPedido = rolIdPedido ? cat.roleFrames.find((r) => String(r._id) === rolIdPedido) : undefined;
  const rolAnterior = anterior?.rol_frame_id ? String(anterior.rol_frame_id) : ultimoProyecto?.nombre_rol_frame ? String(cat.roleFrames.find((r) => r.name === ultimoProyecto.nombre_rol_frame)?.data?.rol?.id ?? "") : "";
  const rolFrameId = rolPedido?.data?.rol?.id != null ? String(rolPedido.data.rol.id) : rolAnterior;

  const catPedida = ms.categoriaSatId ? cat.categoriasSat.find((c) => String(c._id) === String(ms.categoriaSatId) || String(c.data?.id) === String(ms.categoriaSatId)) : undefined;
  const catAnterior = anterior?.categoria_sat_id ? cat.categoriasSat.find((c) => String(c.data?.id) === String(anterior.categoria_sat_id) || String(c._id) === String(anterior.categoria_sat_id)) : undefined;
  const categoria = catPedida || catAnterior;
  const categoriaSatId = categoria?.data?.id != null ? String(categoria.data.id) : "";

  // La sede es la del proyecto; sólo sin ella, la del contrato anterior.
  const sedeId = proyecto.metadata?.sedeId ? String(proyecto.metadata.sedeId) : anterior?.sede_id ? String(anterior.sede_id) : String(cat.sedes.find((s) => s.name === anterior?.nombre_sede)?.data?.id ?? "");

  // Un contrato nuevo arranca en el estado impositivo de su plantilla (ver `estadoDelContratoNuevo`).
  const estado = estadoImpositivoDePlantilla(cat.estados, cf?._id);
  const estadoId = estado ? String(estado.data.id) : "";

  // ── Área y turno: los de la solicitud primero; si no, los del equipo o los del contrato anterior. ──
  const delEquipo = (proyecto.teamConfig || []).find((c) => String(c.userId) === String(persona._id))?.areaShiftAssignments || [];
  const fuenteAreas: any[] = Array.isArray(ms.areaShiftAssignments) && ms.areaShiftAssignments.length ? ms.areaShiftAssignments : delEquipo.length ? delEquipo : anterior?.areaShiftAssignments || [];
  const areaShiftAssignments = fuenteAreas.map((a) => ({ areaId: idDe(a.areaId), shiftIds: (a.shiftIds || []).map(idDe) })).filter((a) => a.areaId);

  // ── Horario y fechas ──
  const [hIni, hFin] = String(ms.schedule || "").includes("-") ? String(ms.schedule).split("-").map((s) => s.trim()) : ["", ""];
  const horaInicio = hIni && hFin ? hIni : anterior?.hora_inicio || "09:00";
  const horaFin = hIni && hFin ? hFin : anterior?.hora_fin || "18:00";
  const contratoSel = cat.contratos.find((c) => c._id === contratoId) || null;
  const indeterminado = !!contratoSel?.data?.esTiempoIndeterminado;
  const fechaAlta = ms.startDate ? String(ms.startDate).slice(0, 10) : fecha(anterior?.fecha_alta_contrato) || fecha(new Date());
  const fechaBaja = indeterminado ? "" : ms.dueDate ? String(ms.dueDate).slice(0, 10) : fecha(anterior?.fecha_baja_contrato);

  // ── Días y jornadas: las del calendario, salvo que la solicitud las haya ajustado a mano. ──
  const diasPorSemana = Number(ms.diasPorSemana) || Number(anterior?.dias_por_semana) || 5;
  const diasSemana: number[] = Array.isArray(ms.diasSemana) && ms.diasSemana.length ? ms.diasSemana : Array.isArray(anterior?.dias_semana) ? anterior.dias_semana : [];
  const diasRotativos = ms.diasRotativos !== undefined ? !!ms.diasRotativos : !!anterior?.dias_rotativos;
  const periodo = periodoDeCalculo(fechaAlta, fechaBaja, indeterminado);
  // La misma regla que el formulario: por período, base 30 del tipo de contrato; si no, el calendario.
  const porDiasSueltos = contratoSel?.data?.modoFechas === "dias";
  const calculadas = jornadasCalculadasDelPedido({ porDiasSueltos, fechas: Array.isArray(ms.fechasTrabajadas) ? ms.fechasTrabajadas : [], rotativos: diasRotativos, desde: periodo.desde, hasta: periodo.hasta, dias: diasSemana, jornadasDelTipo: contratoSel?.data?.cantidadJornadas });
  const ajustado = !!ms.workdaysOverridden;
  const jornadasPedidas = Number(ms.workdaysCount) || Number(anterior?.cantidad_jornadas_laborales) || 5;
  const jornadas = !ajustado && calculadas !== null ? calculadas : jornadasPedidas;

  // ── Qué falta: `faltantesPaso1` del formulario ──
  // Sin convenio ni categoría según el trámite: hoy ninguno (ver `tramiteSinConvenioNiCategoria`).
  const esServicios = !!contratoId && tramiteSinConvenioNiCategoria(tipoImpositivoDeContrato(contratoId, cat.contratoFrames, cat.estados));
  const faltan: string[] = [];
  if (!rolFrameId) faltan.push("rol empresa");
  if (!esServicios && !categoriaSatId) faltan.push("categoría");
  if (!contratoId) faltan.push("tipo de contrato");
  if (plantillasPedidas.length > 1 && !cf) faltan.push("plantilla (el tipo de contrato tiene varias)");
  if (!estadoId) faltan.push("estado (la plantilla no tiene estado impositivo)");
  if (contratoSel && !indeterminado && !fechaBaja) faltan.push("fecha de baja");
  if (!areaShiftAssignments.length) faltan.push("área y turno");
  const limiteHoras = contratoSel?.data?.horasPorJornada ?? null;
  const duracion = horasDelHorario(horaInicio, horaFin);
  if (limiteHoras != null && duracion != null && duracion > limiteHoras) faltan.push(`horario dentro de las ${limiteHoras} h del contrato`);
  const errJ = erroresDeJornadas({
    desde: periodo.desde,
    hasta: periodo.hasta,
    diasPorSemana: String(diasPorSemana || ""),
    dias: diasSemana,
    rotativos: diasRotativos,
    jornadas: String(jornadas || ""),
    calculadas,
    ajustado,
    motivo: String(ms.workdaysOverrideReason || ""),
    nota: String(ms.workdaysOverrideNote || ""),
  });
  if (errJ.jornadas) faltan.push("cantidad de jornadas");
  if (errJ.motivo || errJ.nota) faltan.push("motivo del ajuste de jornadas");
  const faltaDias = faltaDefinirDias(diasPorSemana, diasRotativos, diasSemana);
  if (faltaDias) faltan.push(`días que trabaja (${faltaDias})`);
  if (faltan.length) return { ok: false, faltan };

  // ── Sueldos: el efecto «Auto-Calculations» del formulario ──
  const sueldoJornada = Number(ms.dailyRate) || Number(anterior?.sueldo_jornada) || 0;
  const sueldoMano = sueldoJornada * jornadas;
  const catDelContrato = cat.categoriasSat.find((c) => String(c.data?.id) === categoriaSatId);
  const sueldoNeto = catDelContrato ? Number(Number(catDelContrato.data?.neto ?? 0).toFixed(2)) : 0;
  const sueldoBruto = catDelContrato ? Number(Number(catDelContrato.data?.sueldoBruto ?? 0).toFixed(2)) : 0;
  const sueldoDiarioNeto = catDelContrato ? Number((sueldoNeto / 30).toFixed(2)) : 0;

  const primera = areaShiftAssignments[0];
  const reemplazo = ms.isReplacement !== undefined ? !!ms.isReplacement : !!anterior?.reemplazo;
  const reemplazado = ms.empleado_id_reemplezado ? String(ms.empleado_id_reemplezado) : anterior?.empleado_id_reemplezado || "";
  const rfSel = cat.roleFrames.find((rf) => String(rf.data?.rol?.id) === rolFrameId);

  const contract: Record<string, any> = {
    rol_frame_id: Number(rolFrameId),
    nombre_rol_frame: rfSel?.name || "",
    categoria_sat_id: Number(categoriaSatId),
    contrato_id: contratoId,
    contrato_frame_id: cf?._id || "",
    nombre_contrato: cf?.name || anterior?.nombre_contrato || "",
    tipo_contrato_id: cf?.data?.id != null ? Number(cf.data.id) : null,
    estado_id: Number(estadoId),
    empresaContratoId: ms.empresaContratoId ? String(ms.empresaContratoId) : anterior?.empresaContratoId ? String(anterior.empresaContratoId) : null,
    empresaReleaseId: anterior?.empresaReleaseId ? String(anterior.empresaReleaseId) : null,
    hora_inicio: horaInicio,
    hora_fin: horaFin,
    fecha_alta_contrato: fechaAlta,
    fecha_baja_contrato: fechaBaja,
    cantidad_jornadas_laborales: jornadas,
    dias_por_semana: diasPorSemana,
    dias_semana: diasSemana,
    dias_rotativos: diasRotativos,
    sueldo_jornada: sueldoJornada,
    sueldo_mano: sueldoMano,
    sueldo_mano_texto: numeroALetras(sueldoMano),
    sueldo_neto: sueldoNeto,
    sueldo_bruto: sueldoBruto,
    sueldo_diario_neto: sueldoDiarioNeto,
    // Se aprueba tal como se pidió: la diferencia mide cuánto se cambió el importe pedido, y acá no se cambió.
    diferencia_diaria_neto: 0,
    sede_id: Number(sedeId),
    reemplazo,
    empleado_id_reemplezado: reemplazado ? Number(reemplazado) : null,
    observaciones: anterior?.observaciones || "",
    areaShiftAssignments,
    areaId: primera?.areaId || "",
    shiftId: primera?.shiftIds?.[0] || "",
    externalEmployeeId: (persona.metadata as any)?.id,
    externalProjectId: proyecto.metadata?.id || proyecto.externalId,
  };

  // El rol pedido se suma a la ficha si la persona no lo tiene (lo mismo que `rolFrameAgregado`).
  const rolesDeLaFicha: string[] = ((persona.metadata as any)?.roles_frame || []).map(idDe);
  const rolParaLaFicha = rolPedido && !rolesDeLaFicha.includes(String(rolPedido._id)) ? rolPedido : null;

  return { ok: true, armado: { contract, rolParaLaFicha } };
}
