/**
 * DE DÓNDE SALE CADA VALOR DE ARCA: contrato → empresa → instalación.
 *
 * Los tres escalones existían de a pedazos y cada campo resolvía el suyo a mano, con el resultado de
 * que no todos hacían lo mismo:
 *
 *   · `tipoServicio` miraba el tipo de contrato y después la empresa.
 *   · `sucursalId` miraba el contrato y después la empresa.
 *   · `modalidadLiquidacion` miraba SOLO el tipo de contrato: el default de la empresa se guardaba
 *     en la ficha y no lo leía nadie. Era un campo que la pantalla dejaba cargar y que no hacía nada.
 *   · `modalidadContratacion` no tenía default de ningún tipo.
 *
 * Acá se resuelve una sola vez, y el orden es siempre el mismo.
 *
 * POR QUÉ ESE ORDEN. El contrato gana porque es el hecho concreto —esta persona, este vínculo—; la
 * empresa gana sobre lo global porque un CUIT puede declarar distinto que el resto; y lo global es
 * el piso, para no repetir en cada empleadora lo que en la práctica es igual para todas.
 *
 * EL VACÍO NO ES UN VALOR. Un escalón que no tiene nada cargado no "decide vacío": pasa al
 * siguiente. Sin eso, una empresa sin default taparía el global y el escalón de abajo no serviría
 * nunca.
 *
 * Devuelve también DE DÓNDE salió, porque la pantalla lo muestra: un campo que aparece completo sin
 * que nadie lo haya tipeado necesita decir por qué, o se lee como un dato confirmado cuando es una
 * herencia.
 */

export type OrigenValorArca = "contrato" | "tipo_contrato" | "empresa" | "global" | "ninguno";

export interface ValorConOrigen {
  valor: string;
  origen: OrigenValorArca;
}

/** Un valor "cargado" es el que tiene contenido: `""`, `null` y `undefined` son ausencia. */
const hayValor = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== "";

/**
 * El primer escalón que tenga algo, con su nombre.
 *
 * Los escalones se pasan en orden de prioridad. Se recorre en ese orden y se corta en el primero con
 * contenido; si ninguno tiene, el resultado es vacío con origen `ninguno` — que NO es lo mismo que
 * un valor vacío elegido a propósito, y por eso se distingue.
 */
export const resolverCascada = (escalones: Array<{ valor: unknown; origen: OrigenValorArca }>): ValorConOrigen => {
  for (const e of escalones) {
    if (hayValor(e.valor)) return { valor: String(e.valor).trim(), origen: e.origen };
  }
  return { valor: "", origen: "ninguno" };
};

/** Los defaults de una empleadora y los de la instalación, con la forma en que llegan del server. */
export interface DefaultsArca {
  grupoTipoServicio?: string;
  tipoServicio?: string;
  modalidadContratacion?: string;
  modalidadLiquidacion?: string;
  sucursalId?: string | null;
  convenioId?: string | null;
  /*
    Los cuatro de abajo son PRESELECCIÓN: ordenan los selectores, no deciden lo que se declara.

    Entran en esta interfaz —y no en una aparte— porque la cascada es la misma: lo de la empleadora
    pisa lo de la instalación, y un escalón vacío no decide, pasa al siguiente. Lo que cambia es
    quién los lee: `resolveAfipValues` resuelve con ellos lo que va al TXT, y a estos no los toca.
  */
  obraSocial?: string;
  actividad?: string;
  categoria?: string;
  fuenteParitariaId?: string | null;
}

/**
 * La cascada de dos escalones de default (empresa → instalación), para un campo.
 *
 * Es el caso que se repite en todos los campos: lo del contrato ya se resolvió antes y lo que queda
 * es "qué se hereda". Se expone aparte para que los llamadores no tengan que armar el array.
 */
export const defaultDe = (campo: keyof DefaultsArca, empresa: DefaultsArca | null | undefined, global: DefaultsArca | null | undefined): ValorConOrigen =>
  resolverCascada([
    { valor: empresa?.[campo], origen: "empresa" },
    { valor: global?.[campo], origen: "global" },
  ]);

/**
 * La cascada completa: primero lo que trae el contrato (o su tipo), después los defaults.
 *
 * `valorDelContrato` es lo que ya está decidido para esta fila. `origenDelContrato` distingue si lo
 * puso el alta ("contrato") o si vino del tipo de contrato elegido ("tipo_contrato"), que es una
 * distinción que la pantalla ya venía mostrando para el tipo de servicio.
 */
export const conCascada = (valorDelContrato: unknown, origenDelContrato: OrigenValorArca, campo: keyof DefaultsArca, empresa: DefaultsArca | null | undefined, global: DefaultsArca | null | undefined): ValorConOrigen =>
  resolverCascada([
    { valor: valorDelContrato, origen: origenDelContrato },
    { valor: empresa?.[campo], origen: "empresa" },
    { valor: global?.[campo], origen: "global" },
  ]);

/** Cómo se le explica al usuario de dónde salió un valor que él no cargó. */
export const ETIQUETA_ORIGEN: Record<OrigenValorArca, string> = {
  contrato: "cargado en el contrato",
  tipo_contrato: "del tipo de contrato",
  empresa: "por defecto de la empleadora",
  global: "por defecto de la instalación",
  ninguno: "sin definir",
};
