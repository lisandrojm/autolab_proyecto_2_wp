/**
 * DÓNDE VA LA FIRMA EN CADA TIPO DE DOCUMENTO (bot de Dropbox Sign, 22/10/2026). Módulo DECLARATIVO y
 * puro: una tabla de reglas por tipo, anclada al TEXTO del PDF (los PDF los genera la propia app, con
 * texto real), con la receta de pantalla validada a mano como respaldo. Agregar un tipo = agregar
 * una entrada acá + un fixture + un test; el motor no conoce tipos.
 *
 * Coordenadas: PUNTOS PDF, con `y` medido DESDE ARRIBA de la página (así «sobre la línea» es `y`
 * menor). La conversión a píxeles de pantalla es `pdfAPantalla`, con la caja de la página renderizada
 * en el editor.
 *
 * Estrategia (la ejecuta el motor): 1) ANCLA: se busca el texto en la página objetivo y se calcula el
 * punto; 2) FALLBACK: si no hay ancla, la receta de pantalla (viewport 1457×812, zoom «Ajustar al
 * ancho»), y se deja constancia; 3) si no hay nada o la verificación falla dos veces → requiere_revision.
 */
export interface ItemTexto {
    str: string;
    x: number;
    /** Desde arriba de la página. */
    y: number;
    w: number;
    h: number;
}
export interface PaginaPdf {
    /** Base 1. */
    numero: number;
    ancho: number;
    alto: number;
    items: ItemTexto[];
}
export interface PuntoPdf {
    x: number;
    y: number;
}
export interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}
export type Validacion = {
    tipo: "enMitadIzquierda";
} | {
    tipo: "enMitadDerecha";
} | {
    tipo: "enPrimeraPagina";
} | {
    tipo: "enUltimaPagina";
}
/** El campo no puede quedar a menos de `distanciaMin` puntos de ningún texto que matchee. */
 | {
    tipo: "lejosDeTexto";
    patron: RegExp;
    distanciaMin: number;
}
/** El campo tiene que quedar a lo sumo a `distanciaMax` puntos de un texto que matchee. `"FIRMANTE"` = el nombre del firmante. */
 | {
    tipo: "textoCercano";
    patron: RegExp | "FIRMANTE";
    distanciaMax: number;
};
export interface Ancla {
    /** Texto a buscar en la página objetivo. `"ACLARACION_FIRMANTE"` busca «Aclaración: <nombre del firmante>». */
    patron: RegExp | "ACLARACION_FIRMANTE";
    posicion: "sobreLineaDerecha" | "centroCeldaDerecha" | "sobreLineaIzquierda";
    /** Ajuste fino en puntos PDF respecto del punto que da la posición. */
    offset: {
        dx: number;
        dy: number;
    };
}
export interface FallbackPantalla {
    scroll: {
        enX: number;
        enY: number;
        direccion: "arriba" | "abajo";
        ticks: number;
    } | null;
    soltarEn: {
        x: number;
        y: number;
    };
}
export interface ReglaColocacion {
    tipo: string;
    patronNombre: RegExp;
    /** `pendiente` = reconocido pero sin regla: requiere_revision, nunca se envía. */
    estado: "activo" | "pendiente";
    /** Motivo que ve el usuario cuando está pendiente. */
    motivoPendiente?: string;
    pagina: "primera" | "ultima" | "paginaDelAncla";
    ancla?: Ancla;
    validaciones: Validacion[];
    fallback?: FallbackPantalla;
    /** Qué se espera ver, para quien lea el log. */
    descripcion: string;
}
/** Viewport con el que se validaron los fallbacks. El motor lo exige. */
export declare const VIEWPORT: {
    readonly width: 1457;
    readonly height: 812;
};
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export declare const ORIGEN_FIRMA: {
    readonly x: 69;
    readonly y: 504;
};
/** Tolerancia (puntos PDF) del rectángulo donde tiene que caer el campo colocado. */
export declare const TOLERANCIA: {
    readonly x: 70;
    readonly y: 40;
};
export declare const REGLAS_COLOCACION: ReglaColocacion[];
/** La regla que matchea el nombre de archivo, o `null`. `Release_Servicios` no matchea `Release`. */
export declare function reglaDe(nombreArchivo: string): ReglaColocacion | null;
/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export declare function motivoPorTipo(nombreArchivo: string): string | null;
/** Distancia (puntos) de un punto al rectángulo de un ítem: 0 si cae adentro. */
export declare function distanciaARect(p: PuntoPdf, r: Rect): number;
/** Puntos PDF → píxeles de pantalla, dada la caja (px) de la página renderizada en el editor. */
export declare function pdfAPantalla(punto: PuntoPdf, pagina: {
    ancho: number;
    alto: number;
}, caja: Rect): {
    x: number;
    y: number;
};
/** Píxeles de pantalla → puntos PDF (para verificar dónde quedó el campo). */
export declare function pantallaAPdf(px: {
    x: number;
    y: number;
}, pagina: {
    ancho: number;
    alto: number;
}, caja: Rect): PuntoPdf;
/** Los ítems de una página que matchean un patrón (por ítem, y también por línea: ítems vecinos a la misma altura unidos). */
export declare function buscarTexto(pagina: PaginaPdf, patron: RegExp): ItemTexto[];
export interface ContextoValidacion {
    pagina: PaginaPdf;
    paginaIndex: number;
    totalPaginas: number;
    nombreFirmante?: string;
}
/** Aplica las validaciones a un punto. Devuelve las que fallan (vacío = ok). */
export declare function validarPunto(punto: PuntoPdf, validaciones: Validacion[], ctx: ContextoValidacion): string[];
export interface Colocacion {
    tipo: string;
    estrategia: "ancla" | "fallback";
    /** `pagina` dice a cuál ir aunque no se conozca el total (fallback sin texto); `paginaIndex` cuando se conoce. */
    pagina: "primera" | "ultima";
    paginaIndex: number | null;
    /** Tamaño de la página objetivo (para convertir a pantalla). */
    tamanoPagina: {
        ancho: number;
        alto: number;
    } | null;
    /** Dónde soltar, en puntos PDF (estrategia ancla). */
    puntoPdf: PuntoPdf | null;
    /** Dónde tiene que quedar el campo, en puntos PDF (ancla ± tolerancia). */
    rectEsperado: Rect | null;
    /** La receta de pantalla (estrategia fallback, o respaldo si la caja de la página no se puede medir). */
    fallback: FallbackPantalla | null;
    validaciones: Validacion[];
    descripcion: string;
    /** Qué pasó al resolver, para el log. */
    nota: string;
}
export type ResultadoColocacion = {
    ok: true;
    colocacion: Colocacion;
} | {
    ok: false;
    motivo: string;
};
/**
 * Resuelve dónde va la firma para ese archivo. `paginas` puede venir vacío (no se pudo leer el PDF):
 * ahí sólo queda el fallback. Nunca devuelve una colocación para un tipo pendiente o desconocido.
 */
export declare function resolverColocacion(nombreArchivo: string, paginas: PaginaPdf[] | null, contexto?: {
    nombreFirmante?: string;
}): ResultadoColocacion;
