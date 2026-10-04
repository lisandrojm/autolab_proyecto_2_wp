import { LAYOUT_85, MAX_ALTAS_MASIVAS, partirEnTandas } from '@compartido/layoutAltaArca';

/**
 * EL PROGRESO DE UNA CORRIDA DE ALTAS MASIVAS POR TANDAS, reconstruido desde sus eventos.
 *
 * Puro, como `pasosDeLaCorrida`: el modal no guarda nada propio, así que cerrar y volver a abrir
 * muestra lo mismo. Los eventos los emite `server/src/services/arca/tandasAltas.ts`.
 */

export type EstadoPersonaTanda = 'pendiente' | 'presentando' | 'registrada' | 'rechazada' | 'incierta' | 'seco';

export interface FilaTanda {
  cuil: string;
  nombre: string;
  tanda?: number;
  estado: EstadoPersonaTanda;
  motivo?: string;
  /** Clave de alta temprana, si ARCA la mostró. */
  cat?: string;
  porConsulta?: boolean;
}

export interface TandaVista {
  n: number;
  estado: 'pendiente' | 'presentando' | 'terminada';
  resultado?: string;
  duracionMs?: number;
  personas: FilaTanda[];
}

export interface ProgresoTandas {
  /** El tope por tanda que se usó (el menor entre la pantalla de ARCA y la constante). */
  tope?: number;
  topeEnPantalla?: number | null;
  tandas: TandaVista[];
  /** Las que no se presentan en esta corrida: quedaron sin resultado en otra y solo se consultan. */
  consultadas: FilaTanda[];
  corte?: { motivo: string; mensaje: string };
  cuenta: Record<EstadoPersonaTanda, number>;
}

type Evento = Record<string, any> & { tipo: string };

export const ETIQUETA_ESTADO: Record<EstadoPersonaTanda, string> = {
  pendiente: 'Pendiente',
  presentando: 'Presentando',
  registrada: 'Registrada',
  rechazada: 'Rechazada',
  incierta: 'Incierta',
  seco: 'En seco (no presentada)',
};

export function progresoPorTandas(o: { eventos: Evento[]; personas: Array<{ cuil: string; nombre: string }>; descartadas?: Array<{ cuil: string; nombre: string; motivo: string }> }): ProgresoTandas {
  const ev = o.eventos || [];
  const ultimo = (tipo: string) => [...ev].reverse().find((e) => e.tipo === tipo);
  const evTope = ultimo('tope');
  const tope: number | undefined = evTope?.usado;

  // El estado de cada persona es el de su último evento.
  const estadoDe = new Map<string, Evento>();
  for (const e of ev) if (e.tipo === 'personaTanda') estadoDe.set(String(e.cuil), e);
  const nombres = new Map<string, string>([...o.personas, ...(o.descartadas || [])].map((p) => [p.cuil, p.nombre]));
  const fila = (cuil: string, tandaPlaneada?: number): FilaTanda => {
    const e = estadoDe.get(cuil);
    return { cuil, nombre: nombres.get(cuil) || cuil, tanda: e?.tanda ?? tandaPlaneada, estado: (e?.estado as EstadoPersonaTanda) || 'pendiente', motivo: e?.motivo, cat: e?.cat, porConsulta: !!e?.porConsulta };
  };

  // Las tandas REALES mandan (traen sus CUIL, incluidas las que ARCA devolvió y se volvieron a armar);
  // las que todavía no arrancaron se muestran como van a salir, partiendo lo que falta por el tope.
  const reales = new Map<number, Evento>();
  for (const e of ev) if (e.tipo === 'tanda') reales.set(Number(e.n), e);
  const tandas: TandaVista[] = [...reales.values()]
    .sort((a, b) => a.n - b.n)
    .map((t) => ({ n: t.n, estado: t.estado === 'terminada' ? 'terminada' : 'presentando', resultado: t.resultado, duracionMs: t.duracionMs, personas: (t.cuils as string[]).map((c) => fila(c, t.n)) }));
  // Quien aparece en una tanda posterior (devuelta y rearmada) se muestra solo en la última.
  const ultimaTandaDe = new Map<string, number>();
  for (const t of tandas) for (const p of t.personas) ultimaTandaDe.set(p.cuil, t.n);
  for (const t of tandas) t.personas = t.personas.filter((p) => ultimaTandaDe.get(p.cuil) === t.n);

  const sinTanda = o.personas.filter((p) => !ultimaTandaDe.has(p.cuil));
  let n = tandas.length;
  for (const grupo of partirEnTandas(sinTanda, tope || MAX_ALTAS_MASIVAS)) {
    n++;
    tandas.push({ n, estado: 'pendiente', personas: grupo.map((p) => fila(p.cuil, n)) });
  }

  const consultadas = (o.descartadas || []).filter((d) => d.motivo === 'incierta').map((d) => fila(d.cuil));
  const cuenta: Record<EstadoPersonaTanda, number> = { pendiente: 0, presentando: 0, registrada: 0, rechazada: 0, incierta: 0, seco: 0 };
  for (const t of tandas) for (const p of t.personas) cuenta[p.estado]++;
  const corte = ultimo('corte');
  return { tope, topeEnPantalla: evTope?.enPantalla, tandas, consultadas, corte: corte ? { motivo: corte.motivo, mensaje: corte.mensaje } : undefined, cuenta };
}

