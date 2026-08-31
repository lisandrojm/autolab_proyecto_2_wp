import { Info } from "../models/Info.js";
import { PropositoCarpeta, PROPOSITOS, definicionDe, esProposito, textoDeCarpeta, etiquetaProposito } from "./propositosCarpeta.js";

/**
 * QUÉ CARPETA DE DROPBOX CORRESPONDE A CADA PROPÓSITO.
 *
 * La configuración vive en los Estados (`Info type="estado-empleado"`,
 * `data.transicionAutomatica.carpetas`), que es lo que se edita en Configuración → Documentos →
 * Dropbox. Acá se traduce «necesito la carpeta de outbox» a un path concreto.
 *
 * ANTES SE RESOLVÍA POR EL NOMBRE, Y ESE ERA EL PROBLEMA
 *
 * Se matcheaba texto contra el último tramo del path: `[/alta/i, /temprana|afip/i]` encontraba «Alta
 * temprana de Arca» por la palabra «temprana». El día que alguien renombrara esa carpeta a «Acuses»,
 * dejaba de matchear **en silencio**: sin error, sin log, y los contratos simplemente no volvían a
 * avanzar. Ahora cada carpeta lleva su `proposito` explícito y el nombre pasa a ser lo que es, una
 * etiqueta para humanos.
 *
 * EL PATRÓN SIGUE, PERO COMO RED DE CONTENCIÓN Y HACIENDO RUIDO
 *
 * Mientras queden carpetas sin `proposito` cargado hay que poder resolverlas, así que el patrón se
 * conserva de fallback. Pero cada vez que se usa se registra: un fallback silencioso escondería
 * exactamente el problema que este cambio viene a eliminar, y además un patrón ancho puede acertar
 * de CASUALIDAD la carpeta equivocada en vez de no matchear ninguna. Que quede dicho cuál de las dos
 * cosas pasó es la mitad del valor del cambio.
 */

interface CarpetaConfigurada {
  dropboxCarpeta?: string;
  detalle?: string;
  proposito?: string;
}

/** De dónde salió la carpeta que se está usando. */
export type OrigenResolucion = "proposito" | "patron" | "derivada" | "no_resuelta";

export interface CarpetaResuelta {
  proposito: PropositoCarpeta;
  carpeta: string | null;
  origen: OrigenResolucion;
  /** El estado cuya configuración la aportó. Sirve para decir DÓNDE arreglarla. */
  estado?: string;
}

/**
 * Cada vez que hizo falta el fallback. En memoria, por proceso.
 *
 * No es un log de auditoría: es el insumo del síntoma visible. Sin esto, una carpeta sin migrar
 * resuelve bien y nadie se entera de que está resolviendo por el camino frágil — hasta que alguien
 * la renombra y deja de resolver.
 */
const usosDeFallback = new Map<string, { proposito: PropositoCarpeta; carpeta: string; cuando: Date; veces: number }>();

export const fallbacksUsados = () => [...usosDeFallback.values()].sort((a, b) => b.cuando.getTime() - a.cuando.getTime());

const anotarFallback = (proposito: PropositoCarpeta, carpeta: string) => {
  const previo = usosDeFallback.get(proposito);
  usosDeFallback.set(proposito, { proposito, carpeta, cuando: new Date(), veces: (previo?.veces || 0) + 1 });
  // Una línea por proceso y por propósito: sirve para enterarse, no para llenar el log.
  if (!previo) {
    console.warn(`[CARPETAS] «${etiquetaProposito(proposito)}» se resolvió POR EL NOMBRE de la carpeta ("${carpeta}"), no por su propósito. Cargale el propósito en Configuración → Documentos → Dropbox: si alguien la renombra, esta resolución deja de funcionar sin avisar.`);
  }
};

async function estadosConTransicion(): Promise<{ name: string; carpetas: CarpetaConfigurada[] }[]> {
  const estados = await Info.find({ type: "estado-empleado", "data.transicionAutomatica.carpetas.0": { $exists: true } })
    .select("name data.transicionAutomatica")
    .lean();
  return (estados as any[]).map((e) => ({ name: e.name, carpetas: (e?.data?.transicionAutomatica?.carpetas || []) as CarpetaConfigurada[] }));
}

/**
 * La carpeta de un propósito, diciendo de dónde salió.
 *
 * Primero por `proposito` explícito. Solo si ninguna lo tiene se cae al patrón — y ahí se anota.
 */
export interface EstadoConCarpetas {
  name: string;
  carpetas: CarpetaConfigurada[];
}

/**
 * La decisión, SIN base de datos. Es lo que se testea.
 *
 * Separada de la lectura a propósito: el comportamiento que importa —propósito primero, patrón
 * como último recurso, y nunca prestarse una carpeta que ya tiene otro propósito— se puede fijar
 * en tests sin levantar Mongo ni inventar un mock del modelo.
 */
