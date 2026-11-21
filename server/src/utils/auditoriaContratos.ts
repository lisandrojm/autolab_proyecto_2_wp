/**
 * AUDITORÍA DE CONTRATOS, LA PARTE PURA (etapa 3, 19/11/2026): qué cambió entre dos versiones de
 * `contracts[]` y qué campos toca un update. Sin base de datos, para poder probarlo.
 *
 * Todo se compara POR `contratoKey`, nunca por posición (decisión del usuario, 18/11): un contrato que
 * cambia de lugar no «cambia», y uno que desaparece de su lugar se ve como quitado aunque otro ocupe la
 * posición. Los que no tienen clave (no debería quedar ninguno después del backfill) se aparean por
 * posición y quedan marcados así.
 */

export type TipoEvento = "creado" | "modificado" | "anulado" | "quitado";

export interface CambioDeCampo {
  campo: string;
  antes: unknown;
  despues: unknown;
}

export interface EventoContrato {
  contratoKey: string | null;
  posicion: number;
  tipo: TipoEvento;
  cambios: CambioDeCampo[];
  resumen: { nombre_contrato?: string; fecha_alta_contrato?: string; fecha_baja_contrato?: string };
  motivo?: string;
  nota?: string;
}

/** Los textos largos (un contrato custom, un HTML) no se guardan enteros: se nota que cambiaron y cuánto miden. */
const MAX_TEXTO = 300;

const esObjectId = (v: any) => v && typeof v === "object" && (v._bsontype === "ObjectId" || v._bsontype === "ObjectID");

/** Valor comparable y guardable: fechas a ISO, ObjectId a texto, vacíos (null, undefined, "", []) a null. */
export function normalizar(v: any): unknown {
  if (v === undefined || v === null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (esObjectId(v)) return String(v);
  if (Array.isArray(v)) return v.length ? v.map(normalizar) : null;
  if (typeof v === "object") {
    const salida: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      if (k === "_id") continue;
      const n = normalizar(v[k]);
      if (n !== null) salida[k] = n;
    }
    return Object.keys(salida).length ? salida : null;
  }
  return v;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function paraGuardar(v: unknown): unknown {
  if (typeof v === "string" && v.length > MAX_TEXTO) return `${v.slice(0, 80)}… (${v.length} caracteres)`;
  if (v && typeof v === "object") {
    const texto = JSON.stringify(v);
    if (texto.length > MAX_TEXTO * 4) return `(objeto de ${texto.length} caracteres)`;
  }
  return v;
}

const dia = (v: any) => {
  const n = normalizar(v);
  return typeof n === "string" ? n.slice(0, 10) : undefined;
};
export const resumenDe = (c: any) => ({
  nombre_contrato: c?.nombre_contrato || c?.anulacion?.contrato?.nombre_contrato || undefined,
  fecha_alta_contrato: dia(c?.fecha_alta_contrato),
  fecha_baja_contrato: dia(c?.fecha_baja_contrato),
});

const esAnulado = (c: any) => c?.estadoContrato === "ANULADO";
const claveDe = (c: any) => (c?.contratoKey ? String(c.contratoKey) : null);

/**
 * Los cambios campo por campo entre dos versiones del mismo contrato. Con `campos`, sólo esos (cuando
 * se leyó una proyección: lo que no se leyó no se puede comparar).
 */
export function cambiosEntre(antes: any, despues: any, campos?: string[]): CambioDeCampo[] {
  const nombres = campos ?? [...new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})])];
  const cambios: CambioDeCampo[] = [];
  for (const campo of nombres.sort()) {
    if (campo === "_id" || campo === "contratoKey") continue;
    const a = normalizar(antes?.[campo]);
    const d = normalizar(despues?.[campo]);
    if (!igual(a, d)) cambios.push({ campo, antes: paraGuardar(a), despues: paraGuardar(d) });
  }
  return cambios;
}

/**
 * Los eventos entre dos versiones de `contracts[]`. `antes` null = no se sabe cómo estaba (se avisa en
 * `nota`); `despues` null = el vínculo se borró (todo quitado).
 */
