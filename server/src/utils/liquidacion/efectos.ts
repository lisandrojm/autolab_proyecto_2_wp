import type { IMemosoftEffect } from "../../models/RequestConfig.js";
import type { Regimen } from "./contratos.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ EFECTOS RIGEN UN DÍA DADO, Y SI ESTÁN BIEN CONFIGURADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dos funciones puras, sin Mongo, por lo mismo que las de `contratos.ts`: son las que deciden qué
 * termina en el recibo de alguien.
 *
 * LA VIGENCIA SE EVALÚA CONTRA EL DÍA DE LA NOVEDAD, NO CONTRA HOY. Si en octubre RRHH cambia a qué
 * concepto va "Enfermedad", volver a liquidar septiembre tiene que seguir usando el mapeo de
 * septiembre. Liquidar con las reglas de hoy un mes que ya se pagó da diferencias que nadie puede
 * explicar tres meses después.
 */

/** Lo que el catálogo dice de un concepto. El subconjunto que hace falta para validar. */
export interface ConceptoConocido {
  codigo: string;
  descripcion: string;
  usaPar1: boolean;
  usaPar2: boolean;
  unidadPar1?: string | null;
  unidadPar2?: string | null;
  activo?: boolean;
}

export interface ContextoDeEfecto {
  /** La empresa del contrato de la persona. */
  empresaId?: string | null;
  regimen?: Regimen | null;
  aplicaA?: "titular" | "reemplazante";
}

/**
 * LOS EFECTOS QUE RIGEN ESE DÍA PARA ESA PERSONA.
 *
 * Los efectos son ADITIVOS: todos los que matchean se aplican. No hay override por especificidad
 * —"el de la empresa le gana al general"—, porque esa regla es invisible en la pantalla y hace que
 * agregar una línea haga desaparecer otra sin que se vea. Si algo no tiene que aplicar a una
 * empresa, se acota esa empresa; no se lo tapa con otro efecto.
 */
export function efectosVigentesEn(efectos: IMemosoftEffect[], fecha: string, contexto: ContextoDeEfecto = {}): IMemosoftEffect[] {
  const dia = String(fecha).slice(0, 10);

  return (efectos || []).filter((e) => {
    if (!e.vigenteDesde || e.vigenteDesde > dia) return false;
    if (e.vigenteHasta && e.vigenteHasta < dia) return false;

    // Vacío = todas las empresas. Con empresa, sólo esa.
    if (e.empresaId && contexto.empresaId && String(e.empresaId) !== String(contexto.empresaId)) return false;
    /*
      Un efecto acotado a una empresa NO se aplica cuando no se sabe de qué empresa es el contrato.
      Aplicarlo "por las dudas" es lo que pone un concepto de 2030 en el recibo de alguien de FZERO.
    */
    if (e.empresaId && !contexto.empresaId) return false;

    if (e.soloRegimen && contexto.regimen && e.soloRegimen !== contexto.regimen) return false;
    if (e.soloRegimen && !contexto.regimen) return false;

    if (contexto.aplicaA && e.aplicaA !== contexto.aplicaA) return false;
    return true;
  });
}

/** Las fuentes cuyo número sale de contar algo del parte, y por lo tanto nunca son pesos. */
const FUENTES_QUE_CUENTAN = new Set(["jornadas", "horas_jornada", "horas50", "horas100"]);

/**
 * Por debajo de esto, un "importe" es sospechoso.
 *
 * Está calibrado con lo que se vio: los adelantos reales de agosto van de 100.000 a 430.000, y los
 * valores que resultaron ser días eran 1, 7 y 14. Mil deja muchísimo margen para los dos lados.
 */
const UMBRAL_DE_IMPORTE = 1000;

/**
 * SI EL EFECTO SE PUEDE EMITIR CONTRA EL CATÁLOGO.
 *
 * Devuelve el problema en castellano, o `null` si está bien. Chequea tres cosas, y las tres
 * existen porque las tres pasan:
 *
 *   1. Que el concepto exista. Un código inventado hace que Memosoft rechace el archivo entero.
 *   2. Que el parámetro elegido sea uno que el concepto USA. Poner el número en la columna que el
 *      concepto ignora no da error: entra como cero y la persona cobra de menos.
 *   3. Que la unidad coincida. Un 0012 con 3 en la columna de importe son tres PESOS de licencia
 *      por enfermedad en vez de tres DÍAS, y eso no lo detecta nadie mirando el archivo.
 */