export function elegirCarpeta(estados: EstadoConCarpetas[], proposito: PropositoCarpeta): CarpetaResuelta {
  for (const estado of estados) {
    const match = estado.carpetas.find((c) => c.proposito === proposito && c.dropboxCarpeta);
    if (match) return { proposito, carpeta: match.dropboxCarpeta!, origen: "proposito", estado: estado.name };
  }

  const patrones = definicionDe(proposito)?.patrones || [];
  for (const estado of estados) {
    /*
      Solo las que NO tienen propósito.

      Una carpeta con OTRO propósito cargado no puede "prestarse" porque su nombre se parezca: eso
      sería el acierto por casualidad que este cambio viene a eliminar, y encima pisando una
      decisión que alguien tomó explícitamente.
    */
    const match = estado.carpetas.find((c) => !esProposito(c.proposito) && c.dropboxCarpeta && patrones.every((re) => re.test(textoDeCarpeta(c))));
    if (match) return { proposito, carpeta: match.dropboxCarpeta!, origen: "patron", estado: estado.name };
  }

  return { proposito, carpeta: null, origen: "no_resuelta" };
}

/** Igual que `elegirCarpeta`, pero leyendo la configuración y dejando registro del fallback. */
export async function resolverProposito(proposito: PropositoCarpeta): Promise<CarpetaResuelta> {
  const r = elegirCarpeta(await estadosConTransicion(), proposito);
  if (r.origen === "patron" && r.carpeta) anotarFallback(proposito, r.carpeta);
  return r;
}

/** El path, o `null`. Es lo que consume el código que solo necesita la ruta. */
export async function resolverCarpetaPorProposito(proposito: PropositoCarpeta): Promise<string | null> {
  return (await resolverProposito(proposito)).carpeta;
}

/**
 * La carpeta de «Sin CUIT», que puede no estar configurada y deducirse de la de Constancia.
 *
 * LA DEDUCCIÓN TAMBIÉN PASA POR PROPÓSITO. Antes se resolvía Constancia por patrón y se le colgaba
 * «/Sin cuit» al padre: o sea que seguía atada al nombre por la puerta de atrás, aunque el primer
 * paso ya no lo estuviera. Ahora el hermano se calcula sobre la carpeta que el PROPÓSITO devolvió.
 *
 * El nombre «Sin cuit» del último tramo es lo único que queda escrito, y es inevitable: se está
 * nombrando una carpeta que todavía no existe en ningún lado. Por eso `origen` lo dice — quien mire
 * el estado va a ver que esa ruta se dedujo y no se configuró.
 */
/** La decisión de «Sin CUIT», sin base de datos. */
export function elegirSinCuit(estados: EstadoConCarpetas[]): CarpetaResuelta {
  const propia = elegirCarpeta(estados, "sin_cuit");
  if (propia.carpeta) return propia;

  const constancia = elegirCarpeta(estados, "constancia_cuit");
  if (!constancia.carpeta) return { proposito: "sin_cuit", carpeta: null, origen: "no_resuelta" };

  const raiz = constancia.carpeta.replace(/\/$/, "").split("/").slice(0, -1).join("/");
  return { proposito: "sin_cuit", carpeta: `${raiz}/Sin cuit`, origen: "derivada", estado: constancia.estado };
}

export async function resolverSinCuit(): Promise<CarpetaResuelta> {
  const estados = await estadosConTransicion();
  const r = elegirSinCuit(estados);
  if (r.origen === "patron" && r.carpeta) anotarFallback("sin_cuit", r.carpeta);
  return r;
}

/**
 * El ESTADO cuya configuración incluye alguna carpeta de alguno de estos propósitos.
 *
 * Lo usa la bandeja de Firma Digital para saber qué estado la alimenta, sin hardcodear su nombre.
 */
export async function resolverEstadoPorPropositos(propositos: PropositoCarpeta[]): Promise<string | null> {
  const estados = await estadosConTransicion();

  for (const estado of estados) {
    if (estado.carpetas.some((c) => esProposito(c.proposito) && propositos.includes(c.proposito as PropositoCarpeta))) return estado.name;
  }

  // Fallback por nombre, igual que arriba y con el mismo ruido.
  for (const estado of estados) {
    for (const p of propositos) {
      const patrones = definicionDe(p)?.patrones || [];
      const match = estado.carpetas.find((c) => !esProposito(c.proposito) && patrones.every((re) => re.test(textoDeCarpeta(c))));
      if (match) {
        anotarFallback(p, match.dropboxCarpeta || "");
        return estado.name;
      }
    }
  }
  return null;
}

/**
 * Estado de resolución de los seis propósitos. Es lo que dibuja el síntoma en pantalla.
 *
 * NO bloquea nada ni afirma que falte algo: un tenant puede legítimamente no usar un propósito. Solo
 * dice, para cada uno, si se resolvió por su propósito, de casualidad por el nombre, o no se resolvió.
 */
export async function diagnosticoCarpetas(): Promise<CarpetaResuelta[]> {
  const out: CarpetaResuelta[] = [];
  for (const p of PROPOSITOS) out.push(p.valor === "sin_cuit" ? await resolverSinCuit() : await resolverProposito(p.valor));
  return out;
}
