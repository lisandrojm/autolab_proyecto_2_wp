/**
 * LAS HOJAS DEL CONSOLIDADO DE NOVEDADES (20/11/2026), listas para que el server las escriba.
 *
 * El server (`GET /activity-reports/consolidado`) manda las cinco hojas ya clasificadas pero con las horas
 * extra CRUDAS. Acá se reparten entre 50% y 100% con `splitOvertime` y el glosario de ESTE navegador —el
 * mismo cálculo del reporte, sin tocarlo—, se suman por fila del resumen, se calculan valor hora e importes
 * y se describen las hojas como tablas (`HojaXlsx`) para `POST /activity-reports/consolidado/xlsx`.
 *
 * Pendiente anotado (20/11): que el glosario viva en el server como dato y el reparto se haga allá. Hoy el
 * resultado depende del navegador que exporta.
 *
 * Nada de «-»: una celda que no aplica va vacía (null). Cero es 0.
 */
import type { ConsolidadoNovedades, FilaDetalleConsolidado, FilaResumenConsolidado, HojaXlsx } from "../api/request";
import { ANCHOS_GLOSARIO, filasGlosarioExtras } from "./hojaGlosarioExtras";
import { OvertimeSettings, splitOvertime } from "./overtimeUtils";

export interface InfoDelExport {
  exportadoPor: string;
  /** «dd/MM/yyyy HH:mm». */
  exportadoEl: string;
}

const r2 = (n: number) => Number(n.toFixed(2));
const ddmmaaaa = (f: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f || "");
const OTRO_MOTIVO = "Otro motivo";

/**
 * El reparto de las extras de un día, igual que en el reporte: feriado → todo al 100% (aunque el parte
 * traiga un reparto guardado); reparto guardado → se respeta; si no, `splitOvertime` contra el horario del
 * turno de ese día (el del parte, o el del contrato).
 */
export function repartoDeExtras(d: FilaDetalleConsolidado, g: OvertimeSettings): { h50: number; h100: number } | null {
  const x = d.extras;
  if (!x || x.total <= 0) return null;
  if (x.feriado) return { h50: 0, h100: x.total };
  if (x.h50 > 0 || x.h100 > 0) return { h50: x.h50, h100: x.h100 };
  const res = splitOvertime(d.fecha, d.entradaReal || "", d.salidaReal || "", x.total, g, x.horarioEntrada || undefined, x.horarioSalida || undefined);
  return { h50: res.h50, h100: res.h100 };
}

interface HorasDeLaFila { h50: number; h100: number; total: number }

