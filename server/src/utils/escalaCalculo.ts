/**
 * CÓMO SE ARMA UNA ESCALA SALARIAL A PARTIR DE LOS DATOS DE ORIGEN. LA REGLA VIVE ACÁ.
 *
 * El acta paritaria publica dos datos por grupo y el resto lo deriva:
 *
 *   A  básico            ← dato (en 634/11 es el básico del CCT 131/75)
 *   B  % adicional       ← dato (fijo por grupo: 62,5 / 49 / 38 / … / 16)
 *   C  adicional         = A × B
 *   D  presentismo       = (A + C) × 10 %
 *      total (bruto)     = A + C + D
 *      neto              ≈ total × 0,81   ← el factor NO figura en el acta, es "a confirmar"
 *
 * POR QUÉ LA CADENA NO SE REDONDEA EN CADA PASO
 *
 * Verificado contra los 12 grupos de junio 2026 que están cargados: el total del acta sale de la
 * cadena SIN redondear los intermedios. Sumando los importes ya redondeados, los grupos 1 y 7 dan
 * un centavo de más. Un centavo por grupo por mes, multiplicado por la plantilla, es una diferencia
 * que aparece en la conciliación y no en ninguna pantalla — así que la cuenta se hace como la hace
 * el acta, y lo que se muestra es cada monto redondeado a dos decimales.
 *
 * POR QUÉ IGUAL SE GUARDA LO QUE DICE EL ACTA
 *
 * Porque a veces el acta no cierra con su propia cuenta: en junio 2026, el grupo 8 declara un total
 * un centavo por encima de A+C+D y el grupo 12 uno por debajo. El importe que se paga es el que
 * dice el acta; la cuenta sirve para DETECTAR el desvío, no para corregirlo. `compararConActa`
 * devuelve esas diferencias para mostrarlas; nunca se pisa el dato de la fuente.
 *
 * El neto es el caso extremo: entre los datos cargados hay netos redondeados para arriba y otros
 * para abajo sobre el mismo factor 0,81. O sea que el factor es una aproximación, no la regla. Por
 * eso acá se llama `netoSugerido` y el neto real siempre viene del acta.
 */

/** Diferencia máxima que se considera redondeo y no error de carga. */
export const TOLERANCIA_CENTAVO = 0.01;

/** El 10 % del CCT 634/11. Es un default, no una constante del dominio: se puede editar por período. */
export const PRESENTISMO_PCT_POR_DEFECTO = 10;

/**
 * Factor bruto → neto. **A CONFIRMAR**: no figura en ninguna acta.
 *
 * Sale de los datos cargados (todos los grupos vigentes de 634/11 cumplen `neto = bruto × 0,81`) y
 * de un comentario en el front. Se expone como dato editable por período para que el día que se
 * confirme el desglose real de aportes, se cambie en un lugar.
 */
export const NETO_FACTOR_POR_DEFECTO = 0.81;

/** A dos decimales, medio centavo para arriba. El `+ EPSILON` evita que 0,145 caiga en 0,14 por el float. */
export const redondearCentavos = (n: number): number => Math.round(n * 100 + Number.EPSILON) / 100;

export interface EntradaEscalaGrupo {
  /** A: básico del convenio. */
  basico: number;
  /** B en porcentaje (62,5 se pasa como `62.5`). `null` = el convenio no usa % adicional. */
  adicionalPct?: number | null;
  /** Por defecto 10. */
  presentismoPct?: number | null;
  /** Por defecto 0,81. */
  netoFactor?: number | null;
}

export interface EscalaCalculada {
  basico: number;
  adicionalPct: number;
  presentismoPct: number;
  /** C, redondeado para mostrar. */
  adicionalMonto: number;
  /** D, redondeado para mostrar. */
  presentismoMonto: number;
  /** A + C + D por la cadena exacta, redondeado al final. */
  total: number;
  /** total × factor. Aproximación: el neto real lo dice el acta. */
  netoSugerido: number;
}

