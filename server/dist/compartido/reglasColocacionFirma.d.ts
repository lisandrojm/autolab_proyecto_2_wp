/**
 * DÓNDE VA LA FIRMA EN CADA TIPO DE DOCUMENTO (bot de Dropbox Sign, 22/10/2026). Módulo DECLARATIVO y
 * PURO: una tabla de reglas por tipo, anclada al TEXTO del PDF (y, cuando el rótulo está dibujado y no
 * escrito, a las palabras que devuelve el OCR de la franja). Sin ancla NO se envía: el documento queda
 * en revisión con el motivo. No hay recetas de pantalla de respaldo: lo que muestra la previsualización
 * es exactamente lo que el motor va a colocar.
 *
 * Las reglas son SERIALIZABLES (patrones como texto): el catálogo de abajo es el de fábrica y cada
 * tenant guarda su copia editable (`integrations.dropboxSign.bot.reglasColocacion`, ver
 * `services/dropboxSignBot/reglasTenant.ts`). Agregar un tipo = una entrada acá + un fixture + un test;
 * el motor no conoce tipos.
 *
 * Coordenadas: PUNTOS PDF, con `y` medido DESDE ARRIBA de la página (así «sobre la línea» es `y`
 * menor). La conversión a píxeles de pantalla es `pdfAPantalla`, con la caja de la página renderizada
 * en el editor.
 *
 * TRES TIPOS DE ANCLA:
 *   · derechaDelRotulo   «Firma: ______»: el campo va a la derecha del rótulo, sobre la línea de guiones
 *                        de ese mismo renglón (contratos).
 *   · sobreRotulo        una línea horizontal con el rótulo DEBAJO («Firma Empleado» del recibo, la
 *                        celda de la constancia de ARCA): el campo va encima de la línea, centrado en el
 *                        rótulo, con el ancho de la línea.
 *   · columnaDelFirmante dos columnas con «______ / Firma / Aclaración: NOMBRE» (releases): la columna
 *                        cuya «Aclaración» trae el nombre del firmante; el campo va sobre su línea.
 *
 * LO QUE NUNCA: ninguna coincidencia cuyo texto contenga una palabra de `excluir` («Empleador» por
 * defecto) puede ser ancla, y el rótulo se compara ENTERO y por palabra: «Firma Empleado» no matchea
 * adentro de «Firma Empleador». Lo descartado se devuelve con su motivo para que la UI lo muestre.
 */
