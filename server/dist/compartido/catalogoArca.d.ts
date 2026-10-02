/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * EL CATÁLOGO DE ARCA Y LAS CATEGORÍAS DE WEPRODU: CÓMO SE COMPARAN
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Una categoría de WeProdu tiene NOMBRE propio, grupo y escala, y un CÓDIGO de ARCA que es lo que viaja
 * al alta. El código no se puede tipear: tiene que ser una fila vigente del espejo de ARCA para ese
 * convenio, y la descripción que ARCA le da a ese código tiene que corresponder al nombre.
 *
 * Esto existe porque pasó lo contrario: 41 categorías del 0634/11 quedaron con el código de otra
 * categoría de su mismo grupo (códigos consecutivos asignados a nombres en orden alfabético), y 1.400
 * contratos declararon ante ARCA una categoría que no era la suya. El CSV y ARCA estaban bien; nada
 * comparaba la base contra ellos.
 *
 * Las reglas viven ACÁ, una sola vez: las usan el script de corrección, la validación del ABM, el
 * estado que muestra la pantalla, el chequeo del alta y la sincronización contra ARCA.
 */
/** Una fila de `documentation/arca_tablas_simplificacion_registral.csv`. */
export interface FilaCsvArca {
    tabla: string;
    alcance: string;
    codigo: string;
    codigoPadded: string;
    largo: number;
    descripcion: string;
    filtroPadre: string;
}
/** Las columnas del CSV, en orden. El export las escribe así. */
export declare const COLUMNAS_CSV_ARCA: readonly ["tabla", "alcance", "codigo", "codigo_padded", "largo_campo_txt", "descripcion", "filtro_padre"];
/**
 * Parser de CSV con comillas (las descripciones traen comas y alguna comilla doblada). Tolera BOM y
 * CRLF. Devuelve filas crudas; `filasCsvArca` las tipa.
 */
export declare function parsearCsv(texto: string): string[][];
export declare function filasCsvArca(texto: string): FilaCsvArca[];
/**
 * Compara por significado: sin acentos, mayúsculas, sin el «- GRUPO N» de ARCA, sin puntuación y sin
 * diferencias de espaciado. Es la ÚNICA normalización: antes había una por script y no coincidían.
 */
export declare const normalizarNombre: (s: string) => string;
/**
 * Equivalencias declaradas a mano, nombre local normalizado → nombre de ARCA normalizado.
 *
 * Van EXPLÍCITAS y no como una comparación más laxa (prefijo, distancia de edición): aflojar el
 * criterio emparejaría también «Asistente de Cámara» con «Asistente de Cámara Especializado / Grip»,
 * y lo que se decide con esto es el código que viaja a ARCA. Cada línea es auditable.
 */
export declare const ALIAS_NOMBRES: Record<string, string>;
/** El nombre local como se compara contra ARCA: normalizado y con el alias aplicado. */
export declare const nombreComparable: (nombreLocal: string) => string;
/**
 * La descripción de ARCA partida en nombre y grupo. Dos formas:
 *   sufijo   0634/11  «DIRECTOR DE PROGRAMAS - GRUPO 1»          → grupo 1
 *   prefijo  0131/75  «1ª CATEGORIA - ASISTENTE DE DIRECCION»     → grupo 1, llamado «1ª CATEGORIA»
 * El ordinal se acepta por code point (ª º °) para que un re-guardado con otro encoding no lo rompa.
 */
export declare function partirDescripcion(descripcion: string): {
    nombre: string;
    grupo: number | null;
    nombreGrupo: string;
};
export declare const grupoDeDescripcion: (descripcion: string) => number | null;
export type EstadoCategoriaArca = "ok" | "nombre_distinto" | "grupo_distinto" | "no_existe_en_arca" | "no_vigente";
export declare const TEXTO_ESTADO_CATEGORIA: Record<EstadoCategoriaArca, string>;
export interface FilaEspejo {
    codigo: string;
    descripcion: string;
    vigente: boolean;
}
/**
 * El estado de una categoría contra el espejo de ARCA.
 *
 * `confirmacion` es la de una persona que ya revisó un `nombre_distinto` y lo aceptó: vale solo si
 * confirmó la MISMA descripción que hoy publica ARCA. Si ARCA la cambia, la confirmación cae sola.
 */