export function diferenciasDeContratos(antes: any[] | null | undefined, despues: any[] | null | undefined, opciones: { campos?: string[]; motivoQuitado?: string } = {}): EventoContrato[] {
  const eventos: EventoContrato[] = [];
  const A = antes || [];
  const D = despues || [];

  if (antes == null && despues != null) {
    D.forEach((c, i) => eventos.push({ contratoKey: claveDe(c), posicion: i, tipo: "modificado", cambios: [], resumen: resumenDe(c), nota: "sin estado anterior: no se puede decir qué cambió" }));
    return eventos;
  }

  const porClaveAntes = new Map<string, { c: any; i: number }>();
  A.forEach((c, i) => {
    const k = claveDe(c);
    if (k) porClaveAntes.set(k, { c, i });
  });
  const vistas = new Set<string>();

  D.forEach((c, i) => {
    const k = claveDe(c);
    // Sin clave: se aparea por posición con uno que tampoco la tenía.
    const previo = k ? porClaveAntes.get(k) : !claveDe(A[i]) && A[i] ? { c: A[i], i } : undefined;
    if (k) vistas.add(k);
    const nota = k ? undefined : "contrato sin clave: apareado por posición";
    if (!previo) {
      eventos.push({ contratoKey: k, posicion: i, tipo: esAnulado(c) ? "anulado" : "creado", cambios: [], resumen: resumenDe(c), ...(esAnulado(c) ? { motivo: c?.anulacion?.motivo } : {}), ...(nota ? { nota } : {}) });
      return;
    }
    if (esAnulado(c) && !esAnulado(previo.c)) {
      // La lápida ya no tiene los datos: el contrato entero está en `contratos_anulados`.
      eventos.push({ contratoKey: k, posicion: i, tipo: "anulado", cambios: [], resumen: resumenDe(previo.c), motivo: c?.anulacion?.motivo || undefined, ...(nota ? { nota } : {}) });
      return;
    }
    const cambios = cambiosEntre(previo.c, c, opciones.campos);
    if (cambios.length) eventos.push({ contratoKey: k, posicion: i, tipo: "modificado", cambios, resumen: resumenDe(c), ...(previo.i !== i ? { nota: `pasó de la posición ${previo.i} a la ${i}` } : {}), ...(nota ? { nota } : {}) });
  });

  A.forEach((c, i) => {
    const k = claveDe(c);
    if (k ? vistas.has(k) : D[i] && !claveDe(D[i])) return;
    eventos.push({ contratoKey: k, posicion: i, tipo: "quitado", cambios: [], resumen: resumenDe(c), ...(opciones.motivoQuitado ? { motivo: opciones.motivoQuitado } : {}) });
  });
  return eventos;
}

export interface CamposTocados {
  /** El update toca `contracts`. */
  toca: boolean;
  /** Reemplaza contratos enteros (o el array): hay que leer todo para comparar. */
  todo: boolean;
  /** Si no es todo: los campos de primer nivel del contrato que toca. */
  campos: string[];
}

const POSICIONAL = /^(\$|\$\[[^\]]*\]|\d+)$/;

/** Qué toca de `contracts` un update de Mongo (operadores, reemplazo o pipeline). */
export function camposTocados(update: any, esReemplazo = false): CamposTocados {
  const nada: CamposTocados = { toca: false, todo: false, campos: [] };
  if (!update) return nada;
  if (Array.isArray(update)) return { toca: true, todo: true, campos: [] }; // pipeline: no se adivina
  const campos = new Set<string>();
  let todo = false;
  let toca = false;
  const mirar = (ruta: string) => {
    if (ruta === "contracts") {
      toca = todo = true;
      return;
    }
    if (!ruta.startsWith("contracts.")) return;
    toca = true;
    const partes = ruta.slice("contracts.".length).split(".");
    if (!POSICIONAL.test(partes[0]) || partes.length === 1) todo = true;
    else campos.add(partes[1]);
  };
  for (const [k, v] of Object.entries(update)) {
    if (k.startsWith("$")) {
      if (v && typeof v === "object") for (const ruta of Object.keys(v as object)) mirar(ruta);
      // $rename: el destino también.
      if (k === "$rename" && v && typeof v === "object") for (const destino of Object.values(v as object)) mirar(String(destino));
    } else if (esReemplazo) {
      if (k === "contracts") toca = todo = true;
    } else {
      mirar(k);
    }
  }
  if (esReemplazo && !toca) return { toca: true, todo: true, campos: [] }; // un reemplazo sin contracts los borra
  return { toca, todo, campos: [...campos] };
}

/** Lo que hay que leer para comparar: siempre la clave, el estado y el resumen; además lo tocado. */
export function proyeccionPara(t: CamposTocados): Record<string, 1> {
  if (t.todo) return { contracts: 1, projectId: 1, userId: 1 };
  // Sin choque de rutas: si se toca `anulacion` entera, no se pide además `anulacion.motivo`.
  const base = ["contratoKey", "estadoContrato", ...(t.campos.includes("anulacion") ? [] : ["anulacion.motivo"]), "nombre_contrato", "fecha_alta_contrato", "fecha_baja_contrato", ...t.campos];
  return { projectId: 1, userId: 1, ...Object.fromEntries(base.map((c) => [`contracts.${c}`, 1 as const])) };
}
