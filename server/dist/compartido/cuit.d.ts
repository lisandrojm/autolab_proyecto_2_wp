export declare const PREFIJOS_CUIT: string[];
/**
 * ¿El CUIT/CUIL es realmente uno? Tener 11 dígitos no alcanza: había personas cargadas con
 * `00000000000`, que pasaban como "completo" y se mandaban igual a consultar al Padrón, donde ARCA
 * devolvía error. Se valida prefijo + dígito verificador (módulo 11), que además atrapa tipeos.
 *
 * Vive acá (y no en un componente) porque lo usan tanto la UI como el chequeo de completitud y el
 * generador del TXT, que son módulos sin React.
 */
export declare const cuitEsValido: (raw?: string) => boolean;