export interface ItemTexto {
    str: string;
    x: number;
    /** Desde arriba de la página. */
    y: number;
    w: number;
    h: number;
    /** De dónde salió: la capa de texto del PDF o el OCR de la franja. */
    fuente?: "texto" | "ocr";
}
export interface Rect {
    x: number;
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
    /** Palabras leídas por OCR de la franja (si se hizo). */
    ocr?: ItemTexto[];
    /** Líneas horizontales detectadas en la imagen de la franja (puntos PDF). */
    lineas?: Rect[];
}
export interface PuntoPdf {
    x: number;
    y: number;
}
export type TipoAncla = "derechaDelRotulo" | "sobreRotulo" | "columnaDelFirmante";
export declare const TIPOS_ANCLA: Record<TipoAncla, string>;
export type Ocurrencia = "ultima" | "primera";
export interface Ancla {
    tipo: TipoAncla;
    /** Texto o expresión regular (sin tildes obligatorias) del rótulo a buscar. */
    rotulo: string;
    /** Con varias coincidencias válidas, cuál: la última (por defecto) o la primera del documento. */
    ocurrencia: Ocurrencia;
    /** Palabras que descartan una coincidencia (comparación por palabra entera, sin tildes ni mayúsculas). */
    excluir: string[];
    /** Ajuste fino del campo, en puntos PDF. */
    offset: {
        dx: number;
        dy: number;
    };
}
export type Validacion = {
    tipo: "enMitadIzquierda";
} | {
    tipo: "enMitadDerecha";
}
/** El campo no puede quedar a menos de `distanciaMin` puntos de ningún texto que matchee. */
 | {
    tipo: "lejosDeTexto";
    patron: string;
    distanciaMin: number;
}
/** El campo tiene que quedar a lo sumo a `distanciaMax` puntos de un texto que matchee. `"FIRMANTE"` = el nombre del firmante. */
 | {
    tipo: "textoCercano";
    patron: string;
    distanciaMax: number;
};
export interface ReglaColocacion {
    tipo: string;
    /** Expresión regular (insensible a mayúsculas) sobre el nombre de archivo. */
    patronNombre: string;
    /** `pendiente` = reconocido pero sin regla: requiere_revision, nunca se envía. */
    estado: "activo" | "pendiente";
    motivoPendiente?: string;
    /** Dónde buscar el ancla. */
    pagina: "primera" | "ultima" | "cualquiera";
    /** Se prueban en orden; la primera con coincidencias válidas manda. */
    anclas: Ancla[];
    /** Si el rótulo no está en la capa de texto: franja de la página (fracciones del alto) que se lee por OCR. */
    ocr: {
        desde: number;
        hasta: number;
    } | null;
    /** Alto del campo (pt). El ancho es el de la línea del ancla; si no se mide, `anchoFijo`. */
    campo: {
        alto: number;
        anchoFijo: number;
    };
    validaciones: Validacion[];
    /** Qué se espera ver, para quien lea el log. */
    descripcion: string;
}
/** Viewport con el que se validó el editor. El motor lo exige. */
export declare const VIEWPORT: {
    readonly width: 1457;
    readonly height: 812;
};
/** Dónde está el ítem «Firma» del panel izquierdo del editor, en ese viewport. */
export declare const ORIGEN_FIRMA: {
    readonly x: 69;
    readonly y: 504;
};
/** Tolerancia (puntos PDF) del rectángulo donde tiene que caer el centro del campo colocado. */
export declare const TOLERANCIA: {
    readonly x: 70;
    readonly y: 40;
};
export declare const REGLAS_BASE: ReglaColocacion[];
export declare const sinTildes: (s: string) => string;
/** Compila una expresión regular guardada como texto; `null` si no compila. */
export declare function compilar(patron: string, flags?: string): RegExp | null;
/** El patrón de un rótulo: regex si lo parece, texto literal (espacios flexibles) si no. */
export declare function patronDeRotulo(rotulo: string): RegExp | null;
/** El tramo [desde, hasta) extendido a los bordes de palabra: «Firma Empleado» adentro de «Firma Empleador» se extiende a «Firma Empleador». */
export declare function extenderAPalabra(texto: string, desde: number, hasta: number): {
    desde: number;
    hasta: number;
};
/** ¿El texto contiene esa palabra ENTERA (sin tildes ni mayúsculas)? «Empleador» no está en «Firma Empleado». */
export declare function contienePalabra(texto: string, palabra: string): boolean;
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
/** Un renglón: ítems vecinos a la misma altura, unidos con un espacio, con el mapa de caracteres a x. */
export interface Renglon {
    texto: string;
    rect: Rect;
    partes: Array<ItemTexto & {
        desde: number;
        hasta: number;
    }>;
}
/** Los renglones de una página (capa de texto + palabras del OCR), de arriba hacia abajo. */
export declare function renglonesDe(pagina: PaginaPdf): Renglon[];
/** El rectángulo de un tramo [desde, hasta) de caracteres del renglón. */
export declare function rectDeTramo(r: Renglon, desde: number, hasta: number): Rect;
export interface Coincidencia {
    /** El renglón entero. */
    renglon: Renglon;
    texto: string;
    /** Tramo del rótulo. */
    desde: number;
    hasta: number;
    rect: Rect;
    /** Lo que sigue al rótulo hasta la próxima coincidencia (o el fin del renglón). */
    segmento: string;
    segmentoDesde: number;
    segmentoHasta: number;
    fuente: "texto" | "ocr";
}
/** Todas las coincidencias de un patrón en los renglones de la página, en orden de lectura. */
export declare function coincidencias(pagina: PaginaPdf, patron: RegExp): Coincidencia[];
/** Los tramos de texto que matchean (como ítems), también cuando la frase está partida en varios ítems del renglón. */
export declare function buscarTexto(pagina: PaginaPdf, patron: RegExp): ItemTexto[];
export interface ContextoValidacion {
    pagina: PaginaPdf;
    paginaIndex: number;
    totalPaginas: number;
    nombreFirmante?: string;
}
/** Aplica las validaciones a un punto. Devuelve las que fallan (vacío = ok). */
export declare function validarPunto(punto: PuntoPdf, validaciones: Validacion[], ctx: ContextoValidacion): string[];
/** La regla que matchea el nombre de archivo, o `null`. `Release_Servicios` no matchea `Release`. */
export declare function reglaDe(nombreArchivo: string, reglas?: ReglaColocacion[]): ReglaColocacion | null;
/** Por qué un archivo no se puede enviar por su tipo, o `null` si tiene regla activa. */
export declare function motivoPorTipo(nombreArchivo: string, reglas?: ReglaColocacion[]): string | null;
/** Valida y normaliza una lista de reglas (lo que llega del PUT). */
export declare function validarReglas(entrada: unknown): {
    ok: true;
    reglas: ReglaColocacion[];
} | {
    ok: false;
    error: string;
};
export interface Candidato {
    /** Base 1. */
    pagina: number;
    paginaIndex: number;
    /** El rótulo tal como se leyó (con el renglón entero en `renglon`). */
    texto: string;
    renglon: string;
    rect: Rect;
    fuente: "texto" | "ocr";
    ancla: TipoAncla;
    rotulo: string;
}
export interface Descartado extends Candidato {
    motivo: string;
}
export interface Colocacion {
    tipo: string;
    /** Adónde tiene que ir el motor. `otra` (una página del medio) no la sabe navegar: requiere_revision. */
    pagina: "primera" | "ultima" | "otra";
    paginaIndex: number;
    tamanoPagina: {
        ancho: number;
        alto: number;
    };
    /** El campo de firma, en puntos PDF. Es lo que muestra la previsualización. */
    campo: Rect;
    /** El centro del campo: donde se suelta. */
    puntoPdf: PuntoPdf;
    /** Dónde tiene que quedar el centro del campo colocado (± tolerancia). */
    rectEsperado: Rect;
    /** La línea sobre la que va el campo, si se midió. */
    linea: Rect | null;
    descripcion: string;
    /** Qué pasó al resolver, para el log. */
    nota: string;
    /** «plantilla»: la posición la declaró la plantilla al generar el documento (familia A). Ausente = por ancla (familia B). */
    origen?: "plantilla" | "ancla";
}
export type Deteccion = {
    ok: true;
    colocacion: Colocacion;
    ancla: Candidato;
    descartados: Descartado[];
} | {
    ok: false;
    motivo: string;
    descartados: Descartado[];
    paginaIndex: number | null;
    tamanoPagina: {
        ancho: number;
        alto: number;
    } | null;
};
/**
 * Resuelve dónde va la firma para ese archivo. Devuelve el campo (puntos PDF) con el ancla elegida y
 * TODO lo que se descartó con su motivo. Nunca devuelve una colocación para un tipo pendiente o
 * desconocido, ni sin ancla: no hay respaldo de pantalla.
 */
