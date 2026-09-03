/**
 * Reglas de Nacionalidad → Tipo de documento / CUIL, compartidas por los dos formularios de alta de
 * personas (el modal "Nuevo Usuario" del admin y la página pública de Registro), para que ninguno de
 * los dos se desincronice del otro.
 *
 * La nacionalidad se pregunta PRIMERO porque de ella dependen los demás campos:
 *
 * - Argentino/a → el pasaporte NO es una opción de tipo de documento.
 * - Otra nacionalidad → el pasaporte SÍ es una opción (además de DNI/CI/LE/LC, porque puede estar
 *   nacionalizado).
 *
 * EL CUIL TIENE TRES CASOS, no dos (ver `esCuilObligatorio` más abajo):
 *
 * - Argentino/a NATIVO/a → CUIL obligatorio, sin vuelta: es automático desde el DNI.
 * - Argentino/a NACIONALIZADO/a → puede tenerlo o no, según en qué etapa del trámite esté. Además se
 *   le pide el país de nacimiento: a diferencia de un nativo/a, no nació acá.
 * - Otra nacionalidad → lo normal es que no tenga CUIL argentino, aunque puede declarar que sí
 *   (switch "Tiene CUIT/CUIL argentino", el mismo que usa el nacionalizado/a).
 *
 * Los tres se eligen en el MISMO desplegable de nacionalidad (ver `opcionesDeNacionalidad`): para
 * quien completa el formulario es una sola pregunta, y partirla en un select más un switch aparte
 * obligaba a leer los dos controles para entender cualquiera de los dos.
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
 * ¿El CUIT/CUIL es obligatorio, SIN el switch de "no lo tengo"?
 *
 * Es el único caso de los tres: argentino/a nativo/a. Un nacionalizado/a comparte el switch con un
 * extranjero, aunque su nacionalidad figure como Argentina — por eso esto no alcanza con mirar
 * `esArgentino` solo, hace falta la declaración aparte de si está o no nacionalizado/a.
 */
export function esCuilObligatorio(esArgentino: boolean, nacionalizado: boolean): boolean {
  return esArgentino && !nacionalizado;
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

/**
 * La opción "Argentina" del catálogo, para preseleccionarla.
 *
 * Se ofrece como default porque es la nacionalidad de casi todas las altas: arrancar en "Seleccionar…"
 * obligaba a elegirla a mano cada vez y, hasta que se elegía, los campos que dependen de ella
 * —documento y CUIL— no se podían completar. Sigue siendo un default, no una imposición: cambiarla
 * reajusta los tipos de documento y habilita el switch de "no tiene CUIL".
 */
export function opcionArgentina<T extends { name?: string }>(opciones: T[]): T | undefined {
  return opciones.find((o) => esOpcionArgentina(o));
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
   "Argentino/a nacionalizado/a" como una opción más del desplegable

   El catálogo de nacionalidades viene de FRAME y no tiene esa entrada —ni debería: la nacionalidad
   de un nacionalizado/a ES Argentina—. Así que la opción se agrega solo en pantalla, y al elegirla
   se guarda la Argentina real del catálogo más el booleano `nacionalizado`. El modelo de datos no
   se entera de que existe: no hay ids inventados dando vueltas en la base.
   ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** El value de esa opción. Es texto, así que no puede chocar con ningún id numérico del catálogo. */
export const VALOR_NACIONALIZADO = "nacionalizado";

/** Su nombre visible, en un solo lugar para que los dos formularios digan exactamente lo mismo. */
export const NOMBRE_NACIONALIZADO = "Argentino/a nacionalizado/a";

/**
 * Las opciones a dibujar en el desplegable: las del catálogo más la sintética, insertada JUSTO
 * DEBAJO de Argentina —es una variante de esa misma nacionalidad, no una nacionalidad más, y al
 * final de una lista de 200 países nadie la encontraría— y una sola vez, aunque el catálogo trajera
 * más de una entrada que matchee.
 */
export function opcionesDeNacionalidad<T extends OpcionCatalogo>(opciones: T[]): OpcionCatalogo[] {
  const salida: OpcionCatalogo[] = [];
  let yaInsertada = false;
  for (const o of opciones) {
    salida.push({ id: o.id, name: o.name });
    if (!yaInsertada && esOpcionArgentina(o)) {
      salida.push({ id: VALOR_NACIONALIZADO, name: NOMBRE_NACIONALIZADO });
      yaInsertada = true;
    }
  }
  return salida;
}

/** Qué opción mostrar elegida, a partir de un estado guardado que no conoce el value sintético. */
export function valorDeNacionalidad(nacionalidadId: number | string | undefined | null, nacionalizado: boolean): string {
  if (nacionalizado) return VALOR_NACIONALIZADO;
  return nacionalidadId === undefined || nacionalidadId === null ? "" : String(nacionalidadId);
}

/**
 * Lo inverso: qué par (nacionalidadId, nacionalizado) representa la opción elegida.
 *
 * Si el catálogo no trajera Argentina —no debería pasar, pero es data de FRAME— el id queda vacío y
 * el campo sigue contando como incompleto. Es preferible a guardar un id inventado.
 */
export function leerNacionalidadElegida<T extends OpcionCatalogo>(opciones: T[], value: string): { nacionalidadId: string; nacionalizado: boolean } {
  if (value !== VALOR_NACIONALIZADO) return { nacionalidadId: value, nacionalizado: false };
  const argentina = opcionArgentina(opciones);
  return { nacionalidadId: argentina === undefined ? "" : String(argentina.id), nacionalizado: true };
}
