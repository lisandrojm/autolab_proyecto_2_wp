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
/** Largo exacto de un registro pegado en «Altas Masivas». */
export const LARGO_85 = 85;
/** Largo exacto de un registro del archivo de «Carga Masiva». */
export const LARGO_130 = 130;
/**
 * Tope de registros del pegado. Lo dice la pantalla: «Ingrese el texto correspondiente a los
 * registros (maximo 9 registros)». La grilla de Altas.aspx corta en 10, pero el pegado en 9.
 *
 * Es el tope de UNA TANDA, no de la selección: una selección más grande se presenta en tandas
 * sucesivas (`partirEnTandas`). La corrida lee además el tope en la pantalla y usa el menor.
 */
export const MAX_ALTAS_MASIVAS = 9;
/** Parte la selección en tandas de a lo sumo `tope`, en el mismo orden y sin perder a nadie. */
export function partirEnTandas(items, tope = MAX_ALTAS_MASIVAS) {
    if (!Number.isInteger(tope) || tope < 1)
        throw new Error("El tope de una tanda tiene que ser un entero mayor que cero.");
    const tandas = [];
    for (let i = 0; i < items.length; i += tope)
        tandas.push(items.slice(i, i + tope));
    return tandas;
}
export const LAYOUT_85 = [
    { desde: 1, hasta: 11, nombre: "CUIL", clave: "cuil", relleno: "ceros" },
    { desde: 12, hasta: 17, nombre: "Codigo de Obra Social", clave: "rnos", relleno: "ceros" },
    { desde: 18, hasta: 22, nombre: "Codigo de Sucursal", clave: "sucursal", relleno: "ceros" },
    { desde: 23, hasta: 28, nombre: "Codigo de Actividad", clave: "actividad", relleno: "ceros" },
    { desde: 29, hasta: 32, nombre: "Codigo de Puesto Desempeñado", clave: "puesto", relleno: "ceros" },
    { desde: 33, hasta: 35, nombre: "Codigo de Modalidad de Contratacion", clave: "modalidadContrato", relleno: "ceros" },
    { desde: 36, hasta: 36, nombre: "Codigo de Modalidad de Liquidacion", clave: "modalidadLiq", relleno: "ceros" },
    { desde: 37, hasta: 44, nombre: "Remuneracion, parte entera", clave: "retribucionEntera", relleno: "ceros" },
    { desde: 45, hasta: 46, nombre: "Remuneracion, parte decimal", clave: "retribucionDecimal", relleno: "ceros" },
    { desde: 47, hasta: 47, nombre: "Marca de trabajador agropecuario", clave: "agropecuario", relleno: "fijo" },
    { desde: 48, hasta: 55, nombre: "Fecha de inicio de la relacion laboral", clave: "fechaInicio", relleno: "fijo" },
    { desde: 56, hasta: 63, nombre: "Fecha de fin de la relacion laboral", clave: "fechaFin", relleno: "fijo" },
    { desde: 64, hasta: 73, nombre: "Codigo de Convenio Colectivo", clave: "convenio", relleno: "espacios-derecha" },
    { desde: 74, hasta: 79, nombre: "Codigo de Categoria", clave: "categoriaProf", relleno: "ceros" },
    { desde: 80, hasta: 82, nombre: "Codigo de Tipo de Servicio", clave: "tipoServicio", relleno: "ceros" },
    { desde: 83, hasta: 83, nombre: "Marca Lic. COVID / Tipo de contrato CCG", clave: "ccg", relleno: "fijo" },
    { desde: 84, hasta: 85, nombre: "Codigo de Situacion de Revista", clave: "situacionRevista", relleno: "ceros" },
];
/**
 * Las posiciones del registro de 130 que el servidor necesita para cotejar. NO es el generador
 * (ese es `describirRegistro` en `afipTxt.ts`, que además decide qué va en blanco): son solo las
 * coordenadas de los datos. Un test del frontend comprueba que coincidan con las del generador.
 */
