import { rangoDelMesEnVentana, sumarDias } from "./fechas.js";

/**
 * CUÁNTO QUEDA DESCUBIERTO UN ROL EN UN MES: día por día, quiénes del grupo (área × turno × rol) están
 * de vacaciones según los bloques del plan. «Alguien afuera» justifica el reemplazo mensual; «nadie
 * presente» (todo el rol de vacaciones a la vez) se pinta en rojo. Sólo miran los bloques vivos (no
 * cancelados ni rechazados).
 */

export interface BloqueDeCobertura {
  userId: string;
  desde: string;
  hasta: string;
  estado: string;
}

export interface CoberturaDelMes {
  /** Días del mes dentro de la ventana. */
  dias: number;
  diasConAlguienAfuera: number;
  diasSinNadie: number;
  porDia: Array<{ dia: string; ausentes: string[]; presentes: number }>;
}

export function coberturaDelMes(bloques: BloqueDeCobertura[], personasDelGrupo: string[], mes: string, ventanaDesde: string, ventanaHasta: string): CoberturaDelMes {
  const rango = rangoDelMesEnVentana(mes, ventanaDesde, ventanaHasta);
  if (!rango) return { dias: 0, diasConAlguienAfuera: 0, diasSinNadie: 0, porDia: [] };
  const grupo = new Set(personasDelGrupo);
  const vivos = bloques.filter((b) => b.estado !== "cancelado" && b.estado !== "rechazado" && grupo.has(b.userId));
  const porDia: CoberturaDelMes["porDia"] = [];
  let dia = rango.desde;
  for (let i = 0; i < rango.dias; i++) {
    const ausentes = [...new Set(vivos.filter((b) => b.desde <= dia && dia <= b.hasta).map((b) => b.userId))];
    porDia.push({ dia, ausentes, presentes: Math.max(0, grupo.size - ausentes.length) });
    dia = sumarDias(dia, 1);
  }
  return {
    dias: rango.dias,
    diasConAlguienAfuera: porDia.filter((d) => d.ausentes.length > 0).length,
    diasSinNadie: porDia.filter((d) => grupo.size > 0 && d.presentes === 0).length,
    porDia,
  };
}
