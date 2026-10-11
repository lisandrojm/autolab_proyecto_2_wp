/**
 * ¿QUÉ ARCHIVO ES EL QUE NOMBRA UN TÍTULO? La regla de «el título empieza con el nombre del archivo».
 *
 * Dropbox Sign nombra las cosas con el nombre del archivo que se le importó y le agrega una cola —el
 * título de la solicitud es editable, y lo que vuelve firmado trae « Firma solicitada por …» cortado a
 * cualquier largo—. Para reconocer el archivo original hay que comparar el nombre completo (sin su
 * extensión y sin el «_ID-NNNNNN» que se le pudo agregar después), no la persona y el período: un
 * alta, su contrato y su release comparten CUIT y fechas.
 *
 * Después del nombre tiene que venir un separador, no una letra ni un número: si no, un nombre
 * corto pasa por el principio de otro más largo que lo contiene.
 *
 * Primero se compara el texto tal cual. Solo si no aparece nada, normalizado a letras y números (por
 * si Dropbox Sign cambió algún símbolo), con la misma regla.
 *
 * La usan el aviso por mail (Outbox: `documentosDelAvisoEnOutbox`) y la limpieza de Pendbox cuando
 * vuelve el firmado (`limpiezaPendbox`). Vive acá para que sea UNA regla y no dos copias.
 */
export interface ArchivoConNombre {
    name: string;
    path: string;
}
/** El nombre sin la extensión y sin el «_ID-NNNNNN» final: lo que se envió a firmar. */
export declare const nombreBase: (n: string) => string;
/** De varios que coinciden, el de nombre más largo: el más específico. */
export declare const elMasLargo: <T extends ArchivoConNombre>(xs: T[]) => T[];
/**
 * TODOS los archivos cuyo nombre es el comienzo del título (los del texto tal cual; si no hay
 * ninguno, los del normalizado). Quien llama decide qué hacer si hay más de uno.
 */
export declare function candidatosPorNombre<T extends ArchivoConNombre>(archivos: T[], titulo: string): T[];