export declare function resolverColocacion(nombreArchivo: string, paginas: PaginaPdf[] | null, contexto?: {
    nombreFirmante?: string;
}, reglas?: ReglaColocacion[]): Deteccion;
/** Alto del campo de firma de una plantilla (pt): el mismo de las reglas de contratos, validado con envíos reales. */
export declare const ALTO_CAMPO_PLANTILLA = 45;
/** Cuántas veces declara la plantilla dónde firmar (`{{firma}}`, con o sin espacios adentro). */
export declare const vecesFirmaEnPlantilla: (contenido: string) => number;
export interface MarcaDeFirma {
    /** Base 0. */
    paginaIndex: number;
    /** La línea de guiones, en puntos PDF (y desde arriba). */
    linea: Rect;
    renglon: string;
}
/** Todas las líneas de firma de la plantilla en el PDF, en orden de lectura. */
export declare function marcasDeFirma(paginas: PaginaPdf[]): MarcaDeFirma[];
export interface ColocacionDeclarada {
    origen: "plantilla";
    plantillaTipo: "contrato" | "release";
    plantillaId: string;
    plantillaNombre: string;
    /** La versión de la plantilla con la que se generó (sube con cada cambio de contenido). */
    plantillaVersion: number;
    /** Base 1: la página real donde cayó la firma. */
    pagina: number;
    totalPaginas: number;
    /** El campo de firma, en puntos PDF (origen arriba a la izquierda, como el resto de este módulo). */
    campo: Rect;
    linea: Rect;
    paginaSize: {
        w: number;
        h: number;
    };
    /** SHA-256 del PDF generado: si el del Outbox no es éste, la posición no se usa. */
    sha256: string;
    avisos: string[];
    capturadaAt: Date | string;
}
/**
 * De las marcas del PDF a la posición declarada. Con varias se toma la ÚLTIMA (y se avisa), igual que
 * las reglas de contratos. El campo va SOBRE la línea de guiones, con el ancho de la línea.
 */
export declare function colocacionDesdeMarcas(paginas: PaginaPdf[], vecesDeclarada: number): {
    ok: true;
    pagina: number;
    totalPaginas: number;
    campo: Rect;
    linea: Rect;
    paginaSize: {
        w: number;
        h: number;
    };
    avisos: string[];
} | {
    ok: false;
    motivo: string;
};
/** La detección que consume el bot, armada desde la posición declarada: sin rótulo, sin OCR. */
export declare function deteccionDesdeDeclarada(d: ColocacionDeclarada): Deteccion;
/**
 * POR QUÉ UNA VERIFICACIÓN GUARDADA YA NO ES EL ESTADO ACTUAL (25/10/2026). El panel mostraba el
 * resultado de días atrás como si fuera de hoy. Vale mientras el PDF del Outbox sea el mismo, las
 * reglas no hayan cambiado (si salió por regla) y la plantilla no tenga una versión nueva (si salió de
 * la plantilla). Vacío = vigente. Las anteriores a este dato no se pueden comparar: se avisa por la fecha.
 */
export declare function motivosDesactualizado(r: {
    verificadaAt?: Date | string;
    origen?: "plantilla" | "ancla";
    contentHash?: string;
    reglasAt?: Date | string | null;
    plantillaVersion?: number;
} | null | undefined, actual: {
    contentHash?: string;
    reglasAt?: Date | null;
    plantillaVersion?: number | null;
}, ahora?: Date): string[];
