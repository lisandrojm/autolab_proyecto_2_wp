import { OvertimeSettings, splitOvertime } from "./overtimeUtils";

/** Números como se leen acá: «1,5», no «1.5». */
const num = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 2 });

/**
 * LA PESTAÑA «GLOSARIO» DE LOS EXCEL DE NOVEDADES (25/10/2026).
 *
 * Quien abre el archivo —liquidación, el cliente— no ve la pantalla de configuración, y sin esto no
 * hay forma de saber por qué un día tiene media hora al 100% y media al 50%. Se escribe CON LOS VALORES
 * con los que se calculó ESE archivo (el glosario vigente al exportar), no con un texto fijo: si alguien
 * cambia un rango, el Excel viejo sigue explicando sus propios números.
 *
 * Dice lo que hace el cálculo (`splitOvertime`), ni más ni menos.
 */
/** `feriados`: los del período del archivo (Configuración › Feriados), para listarlos. */
export function filasGlosarioExtras(g: OvertimeSettings, feriados: { fecha: string; nombre: string }[] = []): (string | number)[][] {
  const pct50 = `${g.pct50}%`;
  const pct100 = `${g.pct100}%`;
  // El ejemplo sale del MISMO cálculo que el reporte: si alguien cambia los rangos, no queda desfasado.
  const ej = splitOvertime("2026-10-09", "05:30", "12:30", 1, g, "06:00", "12:00");
  return [
    ["GLOSARIO DE HORAS EXTRAS"],
    ["Cómo se calcularon las horas extra de este archivo."],
    [],
    ["RANGOS DEL RECARGO"],
    ["Día", "Desde", "Hasta", "Recargo"],
    ["Lunes a viernes", g.weekdayDayStart, g.weekdayDayEnd, pct50],
    ["Sábados", g.satDayStart, g.satDayEnd, pct50],
    ["Lunes a sábado, fuera de esos rangos", "", "", pct100],
    ["Domingos (todo el día)", "", "", pct100],
    ["Feriados (todo el día, los de Configuración › Feriados)", "", "", pct100],
    [],
    ["FERIADOS DEL PERÍODO (todas las extras de ese día al 100%)"],
    ...(feriados.length > 0
      ? [["Fecha", "Feriado"], ...feriados.map((f) => [f.fecha.split("-").reverse().join("/"), f.nombre])]
      : [["No hay feriados cargados en este período. Se cargan en Configuración › Feriados."]]),
    [],
    ["CÓMO SE REPARTE CADA DÍA"],
    ["1. Sólo son extra las horas trabajadas FUERA del horario del turno de ese día (antes de la entrada o después de la salida)."],
    ["2. El horario del turno es el que quedó cargado en la novedad de ese día; si no hay, el del contrato."],
    [`3. Cada tramo extra se reparte según el rango: lo que cae dentro del rango del día va al ${pct50}, lo que cae fuera va al ${pct100}.`],
    ["4. Por eso un mismo día puede tener horas al 50% y al 100% a la vez."],
    [],
    ["EJEMPLO"],
    ["Turno de 06:00 a 12:00, un viernes. Trabajó de 05:30 a 12:30: 1 hora extra en total, media hora antes de entrar y media después de salir."],
    [`Con los rangos de arriba (lunes a viernes de ${g.weekdayDayStart} a ${g.weekdayDayEnd} al ${pct50}): ${num(ej.h100)} h al ${pct100} y ${num(ej.h50)} h al ${pct50}.`],
    [],
    ["VALOR DE LA HORA"],
    ["Concepto", "Fórmula"],
    ["Precio hora base", `Sueldo mano / ${g.salaryDivisorPercentage} (divisor)`],
    [`Precio hora al ${pct50}`, `Hora base × ${num(1 + g.pct50 / 100)}`],
    [`Precio hora al ${pct100}`, `Hora base × ${num(1 + g.pct100 / 100)}`],
    [],
    ["COLUMNAS"],
    ["H. Entrada OT / H. Salida OT", "Hora real de entrada y de salida de ese día."],
    ["Hs Extras Total", "Horas extra del día (las de fuera del turno)."],
    [`Hs 50% / Hs 100%`, "Cómo se reparte ese total según los rangos de arriba. Suman el total."],
  ];
}

/** Anchos de columna de la pestaña. */
export const ANCHOS_GLOSARIO = [{ wch: 48 }, { wch: 40 }, { wch: 10 }, { wch: 10 }];