export function validarEfecto(efecto: IMemosoftEffect, concepto: ConceptoConocido | undefined): string | null {
  if (!concepto) return `El concepto ${efecto.conceptoCodigo} no está en el catálogo de esa empresa.`;
  if (concepto.activo === false) return `El concepto ${efecto.conceptoCodigo} (${concepto.descripcion}) está desactivado.`;

  const usa = efecto.param === "par1" ? concepto.usaPar1 : concepto.usaPar2;
  if (!usa) {
    const cual = efecto.param === "par1" ? "par2" : "par1";
    const otroUsa = efecto.param === "par1" ? concepto.usaPar2 : concepto.usaPar1;
    return otroUsa
      ? `${efecto.conceptoCodigo} (${concepto.descripcion}) no usa ${efecto.param}; usa ${cual}.`
      : `${efecto.conceptoCodigo} (${concepto.descripcion}) no usa ningún parámetro.`;
  }

  const unidadEsperada = efecto.param === "par1" ? concepto.unidadPar1 : concepto.unidadPar2;
  if (unidadEsperada && unidadEsperada !== efecto.unidad) {
    return `${efecto.conceptoCodigo} (${concepto.descripcion}) espera ${unidadEsperada} en ${efecto.param}, no ${efecto.unidad}.`;
  }

  if (efecto.fuente === "fijo" && (efecto.valorFijo == null || Number.isNaN(Number(efecto.valorFijo)))) {
    return `El efecto de ${efecto.conceptoCodigo} es de valor fijo pero no tiene valor.`;
  }

  /*
    UN IMPORTE QUE SALE DE CONTAR DÍAS U HORAS NO ES UN IMPORTE.

    La leyenda del catálogo acierta siempre en QUÉ COLUMNA usa cada concepto, pero no siempre en la
    unidad: 0090 venía marcado como importe y el caso real traía un 1. Un peso de licencia no existe.
    Con 0040 Ropa pasa lo mismo y todavía no hay un caso con qué decidir.

    Por eso: si el número se calcula a partir del parte —días, horas, una jornada— no puede ser un
    importe. Y un valor fijo declarado como importe por debajo de ${UMBRAL_DE_IMPORTE} se avisa, porque
    es mucho más probable que sean días mal etiquetados que una suma de dinero de tres pesos.
  */
  if (efecto.unidad === "importe" && FUENTES_QUE_CUENTAN.has(efecto.fuente)) {
    return `${efecto.conceptoCodigo} (${concepto.descripcion}) está declarado como importe, pero "${efecto.fuente}" cuenta días u horas. Si el archivo real trae números chicos, la unidad es cantidad.`;
  }

  if (efecto.unidad === "importe" && efecto.fuente === "fijo" && Number(efecto.valorFijo) < UMBRAL_DE_IMPORTE) {
    return `${efecto.conceptoCodigo} (${concepto.descripcion}) dice importe pero el valor es ${efecto.valorFijo}. Un importe de esa magnitud es sospechoso de ser en realidad una cantidad de días.`;
  }

  if (efecto.vigenteHasta && efecto.vigenteDesde && efecto.vigenteHasta < efecto.vigenteDesde) {
    return `La vigencia de ${efecto.conceptoCodigo} termina antes de empezar.`;
  }

  return null;
}

/**
 * Cierra los efectos que regían y deja los nuevos, en vez de pisar la lista.
 *
 * Es lo que convierte "editar el mapeo" en una operación que no borra historia: lo que regía hasta
 * ayer queda con su `vigenteHasta`, y lo nuevo arranca hoy. Los que ya estaban cerrados no se tocan.
 */
export function reemplazarVigentes(actuales: IMemosoftEffect[], nuevos: IMemosoftEffect[], desde: string): IMemosoftEffect[] {
  const dia = String(desde).slice(0, 10);
  const ayer = new Date(`${dia}T00:00:00.000Z`);
  ayer.setUTCDate(ayer.getUTCDate() - 1);
  const vigenteHasta = ayer.toISOString().slice(0, 10);

  const historia = (actuales || []).map((e) => {
    const seguiaAbierto = !e.vigenteHasta;
    if (!seguiaAbierto) return e;
    /*
      Un efecto que ARRANCABA hoy o después no se cierra: se descarta. Cerrarlo con una fecha
      anterior a su propio inicio dejaría una vigencia imposible en la base.
    */
    if (e.vigenteDesde >= dia) return null;
    return { ...e, vigenteHasta };
  });

  return [...historia.filter((e): e is IMemosoftEffect => e !== null), ...nuevos.map((e) => ({ ...e, vigenteDesde: dia, vigenteHasta: null }))];
}
