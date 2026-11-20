/**
 * ARCA EN MODO AUDITORÍA (etapa 5, 20/11/2026): LO QUE NO ENCAJA, SÓLO PARA MOSTRAR.
 *
 * Nada de acá escribe ni deduce: lista, con las dos fechas, lo que una persona tiene que mirar. Las
 * secciones que salen del clasificador de bajas (`bajasArcaContrato.ts`: falta la baja en ARCA, revisión
 * manual, granularidad de más de 15 días) las arma el servicio; acá va la regla nueva:
 *
 * RELACIÓN DE ARCA SIN CONTRATO EXACTO. Una relación de ARCA (persona + empleadora) cuyo inicio no es el
 * alta EXACTA de ningún contrato, pero que se SOLAPA con algún contrato de esa persona y empleadora: es
 * la misma relación laboral registrada con otra fecha. Valentina Pellegrini: contrato desde el 07/02/2025,
 * ARCA desde el 10/02/2025. No se alinea sola (decisión del usuario, 18/11): se muestra con las dos fechas
 * y lo decide quien lleve laboral.
 *  - Es UNA fila por relación, con los contratos solapados al lado. Cuando ARCA declara un tramo de
 *    varios días y WeProdu tiene una jornada por día (Montoya: tramo 17–20/07, jornadas 18, 19 y 20),
 *    es una sola fila y no tres: el dato es que el 17 está en ARCA y no en WeProdu.
 *  - Un tramo CONTIGUO a una relación explicada (empieza el día siguiente a su fin) está explicado por
 *    la misma cadena, igual que en el clasificador de bajas (Palomino: 15/12/2021–28/02/2022 y
 *    01/03/2022–31/10/2026 son UN contrato).
 *  - Una relación que no se solapa con ningún contrato no se lista: no se sabe de qué relación local
 *    sería la «otra fecha» (y las viejas, anteriores a los datos de WeProdu, serían miles).
 *  - Lo que WeProdu tiene y ARCA no (una jornada sin relación ese día) lo cubre la verificación de altas.
 * Puro.
 */
import type { RelacionArca } from "./bajasArcaContrato.js";

export interface ContratoParaAuditar {
  contratoKey: string;
  /** «AAAA-MM-DD» o vacío. */
  alta: string;
  /** «AAAA-MM-DD» o vacío (abierto). */
  baja: string;
  cuil: string;
  cuit: string;
  estadoContrato?: unknown;
}

export interface ContratoSolapado {
  contratoKey: string;
  alta: string;
  baja: string;
  /** Días de ARCA respecto del alta del contrato: positivo = ARCA empieza después. */
  dias: number;
}

export interface RelacionSinContratoExacto {
  cuil: string;
  cuit: string;
  inicio: string;
  fin: string;
  situacionBaja: string;
  /** Los contratos de la misma persona y empleadora que se solapan con la relación, del más cercano al más lejano. */
  contratos: ContratoSolapado[];
}

const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const diaSiguiente = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const SIN_FIN = "9999-12-31";
const idDe = (r: RelacionArca) => `${r.cuil}|${r.empleadoraCuit}|${r.inicio}`;

export function relacionesSinContratoExacto(contratos: ContratoParaAuditar[], relaciones: RelacionArca[], hoy: string): RelacionSinContratoExacto[] {
  const vivos = contratos.filter((c) => c.estadoContrato !== "ANULADO" && ES_FECHA.test(c.alta) && c.cuil.length === 11 && c.cuit.length === 11);
  const altasExactas = new Set(vivos.map((c) => `${c.cuil}|${c.cuit}|${c.alta}`));
  const porPersona = new Map<string, ContratoParaAuditar[]>();
  for (const c of vivos) {
    const k = `${c.cuil}|${c.cuit}`;
    (porPersona.get(k) || porPersona.set(k, []).get(k)!).push(c);
  }
  // Explicadas: las de alta exacta y, desde cada una, su cadena de tramos contiguos.
  const relsPorPersona = new Map<string, RelacionArca[]>();
  for (const r of relaciones) {
    const k = `${r.cuil}|${r.empleadoraCuit}`;
    (relsPorPersona.get(k) || relsPorPersona.set(k, []).get(k)!).push(r);
  }
  const explicadas = new Set(relaciones.map(idDe).filter((id) => altasExactas.has(id)));
  for (const r of relaciones) {
    if (!altasExactas.has(idDe(r))) continue;
    const mismas = relsPorPersona.get(`${r.cuil}|${r.empleadoraCuit}`) || [];
    for (let u = r; u.fin; ) {
      const n = mismas.find((x) => x.inicio === diaSiguiente(u.fin));
      if (!n || explicadas.has(idDe(n))) break;
      explicadas.add(idDe(n));
      u = n;
    }
  }
  const out: RelacionSinContratoExacto[] = [];
  const vistas = new Set<string>();
  for (const r of relaciones) {
    if (!ES_FECHA.test(r.inicio) || r.inicio > hoy) continue;
    const id = idDe(r);
    if (vistas.has(id) || explicadas.has(id)) continue;
    const fin = r.fin || SIN_FIN;
    const solapados = (porPersona.get(`${r.cuil}|${r.empleadoraCuit}`) || [])
      .filter((c) => c.alta <= fin && (c.baja || SIN_FIN) >= r.inicio)
      .map((c) => ({ contratoKey: c.contratoKey, alta: c.alta, baja: c.baja, dias: diasEntre(c.alta, r.inicio) }))
      .sort((a, b) => Math.abs(a.dias) - Math.abs(b.dias) || a.alta.localeCompare(b.alta));
    if (!solapados.length) continue;
    vistas.add(id);
    out.push({ cuil: r.cuil, cuit: r.empleadoraCuit, inicio: r.inicio, fin: r.fin || "", situacionBaja: String(r.situacionBaja || "").trim(), contratos: solapados });
  }
  return out;
}
