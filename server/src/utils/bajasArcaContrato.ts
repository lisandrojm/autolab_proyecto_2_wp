/**
 * LAS BAJAS DE ARCA SOBRE EL CONTRATO, PERSISTIDAS (etapa 3, paso 2; decisión del usuario del 18/11).
 *
 * Hasta acá la baja de ARCA se aplicaba EN MEMORIA al validar (`bajaDeArcaQueAplica`): la validación veía
 * cerrado a Becerini, pero el contrato seguía sin baja y todo lo que lo lee directo (la fila del equipo,
 * la antigüedad, los recibos, las renovaciones) lo veía abierto. Esto decide qué se ESCRIBE en el contrato.
 *
 * Sólo con EVIDENCIA FUERTE: la relación de ARCA de la misma persona (CUIL), la misma empleadora (CUIT de
 * la empresa del contrato) y la misma fecha de inicio EXACTA que el alta del contrato. En el espejo esa
 * terna es única (índice), así que no hay dos candidatas. Sin CUIL, sin empleadora, sin CUIT o sin esa
 * relación, no se escribe nada: no se deduce.
 *
 * Con la relación encontrada («tramos» = las relaciones de la misma persona y empleadora; «contiguos» =
 * cada uno empieza el día siguiente al fin del anterior):
 *   baja_nueva            el contrato no tiene baja y ARCA la cerró                → SE ESCRIBE la de ARCA
 *   baja_por_tramos       el contrato no tiene baja y ARCA lo lleva en tramos contiguos con el último
 *                         cerrado (Palomino Mateo: 2 tramos, despido)  → SE ESCRIBE el fin del ÚLTIMO tramo.
 *                         Si el último sigue abierto, la relación sigue: no se escribe nada.
 *   baja_anterior         ARCA terminó ANTES que la baja del contrato, en un solo tramo, por un HECHO
 *                         (renuncia, despido, acuerdo…: Rodriguez, Mai, Sirito…)   → SE ESCRIBE la de ARCA
 *   arca_granularidad     ARCA terminó antes, pero por «vencimiento de plazo» y con todos los tramos
 *                         dentro del contrato (o contiguos hasta su baja): no es un hecho que cortó la
 *                         relación, es la granularidad con que ARCA declara (jornadas día por día; Sarli:
 *                         plazo fijo de junio con un día en ARCA). Manda el plazo del contrato  → no
 *   revision_manual       hay tramos que salen del rango del contrato (Rodini), o un hecho en medio de
 *                         varios tramos: WeProdu pudo fusionar relaciones (Jordan, Fernández). Lo mira
 *                         una persona                                             → no
 *   arca_posterior        ARCA terminó DESPUÉS que la baja del contrato (las jornadas: casi siempre un
 *                         día después)                                             → no
 *   arca_abierta          el contrato terminó y en ARCA sigue abierta: falta la baja EN ARCA          → no
 *   (nada)                coinciden, o los dos abiertos, o tramos contiguos que siguen abiertos
 * Reglas del usuario del 19/11 (tramos y motivo).
 * Puro.
 */
import { fechaISO as fechaTexto } from "./contratoVigencia.js";

/** `fechaISO` acepta texto; algunas fechas pueden estar guardadas como Date. */
const fechaISO = (v: unknown): string => (v instanceof Date ? (Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10)) : fechaTexto(v as any));

