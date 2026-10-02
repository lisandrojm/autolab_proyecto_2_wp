/**
 * ═══════════════════════════════════════════════════════════════════════
 * CÓDIGO COMPARTIDO SERVER ↔ FRONTEND (`server/src/compartido/`)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Solo código puro: nada de Node, Mongoose ni del DOM, y sin imports (ver `jornadas.ts`).
 *
 * ═══════════════════════════════════════════════════════════════════════
 * LAS POSICIONES DE LOS DOS REGISTROS DE ALTA DE ARCA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Hay DOS formatos y no son uno recortado del otro:
 *
 *   130  Relaciones Laborales → Carga Masiva. Se sube como archivo. Lo arma `afipTxt.ts`.
 *    85  Relaciones Laborales → Registrar Nuevas Altas → Altas Masivas. Se PEGA en un textarea,
 *        máximo 9 registros. Lo arma `afipTxt85.ts`. Informa puesto, convenio y marca CCG, que en
 *        el de 130 un alta deja en blanco.
 *
 * Las posiciones viven ACÁ porque las leen dos lados que tienen que coincidir: el frontend, que arma
 * el registro, y el servidor, que lo PARTE para cotejar cada campo contra la base antes de mandarlo
 * a ARCA (el cliente arma, el servidor no confía). Si cada lado tuviera su tabla, el servidor podría
 * aprobar un registro corrido una posición.
 *
 * El formato de 85 está copiado de la tabla «FORMATO DE REGISTRO DEL TEXTO INGRESADO» que publica la
 * propia pantalla de ARCA (relevada el 2/10/2026, sesión de 2030 S.R.L.).
 */
/** Cómo se completa un campo hasta su ancho. */
export type RellenoCampo = "ceros" | "espacios-derecha" | "fijo";
export interface CampoLayout {
    desde: number;
    hasta: number;
    /** Nombre tal como lo publica ARCA. */
    nombre: string;
    /** Clave estable para el código (validación, vista previa). */
    clave: string;
    relleno: RellenoCampo;
}
/** Largo exacto de un registro pegado en «Altas Masivas». */
export declare const LARGO_85 = 85;
/** Largo exacto de un registro del archivo de «Carga Masiva». */
export declare const LARGO_130 = 130;
/**
 * Tope de registros del pegado. Lo dice la pantalla: «Ingrese el texto correspondiente a los
 * registros (maximo 9 registros)». La grilla de Altas.aspx corta en 10, pero el pegado en 9.
 */
export declare const MAX_ALTAS_MASIVAS = 9;
export declare const LAYOUT_85: CampoLayout[];
/**
 * Las posiciones del registro de 130 que el servidor necesita para cotejar. NO es el generador
 * (ese es `describirRegistro` en `afipTxt.ts`, que además decide qué va en blanco): son solo las
 * coordenadas de los datos. Un test del frontend comprueba que coincidan con las del generador.
 */
export declare const POSICIONES_130: Record<string, {
    desde: number;
    hasta: number;
}>;
/**
 * Caracteres que pueden aparecer en un registro de cualquiera de los dos formatos: dígitos, letras
 * mayúsculas (AT, N), la barra de las fechas y del convenio, y espacios de relleno. Cualquier otro
 * —un acento, un CR, un tab— corre el registro o es texto que no salió del generador.
 */
export declare const CHARSET_REGISTRO: RegExp;
/**
 * Cómo viaja la retribución en el registro de 130 (pos. 58-72): centavos implícitos (importe × 100).
 * Vive acá y no solo en `afipTxt.ts` porque el servidor la necesita para cotejar el importe: si el
 * generador y el cotejo leyeran dos constantes distintas, el servidor aprobaría un sueldo × 100.
 * Ver el PENDIENTE de `afipTxt.ts`.
 */
export declare const RETRIBUCION_130_EN_CENTAVOS = true;
/** Toma un tramo por posiciones 1-based, como las nombra ARCA. */
export declare const tramoRegistro: (linea: string, desde: number, hasta: number) => string;
/** Parte un registro de 85 en sus campos. No valida: devuelve lo que hay en cada posición. */
export declare function partirRegistro85(linea: string): Record<string, string>;
/** Parte un registro de 130 en los campos que se cotejan. */
export declare function partirRegistro130(linea: string): Record<string, string>;
/** Une los registros como los pide ARCA: LF entre cada uno y uno al final, sin CR. */
export declare const unirRegistros: (registros: string[]) => string;
/**
 * Fecha del formato de 85: `ddmmyyyy`. Acepta "YYYY-MM-DD", "YYYY/MM/DD" o "DD/MM/YYYY".
 * Devuelve "" si no reconoce el formato (y entonces el campo FALTA, no se inventa).
 */
export declare const fecha85: (s: string) => string;
/**
 * La remuneración del formato de 85, partida en entera (8) y decimal (2). El importe llega en PESOS
 * con decimales (el sueldo bruto de la escala). Se redondea a centavos ANTES de partir, para que
 * 785955.275 no quede en 785955 + 28 por dos redondeos distintos.
 *
 * Devuelve null si no entra en 8 dígitos enteros o no es positivo.
 */
export declare const remuneracion85: (pesos: number) => {
    entera: string;
    decimal: string;
} | null;
