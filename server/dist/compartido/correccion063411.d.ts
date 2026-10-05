/**
 * La corrección de códigos del 0634/11 tal como se verificó contra la pantalla «Registrar Nuevas
 * Altas» de ARCA el 2/10/2026 (2030 S.R.L.): grupo, categoría, código que tenía, código correcto.
 *
 * Lo usan el script `corregirCodigosCategorias.ts` (el dry-run tiene que dar EXACTAMENTE esto, o se
 * detiene) y su test. Código compartido puro: sin imports.
 */
export declare const ESPERADO_0634_11: Array<[number, string, string, string]>;