/**
 * LO QUE SE LE MANDÓ A ARCA POR UNA PERSONA, campo por campo: el registro de 85 partido con las
 * mismas posiciones con las que se arma (`LAYOUT_85`) y con los nombres que publica ARCA.
 *
 * `valor` es el tramo TAL CUAL viaja; `legible` solo le da forma a lo que cuesta leer de corrido
 * (fechas, remuneración). No se traduce ningún código a su nombre: la pantalla muestra lo presentado,
 * no lo que el catálogo dice hoy.
 */
export function detalleDeLoPresentado(registro: string): Array<{ nombre: string; posiciones: string; valor: string; legible?: string }> {
  const r = String(registro || '');
  const tramo = (c: { desde: number; hasta: number }) => r.slice(c.desde - 1, c.hasta);
  const fecha = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 2)}/${v.slice(2, 4)}/${v.slice(4)}` : v.trim() ? undefined : 'sin fecha');
  const filas: Array<{ nombre: string; posiciones: string; valor: string; legible?: string }> = [];
  for (const c of LAYOUT_85) {
    const valor = tramo(c);
    if (c.clave === 'retribucionDecimal') continue; // va junto con la parte entera
    if (c.clave === 'retribucionEntera') {
      const dec = LAYOUT_85.find((x) => x.clave === 'retribucionDecimal')!;
      filas.push({ nombre: 'Remuneracion', posiciones: `${c.desde}–${dec.hasta}`, valor: valor + tramo(dec), legible: `$ ${Number(valor).toLocaleString('es-AR')},${tramo(dec)}` });
      continue;
    }
    let legible: string | undefined;
    if (c.clave === 'fechaInicio' || c.clave === 'fechaFin') legible = fecha(valor);
    if (c.clave === 'cuil' && /^\d{11}$/.test(valor)) legible = `${valor.slice(0, 2)}-${valor.slice(2, 10)}-${valor.slice(10)}`;
    if (c.clave === 'agropecuario') legible = valor === '1' ? 'Agropecuario' : 'No agropecuario';
    filas.push({ nombre: c.nombre, posiciones: c.desde === c.hasta ? String(c.desde) : `${c.desde}–${c.hasta}`, valor, legible });
  }
  return filas;
}

const celda = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** El resumen para bajar: una fila por persona. Separado por «;», que es lo que abre Excel en castellano. */
export function resumenCsv(p: ProgresoTandas, empresa: { razonSocial?: string; cuit?: string }): string {
  const filas = [['Empleadora', 'CUIT empleadora', 'Tanda', 'CUIL', 'Nombre', 'Estado', 'C.A.T.', 'Confirmada por consulta', 'Motivo']];
  const agregar = (f: FilaTanda) => filas.push([empresa.razonSocial || '', empresa.cuit || '', f.tanda ? String(f.tanda) : '', f.cuil, f.nombre, ETIQUETA_ESTADO[f.estado], f.cat || '', f.porConsulta ? 'sí' : '', f.motivo || '']);
  for (const t of p.tandas) for (const f of t.personas) agregar(f);
  for (const f of p.consultadas) agregar(f);
  return filas.map((f) => f.map(celda).join(';')).join('\r\n');
}