/**
 * La escala completa a partir de A y B.
 *
 * No toca la base ni valida nada de negocio: es una cuenta. La usan el ABM, el preview de paritaria,
 * los scripts de carga y el cálculo de liquidación de referencia — una sola cuenta para los cuatro.
 */
export function calcularEscalaGrupo(entrada: EntradaEscalaGrupo): EscalaCalculada {
  const basico = Number(entrada.basico || 0);
  const adicionalPct = Number(entrada.adicionalPct ?? 0);
  const presentismoPct = Number(entrada.presentismoPct ?? PRESENTISMO_PCT_POR_DEFECTO);
  const netoFactor = Number(entrada.netoFactor ?? NETO_FACTOR_POR_DEFECTO);

  // Sin redondear: los intermedios exactos son los que reproducen el total del acta.
  const adicionalExacto = (basico * adicionalPct) / 100;
  const presentismoExacto = ((basico + adicionalExacto) * presentismoPct) / 100;
  const totalExacto = basico + adicionalExacto + presentismoExacto;

  return {
    basico: redondearCentavos(basico),
    adicionalPct,
    presentismoPct,
    adicionalMonto: redondearCentavos(adicionalExacto),
    presentismoMonto: redondearCentavos(presentismoExacto),
    total: redondearCentavos(totalExacto),
    netoSugerido: redondearCentavos(redondearCentavos(totalExacto) * netoFactor),
  };
}

/** Los importes tal como los publica el acta, para cotejar. Todos opcionales: el acta puede traer solo algunos. */
export interface ValoresDelActa {
  adicionalMonto?: number | null;
  presentismoMonto?: number | null;
  total?: number | null;
  neto?: number | null;
}

export type CampoDeEscala = "adicionalMonto" | "presentismoMonto" | "total" | "neto";

export interface DiferenciaEscala {
  campo: CampoDeEscala;
  /** Lo que da la cuenta. */
  calculado: number;
  /** Lo que dice el acta. */
  acta: number;
  /** acta − calculado. Positivo = el acta paga más. */
  delta: number;
}

/**
 * En qué se aparta el acta de la cuenta, más allá del redondeo.
 *
 * Devuelve `[]` cuando todo cierra. Un desvío de exactamente un centavo igual se informa (la
 * tolerancia es `>`, no `>=`) porque es el caso real de los grupos 8 y 12 de junio 2026: es poco
 * plata y mucha señal — significa que alguien tipeó el número o que el acta tiene una errata, y
 * conviene que se vea antes de que se convierta en el sueldo de alguien.
 */
export function compararConActa(calculada: EscalaCalculada, acta: ValoresDelActa, tolerancia: number = TOLERANCIA_CENTAVO): DiferenciaEscala[] {
  const pares: Array<[CampoDeEscala, number, number | null | undefined]> = [
    ["adicionalMonto", calculada.adicionalMonto, acta.adicionalMonto],
    ["presentismoMonto", calculada.presentismoMonto, acta.presentismoMonto],
    ["total", calculada.total, acta.total],
    ["neto", calculada.netoSugerido, acta.neto],
  ];
  const out: DiferenciaEscala[] = [];
  for (const [campo, calculado, valorActa] of pares) {
    if (valorActa == null) continue;
    const delta = redondearCentavos(Number(valorActa) - calculado);
    if (Math.abs(delta) < tolerancia) continue;
    out.push({ campo, calculado, acta: redondearCentavos(Number(valorActa)), delta });
  }
  return out;
}

/**
 * El % adicional que se deduce de un básico y un adicional ya cargados.
 *
 * Sirve para migrar lo que ya está en la base, donde B no se guardó nunca: sólo quedaron A y C. Con
 * cuatro decimales porque es lo que hace visible el problema del grupo 8 de 634/11 — su adicional
 * vigente implica 23,5025 %, cuando el acta dice 23,5 %.
 */
export function deducirAdicionalPct(basico: number, adicionalMonto: number): number | null {
  const a = Number(basico || 0);
  const c = Number(adicionalMonto || 0);
  if (a <= 0) return null;
  return Math.round(((c / a) * 100 + Number.EPSILON) * 10000) / 10000;
}