const diaSiguiente = (f: string) => {
  const d = new Date(`${f}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export interface RelacionArca {
  cuil: string;
  empleadoraCuit: string;
  inicio: string;
  fin: string;
  situacionBaja?: string;
}

/** Umbral de alerta de la granularidad (decisión del usuario, 19/11): 15 días. */
export const UMBRAL_GRANULARIDAD_DIAS = 15;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type TipoCambioBaja = "baja_nueva" | "baja_por_tramos" | "baja_anterior" | "arca_granularidad" | "revision_manual" | "arca_posterior" | "arca_abierta";

export interface CambioDeBaja {
  tipo: TipoCambioBaja;
  /** Se escribe sólo en baja_nueva, baja_por_tramos y baja_anterior. */
  aplicar: boolean;
  bajaContrato: string;
  finArca: string;
  situacionBaja: string;
  /** En `arca_granularidad`: cuántos días antes de la baja del contrato termina el ÚLTIMO tramo de ARCA.
   *  Más de `UMBRAL_GRANULARIDAD_DIAS` ya no parece granularidad (la persona pudo dejar antes): se lista
   *  aparte para que alguien mire, sin cambiar la decisión. */
  diasAntesDelFin?: number;
  /** Los tramos de ARCA que se miraron (misma persona y empleadora), para mostrar la evidencia. */
  tramos?: { inicio: string; fin: string; situacionBaja: string }[];
}

export function cambioDeBajaSegunArca(
  contrato: { fecha_alta_contrato?: unknown; fecha_baja_contrato?: unknown; estadoContrato?: unknown },
  cuil: string,
  cuit: string,
  relaciones: RelacionArca[],
  hoy: string,
): CambioDeBaja | null {
  if (contrato?.estadoContrato === "ANULADO") return null;
  const alta = fechaISO(contrato?.fecha_alta_contrato);
  if (!alta || cuil.length !== 11 || cuit.length !== 11) return null;
  const r = relaciones.find((x) => x.cuil === cuil && x.empleadoraCuit === cuit && x.inicio === alta);
  if (!r) return null;
  const baja = fechaISO(contrato?.fecha_baja_contrato);
  const mismas = relaciones.filter((x) => x.cuil === cuil && x.empleadoraCuit === cuit);
  const ver = (l: RelacionArca[]) => l.map((x) => ({ inicio: x.inicio, fin: x.fin || "", situacionBaja: String(x.situacionBaja || "").trim() })).sort((a, b) => a.inicio.localeCompare(b.inicio));
  // La cadena de tramos contiguos que arranca en el alta.
  const cadena = [r];
  for (let u = r; u.fin; ) {
    const n = mismas.find((x) => x.inicio === diaSiguiente(u.fin));
    if (!n || cadena.includes(n)) break;
    cadena.push(n);
    u = n;
  }
  const ultimo = cadena[cadena.length - 1];
  const base = { bajaContrato: baja, finArca: r.fin || "", situacionBaja: String(r.situacionBaja || "").trim() };
  if (r.fin && !baja) {
    if (cadena.length === 1) return { tipo: "baja_nueva", aplicar: true, ...base };
    if (!ultimo.fin) return null; // tramos contiguos y el último abierto: la relación sigue
    return { tipo: "baja_por_tramos", aplicar: true, bajaContrato: baja, finArca: ultimo.fin, situacionBaja: String(ultimo.situacionBaja || "").trim(), tramos: ver(cadena) };
  }
  if (r.fin && baja && r.fin < baja) {
    const tramos = mismas.filter((x) => x.inicio <= baja && (!x.fin || x.fin >= alta));
    const esHecho = (x: RelacionArca) => !/vencimiento/i.test(String(x.situacionBaja || ""));
    if (tramos.length === 1 && esHecho(r)) return { tipo: "baja_anterior", aplicar: true, ...base };
    const fueraDeRango = tramos.some((x) => x.inicio < alta || !x.fin || x.fin > baja);
    if (fueraDeRango) return { tipo: "revision_manual", aplicar: false, ...base, tramos: ver(tramos) };
    if (ultimo.fin === baja || tramos.every((x) => !esHecho(x))) {
      const finUltimo = tramos.map((x) => x.fin).sort().at(-1)!;
      return { tipo: "arca_granularidad", aplicar: false, ...base, tramos: ver(tramos), diasAntesDelFin: diasEntre(finUltimo, baja) };
    }
    return { tipo: "revision_manual", aplicar: false, ...base, tramos: ver(tramos) };
  }
  if (r.fin && baja && r.fin > baja) return { tipo: "arca_posterior", aplicar: false, ...base };
  // Abierta en ARCA y el contrato ya terminó: falta presentar la baja en ARCA (no al revés).
  if (!r.fin && baja && baja < hoy) return { tipo: "arca_abierta", aplicar: false, ...base };
  return null;
}

/** El valor a guardar, con el mismo formato que el alta del contrato (texto «AAAA-MM-DD» o ISO con hora). */
export function bajaConFormatoDelAlta(fin: string, alta: unknown): string {
  return typeof alta === "string" && /T\d{2}:/.test(alta) ? `${fin}T00:00:00.000Z` : fin;
}
