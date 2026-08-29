/**
 * De dónde sale la escala salarial de una categoría. LA REGLA VIVE ACÁ Y EN NINGÚN OTRO LADO.
 *
 * La retribución pactada (pos. 58-72 del TXT) es el `sueldoBruto`, y hay dos lugares posibles de
 * donde puede venir porque ARCA no publica grupos en todos los convenios:
 *
 *   1. LA CATEGORÍA, si tiene escala propia. Es el caso de los convenios de actores (0322/75,
 *      0102/90), donde el nomenclador lista categorías sueltas y no hay grupo del cual heredar.
 *   2. EL GRUPO, si la categoría cuelga de uno. Es 0634/11 y el 0131/75 moderno: doce escalas
 *      cubren más de cien categorías, y duplicar la paritaria por categoría es garantizar que se
 *      desincronicen en la próxima actualización.
 *   3. NINGUNA → «sin escala». No se inventa un cero que parezca un sueldo: quien llama distingue
 *      «cobra $0» de «no sabemos cuánto cobra», y solo el segundo bloquea el alta.
 *
 * La categoría gana sobre el grupo, y no al revés, por una razón práctica: si alguien cargó una
 * escala EN la categoría, es porque ese convenio no tiene grupos o porque hace una excepción. El
 * grupo es el default heredado; la categoría es la decisión explícita.
 *
 * Está en un módulo propio y sin dependencias de Mongoose a propósito: la usan el aplanado de
 * compatibilidad, el modal de contrato y el generador del TXT. Tres copias de esto se separan solas,
 * y lo que se separa decide cuánto dice que cobra una persona ante el organismo.
 */
export interface EscalaSalarial {
    sueldoBasico: number;
    sueldoAdicional: number;
    presentismo: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    /** Desde cuándo rige. */
    fechaActualizacion?: Date | string;
    /** Hasta cuándo. Vacío = la paritaria no lo declaró. */
    vigenciaHasta?: Date | string;
    /** De dónde salió. `null` = no hay escala en ningún lado. */
    origen: "categoria" | "grupo" | null;
}
/**
 * La escala que rige para esta categoría: propia → del grupo → ninguna.
 *
 * `grupo` puede ser `null`/`undefined` sin problema: una categoría sin grupo es válida y esperada.
 */
export declare const escalaDeCategoria: (categoria: any, grupo?: any) => EscalaSalarial;
/** `true` si el alta se puede generar con esta categoría. Sin escala, no hay retribución que declarar. */
export declare const tieneEscalaResuelta: (categoria: any, grupo?: any) => boolean;