export function hojasDelConsolidado(c: ConsolidadoNovedades, g: OvertimeSettings, info: InfoDelExport): HojaXlsx[] {
  const divisor = g.salaryDivisorPercentage || 150;
  const horasPorClave = new Map<string, HorasDeLaFila>();
  const detalleConReparto = c.detalle.map((d) => {
    const rep = repartoDeExtras(d, g);
    if (rep) {
      const h = horasPorClave.get(d.claveResumen) || horasPorClave.set(d.claveResumen, { h50: 0, h100: 0, total: 0 }).get(d.claveResumen)!;
      h.h50 += rep.h50;
      h.h100 += rep.h100;
      h.total += d.extras!.total;
    }
    return { d, rep };
  });

  const motivos = [...c.motivos, OTRO_MOTIVO];
  const filaResumen = (f: FilaResumenConsolidado): (string | number | null)[] => {
    const h = horasPorClave.get(f.clave) || { h50: 0, h100: 0, total: 0 };
    const valorHora = !f.valorHoraNoAplica && f.sueldoMano !== null && f.sueldoMano > 0 ? r2(f.sueldoMano / divisor) : null;
    const imp50 = valorHora === null ? null : r2(h.h50 * valorHora * (1 + g.pct50 / 100));
    const imp100 = valorHora === null ? null : r2(h.h100 * valorHora * (1 + g.pct100 / 100));
    return [
      f.legajo || null, f.colaborador, f.cuil || null, f.empresa || null, f.tipo, f.categoria || null, f.centroCosto || null, f.proyecto, f.area || null, f.turno || null,
      f.desde || null, f.hasta || null, f.contratos, f.jornadasTrabajadas, f.jornadasPrevistas,
      r2(h.h50), r2(h.h100), r2(h.total),
      f.ausencias, ...motivos.map((m) => f.porMotivo[m] ?? 0), f.diasSinParte,
      f.valorJornada, valorHora, imp50, imp100, imp50 === null || imp100 === null ? null : r2(imp50 + imp100),
    ];
  };

  const resumen: HojaXlsx = {
    nombre: "Resumen por persona",
    tabla: true,
    vacioDice: "No hay personas con contrato ni partes en este período.",
    columnas: [
      { titulo: "Legajo", ancho: 9 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Empresa del contrato", ancho: 22 }, { titulo: "Tipo de contrato", ancho: 20 }, { titulo: "Categoría", ancho: 26 }, { titulo: "Centro de costo", ancho: 14 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 14 },
      { titulo: "Desde", tipo: "fecha", ancho: 11 }, { titulo: "Hasta", tipo: "fecha", ancho: 11 }, { titulo: "Contratos", tipo: "entero", ancho: 10 }, { titulo: "Jornadas trabajadas", tipo: "entero", ancho: 11 }, { titulo: "Jornadas previstas", tipo: "entero", ancho: 11 },
      { titulo: "Hs extras 50%", tipo: "numero", ancho: 10 }, { titulo: "Hs extras 100%", tipo: "numero", ancho: 10 }, { titulo: "Hs extras total", tipo: "numero", ancho: 10 },
      { titulo: "Ausencias", tipo: "entero", ancho: 10 }, ...motivos.map((m) => ({ titulo: m, tipo: "entero" as const, ancho: Math.max(9, Math.min(18, m.length + 2)) })), { titulo: "Días sin parte", tipo: "entero", ancho: 10 },
      { titulo: "Valor jornada", tipo: "numero", ancho: 13 }, { titulo: "Valor hora", tipo: "numero", ancho: 12 }, { titulo: "Importe extras 50%", tipo: "numero", ancho: 14 }, { titulo: "Importe extras 100%", tipo: "numero", ancho: 14 }, { titulo: "Importe extras total", tipo: "numero", ancho: 14 },
    ],
    filas: c.resumen.map(filaResumen),
  };

  const detalle: HojaXlsx = {
    nombre: "Detalle diario",
    tabla: true,
    vacioDice: "No hay días con algo que decir en este período.",
    columnas: [
      { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Día", ancho: 6 }, { titulo: "Feriado", ancho: 22 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 },
      { titulo: "Estado", ancho: 18 }, { titulo: "Motivo", ancho: 28 },
      { titulo: "Entrada prevista", tipo: "hora", ancho: 10 }, { titulo: "Salida prevista", tipo: "hora", ancho: 10 }, { titulo: "Entrada real", tipo: "hora", ancho: 10 }, { titulo: "Salida real", tipo: "hora", ancho: 10 },
      { titulo: "Hs 50%", tipo: "numero", ancho: 8 }, { titulo: "Hs 100%", tipo: "numero", ancho: 8 }, { titulo: "Hs extras total", tipo: "numero", ancho: 10 },
      { titulo: "Reemplaza a / Reemplazado por", ancho: 36 }, { titulo: "Parte", ancho: 16 },
    ],
    filas: detalleConReparto.map(({ d, rep }) => [
      d.fecha, d.dia, d.feriado ? `Sí: ${d.feriado}` : "No", d.colaborador, d.cuil || null, d.proyecto, d.area || null, d.turno || null,
      d.estado, d.motivo || null,
      d.entradaPrevista || null, d.salidaPrevista || null, d.entradaReal || null, d.salidaReal || null,
      rep ? r2(rep.h50) : d.extras ? 0 : null, rep ? r2(rep.h100) : d.extras ? 0 : null, d.extras ? r2(d.extras.total) : null,
      d.reemplazo || null, d.parte || null,
    ]),
  };

  const partes: HojaXlsx = {
    nombre: "Partes",
    tabla: true,
    vacioDice: "No hay partes cargados en este período.",
    columnas: [{ titulo: "Parte", ancho: 16 }, { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 }, { titulo: "Responsable", ancho: 26 }, { titulo: "Presentes", tipo: "entero", ancho: 10 }, { titulo: "Ausentes", tipo: "entero", ancho: 10 }, { titulo: "Comentario", ancho: 80 }],
    filas: c.partes.map((p) => [p.parte, p.fecha, p.proyecto, p.area || null, p.turno || null, p.responsable || null, p.presentes, p.ausentes, p.comentario || null]),
  };

  const revisar: HojaXlsx = {
    nombre: "A revisar",
    tabla: true,
    vacioDice: "No hay nada para revisar en este período.",
    columnas: [{ titulo: "Tipo", ancho: 30 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Fecha", ancho: 24 }, { titulo: "Detalle", ancho: 100 }],
    filas: c.revisar.map((x) => [x.tipo, x.colaborador, x.cuil || null, x.fecha, x.detalle]),
  };

  const proyectos = c.proyectos.map((p) => (p.cliente ? `${p.cliente} | ${p.nombre}` : p.nombre)).join(", ");
  const informacion: HojaXlsx = {
    nombre: "Información",
    columnas: [{ titulo: "", ancho: 34 }, { titulo: "", ancho: 70 }, { titulo: "", ancho: 12 }],
    filas: [
      ["CONSOLIDADO DE NOVEDADES"],
      ["Período", `${ddmmaaaa(c.desde)} al ${ddmmaaaa(c.hasta)}`],
      ["Proyecto(s)", proyectos],
      ["Filtro aplicado", `Proyecto(s) y período. Los demás filtros de la pantalla de Novedades no aplican a este archivo.`],
      ["Exportado por", info.exportadoPor || c.exportadoPor || ""],
      ["Exportado el", info.exportadoEl],
      [],
      ["GLOSARIO USADO PARA LAS HORAS EXTRA"],
      ["Lunes a viernes", `${g.weekdayDayStart} a ${g.weekdayDayEnd}`, `${g.pct50}%`],
      ["Sábados", `${g.satDayStart} a ${g.satDayEnd}`, `${g.pct50}%`],
      ["Fuera de esos rangos, domingos y feriados", "", `${g.pct100}%`],
      ["Divisor del valor hora", `Sueldo mano / ${divisor}`],
      [],
      ["FILAS POR HOJA"],
      ["Resumen por persona", resumen.filas.length],
      ["Detalle diario", detalle.filas.length],
      ["Partes", partes.filas.length],
      ["A revisar", revisar.filas.length],
      [],
      ["Las hojas de datos tienen los encabezados en la fila 1, autofiltro y la primera fila congelada. Una celda vacía es «no aplica»; cero es 0."],
    ],
  };

  const glosario: HojaXlsx = {
    nombre: "Glosario",
    columnas: ANCHOS_GLOSARIO.map((a) => ({ titulo: "", ancho: a.wch })),
    filas: [
      ...filasGlosarioExtras(g, c.feriados),
      [],
      ["CUÁNDO UNA HORA SE PARTE ENTRE 50% Y 100% DENTRO DEL MISMO TURNO"],
      [`Lo extra es lo trabajado FUERA del horario del turno de ese día. Cada tramo extra se compara con el rango del día: la parte que cae dentro del rango va al ${g.pct50}% y la que cae fuera va al ${g.pct100}%.`],
      [`Por eso un turno de 06:00 a 12:00 trabajado de 05:30 a 12:30 un día de semana da media hora al ${g.pct100}% (antes de las ${g.weekdayDayStart}) y media al ${g.pct50}% (después de las 12:00): una hora, partida.`],
      [`Si llegó antes y se fue antes, el tiempo que se fue antes se descuenta primero del tramo al ${g.pct100}%: las extras van primero al ${g.pct50}%.`],
      [],
      ["TURNOS QUE CRUZAN MEDIANOCHE"],
      ["Un turno que cruza la medianoche (18:00 a 00:00, 00:00 a 06:00) se imputa entero al día de la entrada, que es la fecha del parte. En esos turnos una salida anterior a la entrada no es un error y no va a «A revisar»."],
      [],
      ["COLUMNAS DE ESTE ARCHIVO"],
      ["Entrada prevista / Salida prevista", "El horario del turno de la persona ese día, según el parte."],
      ["Entrada real / Salida real", "Las horas reales. El parte sólo las carga cuando hay horas extra."],
      ["Estado", "Presente · Tardanza · Ausente (con motivo) · Falta parte (día asignado en el contrato sin parte) · Sin contrato vigente (figura en un parte sin contrato que cubra ese día)."],
      ["Jornadas previstas", "Días asignados del contrato dentro del período. Vacío cuando el contrato es de días rotativos o no tiene días cargados (ver «Días no evaluables» en A revisar)."],
      ["Valor hora", `Sueldo mano / ${divisor}. Vacío en jornadas: su sueldo mano es el valor de la jornada, no un mensual.`],
      ["Importes de extras", `Hs 50% × valor hora × ${1 + g.pct50 / 100} + Hs 100% × valor hora × ${1 + g.pct100 / 100}.`],
    ],
  };

  return [informacion, resumen, detalle, partes, revisar, glosario];
}

/** El nombre del archivo: consolidado_novedades_<proyectos>_<desde>_a_<hasta>.xlsx */
export const nombreDelConsolidado = (c: ConsolidadoNovedades) => `consolidado_novedades_${c.proyectos.map((p) => p.nombre.replace(/[^\w+]+/g, "-")).join("_").slice(0, 60) || "proyecto"}_${c.desde}_a_${c.hasta}.xlsx`;
