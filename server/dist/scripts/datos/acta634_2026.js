/**
 * LOS DATOS DEL ACTA, EN UN SOLO LUGAR.
 *
 * Acuerdo salarial ATA – CAPIT – SATTSAID, paritaria 2025-2026, 2.º tramo (febrero–junio 2026), expediente
 * RE-2026-43103223-APN-DTD#JGM, firmado el 28/04/2026, Anexo A.
 *
 * Está separado de los scripts que lo cargan para que se pueda leer y auditar sin leer código de carga: acá
 * está lo que dice el papel, ahí está lo que se hace con eso.
 *
 * LO QUE EL ACTA NO DICE, ACÁ NO ESTÁ. El tipo de cálculo y el carácter remunerativo de cada adicional no
 * figuran en el acuerdo: van con `confirmado: false` y `remunerativo: null`, y la sugerencia de tipo queda
 * anotada como sugerencia. Los importes de la escala por grupo tampoco están escritos acá — se leen de la
 * base, que ya los tiene cargados y verificados (ver `seed634Tramos.ts`).
 */
export const EXPEDIENTE = "RE-2026-43103223-APN-DTD#JGM";
export const CONVENIOS = ["0634/11", "0131/75"];
export const MARCA_ACUERDO = "634-acuerdo-v1";
export const MARCA_TRAMOS = "634-tramos-v1";
export const MARCA_ADICIONALES = "634-adicionales-v1";
export const MARCA_PEQUENAS = "634-pequenas-v1";
/** Los tramos, con el régimen alternativo del art. 3.2 incluido. */
export const TRAMOS = [
    { codigo: "2026-04", desde: "2026-04-01", porcentaje: 9.5, base: "marzo 2026", baseDesde: "2026-03-01", acumulativo: true, regimen: "general", nota: "Primer tramo del 2.º tramo paritario." },
    { codigo: "2026-06", desde: "2026-06-01", porcentaje: 4.8, base: "mayo 2026", baseDesde: "2026-05-01", acumulativo: true, regimen: "general", nota: "Acumulativo sobre el anterior: 1,095 × 1,048 = 14,756 %." },
    { codigo: "2026-04-alt", desde: "2026-04-01", porcentaje: 7, base: "marzo 2026", baseDesde: "2026-03-01", acumulativo: false, regimen: "alternativo", nota: "Art. 3.2: pequeñas productoras que así lo convengan y canales del interior." },
    { codigo: "2026-05-alt", desde: "2026-05-01", porcentaje: 9.5, base: "marzo 2026", baseDesde: "2026-03-01", acumulativo: false, regimen: "alternativo", absorbe: "2026-04-alt", nota: "Se calcula sobre marzo y absorbe el 7 % de abril." },
    { codigo: "2026-06-alt", desde: "2026-06-01", porcentaje: 4.8, base: "mayo 2026", baseDesde: "2026-05-01", acumulativo: true, regimen: "alternativo", nota: "Igual que el general." },
];
/** El período paritario completo, que es más largo que este tramo. */
export const PERIODO_PARITARIO = { desde: "2025-10-01", hasta: "2026-09-30" };
/**
 * El factor del 2.º tramo: +4,8 %.
 *
 * Es el que relaciona abril con junio, y está verificado: 1.132.832,62 (grupo 1, abril, Anexo A) × 1,048 =
 * 1.187.208,59, que es el básico de junio tal como está cargado en la base. Por eso `seed634Tramos` puede
 * derivar abril desde junio mientras no llegue la tabla completa del Anexo A.
 */
export const FACTOR_JUNIO = 1.048;
/** Grupo 1 de abril, el único que el acta dejó escrito en el pedido. Se usa para VERIFICAR la derivación. */
export const CONTROL_ABRIL_G1 = { grupo: 1, basico: 1132832.62, adicionalPct: 62.5, adicionalMonto: 708020.39, presentismoMonto: 184085.3, total: 2024938.31 };
/**
 * Los siete adicionales, con los dos importes que publica el acta.
 *
 * Los dos juegos van literales y no derivados: `abril × 1,048` da un centavo de diferencia en seis de los
 * siete (sólo Exteriores coincide), así que el acta no se reproduce con el porcentaje. Ver
 * `utils/aplicarParitaria.test.ts`, que fija exactamente eso.
 */
export const ADICIONALES = [
    { codigo: "antiguedad", nombre: "Antigüedad", tipoSugerido: "por_anio_antiguedad", unidad: "por año", abril: 10086.75, junio: 10570.92 },
    { codigo: "comidas", nombre: "Comidas", tipoSugerido: "por_evento", unidad: "por comida", abril: 7477.24, junio: 7836.14 },
    { codigo: "meriendas", nombre: "Meriendas", tipoSugerido: "por_evento", unidad: "por merienda", abril: 2468.21, junio: 2586.69 },
    { codigo: "exteriores", nombre: "Exteriores", tipoSugerido: "por_evento", unidad: "por día de exteriores", abril: 9312.84, junio: 9759.86 },
    { codigo: "subida_torre", nombre: "Subida a Torre", tipoSugerido: "por_evento", unidad: "por subida", abril: 2468.21, junio: 2586.69 },
    { codigo: "guarderia", nombre: "Guardería", tipoSugerido: "mensual", unidad: "por mes", abril: 106666.75, junio: 111786.76, nota: "A confirmar a quién aplica: el acta lo dice en prosa." },
    { codigo: "ropa", nombre: "Ropa", tipoSugerido: "monto_fijo", unidad: "", abril: 213333.87, junio: 223573.89, nota: "A confirmar la periodicidad." },
];
/** Las vigencias de los dos tramos que se cargan. `hasta` es INCLUSIVE. */
export const VIGENCIA_ABRIL = { desde: "2026-04-01", hasta: "2026-05-31" };
export const VIGENCIA_JUNIO = { desde: "2026-06-01", hasta: "2026-06-30" };
