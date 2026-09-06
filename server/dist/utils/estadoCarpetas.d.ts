import { PropositoCarpeta } from "./propositosCarpeta.js";
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
export declare const fallbacksUsados: () => {
    proposito: PropositoCarpeta;
    carpeta: string;
    cuando: Date;
    veces: number;
}[];
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
export declare function elegirCarpeta(estados: EstadoConCarpetas[], proposito: PropositoCarpeta): CarpetaResuelta;
/** Igual que `elegirCarpeta`, pero leyendo la configuración y dejando registro del fallback. */
export declare function resolverProposito(proposito: PropositoCarpeta): Promise<CarpetaResuelta>;
/** El path, o `null`. Es lo que consume el código que solo necesita la ruta. */
export declare function resolverCarpetaPorProposito(proposito: PropositoCarpeta): Promise<string | null>;
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
export declare function elegirSinCuit(estados: EstadoConCarpetas[]): CarpetaResuelta;
export declare function resolverSinCuit(): Promise<CarpetaResuelta>;
/**
 * El ESTADO cuya configuración incluye alguna carpeta de alguno de estos propósitos.
 *
 * Lo usa la bandeja de Firma Digital para saber qué estado la alimenta, sin hardcodear su nombre.
 */
export declare function resolverEstadoPorPropositos(propositos: PropositoCarpeta[]): Promise<string | null>;
/**
 * Estado de resolución de los seis propósitos. Es lo que dibuja el síntoma en pantalla.
 *
 * NO bloquea nada ni afirma que falte algo: un tenant puede legítimamente no usar un propósito. Solo
 * dice, para cada uno, si se resolvió por su propósito, de casualidad por el nombre, o no se resolvió.
 */
export declare function diagnosticoCarpetas(): Promise<CarpetaResuelta[]>;
export {};