export declare function estadoCategoria(o: {
    nombre: string;
    grupoNumero: number | null | undefined;
    fila: FilaEspejo | null | undefined;
    confirmacion?: {
        descripcionArca?: string;
    } | null;
}): {
    estado: EstadoCategoriaArca;
    confirmada: boolean;
    descripcionArca: string;
    grupoArca: number | null;
};
/** ¿Se puede declarar ante ARCA con este estado? `ok`, o `nombre_distinto` que alguien confirmó. */
export declare const estadoPermiteAlta: (e: {
    estado: EstadoCategoriaArca;
    confirmada: boolean;
}) => boolean;
export interface CategoriaParaEmparejar {
    id: string;
    nombre: string;
    convenio: string;
    codigoArca: string;
    grupoNumero: number | null;
    contratos: number;
}
export interface OficialArca {
    codigo: string;
    descripcion: string;
}
export interface CambioCodigo {
    id: string;
    nombre: string;
    convenio: string;
    grupo: number | null;
    de: string;
    a: string;
    descripcionArca: string;
    contratos: number;
}
/**
 * EMPAREJA cada categoría de un convenio con la fila de ARCA que corresponde a su NOMBRE.
 *
 * La regla: el nombre manda, el código se corrige. Exige que el grupo de ARCA coincida con el de la
 * categoría (el grupo es correcto: de él sale la escala). Lo que no empareja de forma única NO se
 * adivina: va a `sinMatch` / `ambiguas` / `grupoDistinto`, y con eso el script se detiene.
 *
 * `colisiones` = dos categorías terminarían con el mismo código. Con eso tampoco se aplica nada.
 */
export declare function emparejarCategorias(categorias: CategoriaParaEmparejar[], oficiales: OficialArca[]): {
    cambios: CambioCodigo[];
    correctas: {
        id: string;
        codigo: string;
        descripcionArca: string;
    }[];
    sinMatch: CategoriaParaEmparejar[];
    ambiguas: (CategoriaParaEmparejar & {
        candidatos: string[];
    })[];
    grupoDistinto: (CategoriaParaEmparejar & {
        codigoArcaCorrecto: string;
        grupoArca: number | null;
    })[];
    colisiones: {
        codigo: string;
        nombres: string[];
    }[];
};
export interface FilaCatalogo {
    tabla: string;
    filtroPadre: string;
    codigo: string;
    descripcion: string;
}
export interface DiffCatalogo {
    nuevos: FilaCatalogo[];
    dejaronDePublicarse: FilaCatalogo[];
    descripcionCambiada: Array<FilaCatalogo & {
        descripcionAnterior: string;
    }>;
}
export declare const claveCatalogo: (f: {
    tabla: string;
    filtroPadre: string;
    codigo: string;
}) => string;
/** Espacios colapsados y recortados: ARCA y el CSV difieren en espaciado sin cambiar el texto. */
export declare const textoComparable: (s: string) => string;
/**
 * Lo que cambió entre el espejo (solo las filas VIGENTES de las tablas leídas) y una lectura de ARCA.
 *
 * `tablasLeidas`: solo se comparan esas. Una tabla que no se pudo leer NO significa que ARCA dejó de
 * publicar todo: sin esto, una lectura incompleta daría de baja el catálogo entero.
 * `filtrosLeidos` (opcional, por tabla): para las tablas que dependen de la empleadora, los padres que
 * esa empleadora ve (sus convenios). Una categoría de un convenio que esta empleadora no tiene no
 * «dejó de publicarse»: simplemente no se ve desde acá.
 */
export declare function calcularDiff(espejoVigente: FilaCatalogo[], leido: FilaCatalogo[], tablasLeidas: string[], filtrosLeidos?: Record<string, string[]>): DiffCatalogo;
/**
 * Hash estable de una tabla (FNV-1a sobre las filas ordenadas, espacios normalizados). Sirve para
 * saber si una lectura cambió algo sin comparar fila por fila, y para registrar qué se leyó.
 */
export declare function hashTabla(filas: Array<{
    filtroPadre?: string;
    codigo: string;
    descripcion: string;
}>): string;
/**
 * Regenera el CSV del repo con su formato exacto: BOM, encabezado sin comillas, campos entre comillas
 * salvo el largo, CRLF entre filas y sin salto final. Las filas van en el orden que traen.
 *
 * Así actualizar el CSV desde el espejo es un commit revisable (un diff de líneas), no una edición a mano.
 */
export declare function exportarCsvArca(filas: FilaCsvArca[]): string;
