import { DIAS_SEMANA } from "../components/contratos/DiasDeTrabajo";

/*
  CÓMO SE NOMBRA UN TURNO EN LA JERARQUÍA, compartido entre el panel web (Gestionar Equipo →
  Jerarquía) y el móvil (Mis equipos).

  Vivía adentro de `components/team/TeamJerarquiaTab.tsx`. Se sacó a un archivo propio para que el
  móvil diga «Mañana» y «Lun a Dom» exactamente igual que el panel sin importar ese componente,
  que trae `@dnd-kit` y todo el arrastre: el móvil sólo muestra, no arrastra.
*/

/**
 * Los días de un turno, en texto corto: "Lun a Dom", "Lu a Vi", "Lu, Mi, Vi".
 *
 * El nombre del turno ya suele traerlos ("Tarde 12 a 18 - Lun a Dom"), pero repetirlos en cada
 * columna era justamente el ruido: se dicen una vez por área y se recortan del nombre.
 */
export const textoDeDias = (dias: number[] | undefined): string => {
  const d = [...new Set(dias || [])].sort((a, b) => a - b);
  if (d.length === 0) return "";
  if (d.length === 7) return "Lun a Dom";
  const corto = (i: number) => DIAS_SEMANA.find((x) => x.indice === i)?.corto || "";
  // Los índices de JS arrancan el domingo, así que una semana laboral corrida (1..6) se detecta
  // sobre los días sin domingo; con domingo en el medio ya no es un rango y se enumera.
  const sinDomingo = d.filter((x) => x !== 0);
  const esRango = !d.includes(0) && sinDomingo.length > 1 && sinDomingo[sinDomingo.length - 1] - sinDomingo[0] === sinDomingo.length - 1;
  if (esRango) return corto(sinDomingo[0]) + " a " + corto(sinDomingo[sinDomingo.length - 1]);
  return d.map(corto).join(", ");
};

/**
 * La etiqueta de un turno: "Mañana", "Tarde", "Noche".
 *
 * El nombre guardado es "Mañana 6 a 12 - Lun a Dom": trae los días y el rango horario pegados. Los
 * días se dicen una vez por área, y el horario va debajo en su formato real ("06:00 a 12:00"), así
 * que dejarlo también en el título lo decía dos veces con distinta forma.
 *
 * El rango se saca sólo si de verdad lo parece —dos números con "a" o un guion en el medio— y nunca
 * si al recortarlo no queda nada: un turno llamado "6 a 12" a secas se sigue llamando así.
 */
export const etiquetaDeTurno = (nombre: string): string => {
  const sinDias = nombre.split(" - ")[0].trim() || nombre;
  const sinRango = sinDias.replace(/\s+\d{1,2}([:.]\d{2})?\s*(a|-|–)\s*\d{1,2}([:.]\d{2})?\s*(hs?)?\.?$/i, "").trim();
  return sinRango || sinDias;
};

/**
 * CÓMO SE ORDENAN LOS TURNOS: con el orden que se fijó en el admin (Turnos → Ordenar, `Shift.order`) y,
 * a igual orden, por horario.
 *
 * Antes se ordenaba sólo por la hora de inicio, así que «Trasnoche 00 a 06» salía primero aunque en el
 * admin estuviera último: la pantalla contradecía el orden que alguien eligió a propósito. Los turnos
 * que nunca se ordenaron tienen `order` 0 y quedan por horario, como antes. Devuelve una clave de texto
 * para usarla con `localeCompare`.
 */
export const claveOrdenTurno = (turno?: { order?: number | null; startTime?: string | null } | null): string => {
  const orden = Number.isFinite(Number(turno?.order)) && turno?.order != null ? Math.max(0, Math.round(Number(turno.order))) : 99999;
  return `${String(orden).padStart(6, "0")}|${turno?.startTime || "99:99"}`;
};
