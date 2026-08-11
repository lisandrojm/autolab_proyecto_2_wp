/**
 * Reglas de Nacionalidad → Tipo de documento / CUIL, compartidas por los dos formularios de alta de
 * personas (el modal "Nuevo Usuario" del admin y la página pública de Registro), para que ninguno de
 * los dos se desincronice del otro.
 *
 * La nacionalidad se pregunta PRIMERO porque de ella dependen los demás campos:
 *
 * - Argentino/a → el pasaporte NO es una opción de tipo de documento, y el CUIL es obligatorio.
 * - Otra nacionalidad → el pasaporte SÍ es una opción (además de DNI/CI/LE/LC, porque puede estar
 *   nacionalizado), y el CUIL es opcional: se declara aparte si tiene o no.
 *
 * Tanto "Argentina" como "Pasaporte" se detectan por NOMBRE y no por id: los catálogos vienen de
 * FRAME y los ids podrían no ser los mismos en todos los entornos.
 */

/** Opción mínima de un catálogo (Info): sirve tanto para `{_id, name, data.id}` como para `{id, name}`. */
export interface OpcionCatalogo {
  id: number | string;
  name: string;
}

/** Sin acentos y en minúsculas, para comparar nombres de catálogo sin depender de cómo se cargaron. */
const normalizar = (texto: string): string =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** ¿Esta opción del catálogo de nacionalidades es Argentina? */
export const esOpcionArgentina = (opcion: { name?: string } | undefined | null): boolean => /argentin/.test(normalizar(opcion?.name || ""));

/** ¿Esta opción del catálogo de tipo de documento es Pasaporte? */
export const esOpcionPasaporte = (opcion: { name?: string } | undefined | null): boolean => /pasaporte/.test(normalizar(opcion?.name || ""));

/**
 * ¿La nacionalidad elegida (por id) es argentina? `false` mientras no se haya elegido ninguna —
 * los campos dependientes recién se muestran cuando hay una elección, así que ese caso no se usa
 * para decidir nada.
 */
export function esNacionalidadArgentina(opciones: OpcionCatalogo[], nacionalidadId: number | string | undefined | null): boolean {
  if (nacionalidadId === undefined || nacionalidadId === null || nacionalidadId === "") return false;
  const elegida = opciones.find((o) => String(o.id) === String(nacionalidadId));
  return esOpcionArgentina(elegida);
}

/** Tipos de documento válidos para la nacionalidad elegida: sin Pasaporte si es argentino/a. */
export function tiposDocumentoParaNacionalidad<T extends { name: string }>(tipos: T[], esArgentino: boolean): T[] {
  return esArgentino ? tipos.filter((t) => !esOpcionPasaporte(t)) : tipos;
}

/**
 * ¿El tipo de documento ya elegido sigue siendo válido tras cambiar la nacionalidad? Se usa para
 * limpiarlo cuando deja de serlo (ej. tenía Pasaporte y pasa a ser argentino/a), en vez de dejar
 * seleccionado un valor que ya no está en la lista.
 */
export function tipoDocumentoSigueValido(tiposDisponibles: OpcionCatalogo[], tipoDocumentoId: number | string | undefined | null): boolean {
  if (tipoDocumentoId === undefined || tipoDocumentoId === null || tipoDocumentoId === "") return true;
  return tiposDisponibles.some((t) => String(t.id) === String(tipoDocumentoId));
}
