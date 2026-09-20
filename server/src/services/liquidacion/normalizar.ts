import type { Regimen } from "../../utils/liquidacion/contratos.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ETAPA 1 — DE RENGLÓN DE PARTE A EVENTO PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Un parte de novedades trae una fila por empleado con todo mezclado: quién faltó, quién lo cubrió,
 * las horas extra de los dos. Para liquidar hace falta lo contrario: hechos sueltos, cada uno a
 * nombre de UNA persona, con su legajo, su empresa y su régimen al lado.
 *
 * UN REEMPLAZO GENERA DOS EVENTOS. La ausencia del titular y la presencia del reemplazante son dos
 * cosas que se liquidan por separado, a dos personas distintas, muchas veces en dos empresas
 * distintas. Meterlas en un solo evento obliga a arrastrar "y además" por todo el motor.
 *
 * ES PURA: no toca Mongo. Lo que necesita saber de cada persona se lo pasan resuelto.
 */

export type AplicaA = "titular" | "reemplazante";

/** Lo que el padrón sabe de una persona en un proyecto. Ver `services/liquidacion/padron.ts`. */
export interface DatosDePersona {
  apellidoYNombre: string;
  legajo: string | null;
  empresaId: string | null;
  ccCodigo: string | null;
  regimen: Regimen | null;
}

export interface Evento {
  /** Identifica al evento de punta a punta. Es lo que después permite decir de dónde salió una línea. */
  id: string;
  activityReportId: string;
  attendanceItemId: string;
  aplicaA: AplicaA;

  userId: string;
  apellidoYNombre: string;
  legajo: string | null;
  empresaId: string | null;
  ccCodigo: string | null;
  regimen: Regimen | null;

  fecha: string;
  proyectoId: string | null;
  proyecto: string | null;
  areaId: string | null;
  turnoId: string | null;

  estado: string;
  motivoId: string | null;
  motivoNombre: string | null;

  /** Días que abarca el evento. Un parte es de un día, así que siempre 1. */
  jornadas: number;
  he50: number;
  he100: number;
  /**
   * HORAS EXTRA QUE NADIE DISCRIMINÓ.
   *
   * La app guarda el total en `overtimeHours` y el desglose en `overtimeHours50/100`, pero el
   * desglose casi no se usa: medido sobre toda la historia, 472,75 horas están sin discriminar
   * contra 9 que sí lo están.
   *
   * Van acá y NO repartidas: liquidarlas todas al 50% sería inventar un dato que cambia lo que
   * cobra la gente. El motor las convierte en una excepción para que alguien las clasifique.
   */
  heSinDiscriminar: number;

  horarioDesde: string | null;
  horarioHasta: string | null;
  /** A quién cubre este evento, cuando es el del reemplazante. Para la planilla de control. */
  reemplazaA: string | null;
  notas: string | null;
}

/** El parte, con lo mínimo que hace falta. Los ids ya resueltos a string. */
export interface ParteParaNormalizar {
  _id: string;
  date: string;
  projectId?: string | null;
  proyectoNombre?: string | null;
  areaId?: string | null;
  shiftId?: string | null;
  attendance: RenglonDeParte[];
}

export interface RenglonDeParte {
  _id: string;
  employeeId: string;
  typeId?: string | null;
  status: string;
  absenceReason?: string | null;
  replacementId?: string | null;
  overtimeHours?: number;
  overtimeHours50?: number;
  overtimeHours100?: number;
  replacementOvertimeHours?: number;
  replacementOvertimeHours50?: number;
  replacementOvertimeHours100?: number;
  scheduleInTime?: string | null;
  scheduleOutTime?: string | null;
  notes?: string | null;
}

const n = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/**
 * Lo que sobra del total una vez descontado lo que sí está discriminado.
 *
 * Se resta en vez de usar el total tal cual porque los tres campos conviven: hay renglones con 6
 * horas al 100% y el mismo 6 en el total. Sumarlos daría el doble.
 */
const sinDiscriminar = (total: unknown, h50: unknown, h100: unknown) => Math.max(0, n(total) - n(h50) - n(h100));

/**
 * Convierte un parte entero en eventos.
 *
 * `datosDe` resuelve legajo, empresa, CC y régimen de una persona en ese proyecto. Devuelve
 * `undefined` cuando esa persona no tiene contrato vigente, y en ese caso el evento SE GENERA IGUAL
 * con los datos en null: lo que no se puede liquidar tiene que verse en el anexo, no desaparecer.
 */
export function normalizarParte(
  parte: ParteParaNormalizar,
  datosDe: (userId: string, projectId: string | null) => DatosDePersona | undefined,
): Evento[] {
  const eventos: Evento[] = [];
  const vacio: DatosDePersona = { apellidoYNombre: "", legajo: null, empresaId: null, ccCodigo: null, regimen: null };

  const comun = {
    activityReportId: String(parte._id),
    fecha: String(parte.date).slice(0, 10),
    proyectoId: parte.projectId ? String(parte.projectId) : null,
    proyecto: parte.proyectoNombre || null,
    areaId: parte.areaId ? String(parte.areaId) : null,
    turnoId: parte.shiftId ? String(parte.shiftId) : null,
  };

  for (const r of parte.attendance || []) {
    const titular = datosDe(String(r.employeeId), comun.proyectoId) || vacio;

    eventos.push({
      ...comun,
      id: `${parte._id}:${r._id}:titular`,
      attendanceItemId: String(r._id),
      aplicaA: "titular",
      userId: String(r.employeeId),
      ...titular,
      estado: r.status,
      motivoId: r.typeId ? String(r.typeId) : null,
      motivoNombre: r.absenceReason || null,
      jornadas: 1,
      he50: n(r.overtimeHours50),
      he100: n(r.overtimeHours100),
      heSinDiscriminar: sinDiscriminar(r.overtimeHours, r.overtimeHours50, r.overtimeHours100),
      horarioDesde: r.scheduleInTime || null,
      horarioHasta: r.scheduleOutTime || null,
      reemplazaA: null,
      notas: r.notes || null,
    });

    if (!r.replacementId) continue;

    const suplente = datosDe(String(r.replacementId), comun.proyectoId) || vacio;

    eventos.push({
      ...comun,
      id: `${parte._id}:${r._id}:reemplazante`,
      attendanceItemId: String(r._id),
      aplicaA: "reemplazante",
      userId: String(r.replacementId),
      ...suplente,
      /*
        El reemplazante ESTUVO, sea cual sea el estado del titular. Copiar el "absent" del titular
        dejaría al que vino a trabajar figurando como ausente en su propia liquidación.
      */
      estado: "present",
      // El motivo se conserva: es POR QUÉ lo cubrió, y de eso depende qué concepto le corresponde.
      motivoId: r.typeId ? String(r.typeId) : null,
      motivoNombre: r.absenceReason || null,
      jornadas: 1,
      he50: n(r.replacementOvertimeHours50),
      he100: n(r.replacementOvertimeHours100),
      heSinDiscriminar: sinDiscriminar(r.replacementOvertimeHours, r.replacementOvertimeHours50, r.replacementOvertimeHours100),
      horarioDesde: r.scheduleInTime || null,
      horarioHasta: r.scheduleOutTime || null,
      reemplazaA: titular.apellidoYNombre || String(r.employeeId),
      notas: r.notes || null,
    });
  }

  return eventos;
}
