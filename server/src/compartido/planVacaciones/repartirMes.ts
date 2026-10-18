import { diasDelMes, rangoDelMesEnVentana, sumarDias } from "./fechas.js";

/**
 * REPARTIR UN MES ENTRE LAS PERSONAS DE UN ROL (pedido del 17/10/2026): el mes se corta en tantos
 * tramos consecutivos como personas haya, de largo parejo (si sobra, los últimos tramos llevan un día
 * más), y cada persona se lleva su tramo desde el primer día, acotado a lo que tiene disponible y al
 * tope del plan. Dos editores en un mes de 31: 1–15 y 16–30 (el 31 queda libre por el tope de 15);
 * tres en un mes de 31: 1–10, 11–20 y 21–31. Lo que una persona no llega a cubrir de su tramo queda
 * como hueco, a la vista: es lo que justifica el reemplazo mensual. El orden de entrada manda (la
 * pantalla lo deja elegir); las fechas se pueden ajustar a mano después.
 */

export interface PersonaARepartir {
  userId: string;
  /** Días que le quedan por tomar en el período del plan (ya descontados otros bloques del plan). */
  disponibles: number;
}

export type RecorteDeBloque = "ninguno" | "tope" | "saldo" | "ventana";

export interface Bloque {
  userId: string;
  desde: string;
  hasta: string;
  dias: number;
  /** El tramo que le tocaba del mes, sin recortar. */
  segmentoDesde: string;
  segmentoHasta: string;
  /** Por qué el bloque es más corto que su tramo (o `ninguno`). */
  recortadoPor: RecorteDeBloque;
}

export interface OpcionesDeReparto {
  tope: number;
  ventanaDesde: string;
  ventanaHasta: string;
}

export function repartirMes(personas: PersonaARepartir[], mes: string, o: OpcionesDeReparto): Bloque[] {
  const rango = rangoDelMesEnVentana(mes, o.ventanaDesde, o.ventanaHasta);
  if (!rango || personas.length === 0) return [];
  const n = personas.length;
  const base = Math.floor(rango.dias / n);
  const resto = rango.dias % n;
  const mesRecortado = rango.dias < diasDelMes(mes);
  const out: Bloque[] = [];
  let cursor = rango.desde;
  personas.forEach((p, i) => {
    // Los últimos `resto` tramos llevan un día más: así el mes queda cubierto entero y parejo.
    const largoTramo = base + (i >= n - resto ? 1 : 0);
    const segmentoDesde = cursor;
    const segmentoHasta = sumarDias(cursor, largoTramo - 1);
    cursor = sumarDias(segmentoHasta, 1);
    const disponibles = Math.max(0, Math.floor(p.disponibles || 0));
    const tope = Math.max(0, Math.floor(o.tope || 0));
    const dias = Math.min(largoTramo, disponibles, tope);
    let recortadoPor: RecorteDeBloque = "ninguno";
    if (dias < largoTramo) recortadoPor = disponibles <= tope ? "saldo" : "tope";
    else if (mesRecortado) recortadoPor = "ventana";
    out.push({ userId: p.userId, desde: segmentoDesde, hasta: dias > 0 ? sumarDias(segmentoDesde, dias - 1) : segmentoDesde, dias, segmentoDesde, segmentoHasta, recortadoPor });
  });
  return out;
}
