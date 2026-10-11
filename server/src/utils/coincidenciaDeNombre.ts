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
export const nombreBase = (n: string): string =>
  String(n || "")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/_ID-\d{6,}$/, "")
    .trim();

/** De varios que coinciden, el de nombre más largo: el más específico. */
export const elMasLargo = <T extends ArchivoConNombre>(xs: T[]): T[] => (xs.length === 0 ? [] : [xs.reduce((a, b) => (nombreBase(b.name).length > nombreBase(a.name).length ? b : a))]);

/**
 * TODOS los archivos cuyo nombre es el comienzo del título (los del texto tal cual; si no hay
 * ninguno, los del normalizado). Quien llama decide qué hacer si hay más de uno.
 */
export function candidatosPorNombre<T extends ArchivoConNombre>(archivos: T[], titulo: string): T[] {
  const t = String(titulo || "").trim();
  const tal = archivos.filter((e) => {
    const base = nombreBase(e.name);
    return base.length > 0 && t.startsWith(base) && (t.length === base.length || !/[A-Za-z0-9]/.test(t[base.length]));
  });
  if (tal.length > 0) return tal;

  // Los símbolos se vuelven UN separador genérico, pero el separador queda: sin él, un nombre
  // cortado («…Empresa-3071706837») pasaba por el principio de otro («…Empresa-30717068374»).
  const separadores = (v: string) => nombreBase(v).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const objetivo = separadores(t);
  return archivos.filter((e) => {
    const n = separadores(e.name);
    return n.length >= 20 && objetivo.startsWith(n) && (objetivo.length === n.length || objetivo[n.length] === "-");
  });
}