export const POSICIONES_130 = {
    tipoRegistro: { desde: 1, hasta: 2 },
    movimiento: { desde: 3, hasta: 4 },
    cuil: { desde: 5, hasta: 15 },
    agropecuario: { desde: 16, hasta: 16 },
    modalidadContrato: { desde: 17, hasta: 19 },
    fechaInicio: { desde: 20, hasta: 29 },
    fechaFin: { desde: 30, hasta: 39 },
    rnos: { desde: 40, hasta: 45 },
    retribucion: { desde: 58, hasta: 72 },
    modalidadLiq: { desde: 73, hasta: 73 },
    sucursal: { desde: 74, hasta: 78 },
    actividad: { desde: 79, hasta: 84 },
    categoriaProf: { desde: 101, hasta: 106 },
    tipoServicio: { desde: 107, hasta: 109 },
};
/**
 * Caracteres que pueden aparecer en un registro de cualquiera de los dos formatos: dígitos, letras
 * mayúsculas (AT, N), la barra de las fechas y del convenio, y espacios de relleno. Cualquier otro
 * —un acento, un CR, un tab— corre el registro o es texto que no salió del generador.
 */
export const CHARSET_REGISTRO = /^[0-9A-Z /]*$/;
/**
 * Cómo viaja la retribución en el registro de 130 (pos. 58-72): centavos implícitos (importe × 100).
 * Vive acá y no solo en `afipTxt.ts` porque el servidor la necesita para cotejar el importe: si el
 * generador y el cotejo leyeran dos constantes distintas, el servidor aprobaría un sueldo × 100.
 * Ver el PENDIENTE de `afipTxt.ts`.
 */
export const RETRIBUCION_130_EN_CENTAVOS = true;
/** Toma un tramo por posiciones 1-based, como las nombra ARCA. */
export const tramoRegistro = (linea, desde, hasta) => linea.slice(desde - 1, hasta);
/** Parte un registro de 85 en sus campos. No valida: devuelve lo que hay en cada posición. */
export function partirRegistro85(linea) {
    const out = {};
    for (const c of LAYOUT_85)
        out[c.clave] = tramoRegistro(linea, c.desde, c.hasta);
    return out;
}
/** Parte un registro de 130 en los campos que se cotejan. */
export function partirRegistro130(linea) {
    const out = {};
    for (const [clave, p] of Object.entries(POSICIONES_130))
        out[clave] = tramoRegistro(linea, p.desde, p.hasta);
    return out;
}
/** Une los registros como los pide ARCA: LF entre cada uno y uno al final, sin CR. */
export const unirRegistros = (registros) => (registros.length === 0 ? "" : `${registros.join("\n")}\n`);
/**
 * Fecha del formato de 85: `ddmmyyyy`. Acepta "YYYY-MM-DD", "YYYY/MM/DD" o "DD/MM/YYYY".
 * Devuelve "" si no reconoce el formato (y entonces el campo FALTA, no se inventa).
 */
export const fecha85 = (s) => {
    if (!s)
        return "";
    let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
    if (m)
        return `${m[3]}${m[2]}${m[1]}`;
    m = /^(\d{2})[-/](\d{2})[-/](\d{4})/.exec(s);
    if (m)
        return `${m[1]}${m[2]}${m[3]}`;
    return "";
};
/**
 * La remuneración del formato de 85, partida en entera (8) y decimal (2). El importe llega en PESOS
 * con decimales (el sueldo bruto de la escala). Se redondea a centavos ANTES de partir, para que
 * 785955.275 no quede en 785955 + 28 por dos redondeos distintos.
 *
 * Devuelve null si no entra en 8 dígitos enteros o no es positivo.
 */
export const remuneracion85 = (pesos) => {
    if (!Number.isFinite(pesos) || pesos <= 0)
        return null;
    const centavos = Math.round(pesos * 100);
    const entera = Math.floor(centavos / 100);
    if (entera > 99_999_999)
        return null;
    return { entera: String(entera).padStart(8, "0"), decimal: String(centavos % 100).padStart(2, "0") };
};
