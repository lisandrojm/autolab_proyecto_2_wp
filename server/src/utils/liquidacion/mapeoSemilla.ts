/**
 * EL MAPEO INICIAL DE MOTIVO → CONCEPTO, tal como lo pasó RRHH.
 *
 * Está en su propio módulo y no adentro del script que lo carga porque lo usan DOS cosas: el
 * script de la fase 1 y el verificador que corre la liquidación de prueba. Duplicarlo haría que
 * el verificador validara un mapeo distinto del que se va a cargar, que es la peor forma de que
 * un test pase.
 *
 * ── Tres cosas que NO son las de la tabla original, y por qué ──
 *
 * 1. VACACIONES VA A 0601, en días. Confirmado contra agosto: Palmieri 7, Zuccarello 7, Mania 14,
 *    y en los tres el 0001 Sueldo Básico sigue en 30 días. Las vacaciones NO descuentan del básico:
 *    se informan aparte con la cantidad de días, y el código en uso es 0601.
 *
 * 2. "HORAS EXTRAS Y FERIADOS" TAMPOCO. Las horas extra se liquidan haya o no novedad, así que son
 *    una regla global. Mapear además el motivo haría que un parte emitiera el 0015 dos veces.
 *    (Ese motivo, además, quedó del seed original y nunca se usó: cero renglones en la historia.)
 *
 * 3. SIN GOCE DE SUELDO VA EN DÍAS. El catálogo decía importe en par2; el único caso de agosto
 *    trae par2 = 1, que como importe no existe. Ya no es manual: se calcula.
 *
 * 4. FERIADO SE LIQUIDA EN HORAS, no en días, y al reemplazante MENSUAL le corresponde 0017 —no el
 *    jornal—. La separación en agosto es total: de 177 mensualizados ninguno tiene 0000, y de 69
 *    jornaleros ninguno tiene 0017 ni 0001.
 */
export type EfectoSemilla = {
  conceptoCodigo: string;
  param: "par1" | "par2";
  unidad: "cantidad" | "importe";
  fuente: "jornadas" | "horas_jornada" | "horas50" | "horas100" | "fijo" | "manual";
  aplicaA: "titular" | "reemplazante";
  soloRegimen?: "mensual" | "jornalero" | null;
  nota?: string;
};

/** El jornal que cobra quien cubre a otro. Es el efecto que más se repite, así que se nombra una vez. */
export const JORNAL_DEL_REEMPLAZANTE: EfectoSemilla = {
  conceptoCodigo: "0000",
  param: "par2",
  unidad: "cantidad",
  fuente: "jornadas",
  aplicaA: "reemplazante",
  soloRegimen: "jornalero",
  nota: "El que cubre cobra el jornal. Sólo jornaleros: al mensual ya se le paga el mes.",
};

/** El mapeo tal como lo pasó RRHH, con las tres salvedades del encabezado. */
export const MAPEO_SEMILLA: Record<string, EfectoSemilla[]> = {
  Franco: [JORNAL_DEL_REEMPLAZANTE],
  "Cambios de Turno": [],
  Compensatorios: [JORNAL_DEL_REEMPLAZANTE],
  Enfermedad: [
    { conceptoCodigo: "0012", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "titular", nota: "Licencia por enfermedad, en días." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  Vacaciones: [
    { conceptoCodigo: "0601", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "titular", nota: "Licencia por vacaciones, en días. No descuenta del básico: el 0001 sigue en 30." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  "Sin Goce de Sueldo": [
    {
      conceptoCodigo: "0090",
      param: "par2",
      unidad: "cantidad",
      fuente: "jornadas",
      aplicaA: "titular",
      nota: "En días. La leyenda decía importe; el caso de agosto trae 1, que como importe no existe.",
    },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  Feriado: [
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "horas_jornada", aplicaA: "titular", nota: "Feriado, en HORAS de la jornada de esa persona (6 en CC426, 10 y 13 en JSA, 4 en part-time)." },
    /*
      Al reemplazante mensual se le liquida el feriado; al jornalero, el jornal. Ya no es un supuesto:
      en agosto, de 177 mensualizados ninguno tiene 0000 y de 69 jornaleros ninguno tiene 0017.
    */
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "horas_jornada", aplicaA: "reemplazante", soloRegimen: "mensual", nota: "El mensual no cobra por día: cubrir un feriado le genera 0017, en horas." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  "Horas Extras y Feriados": [],
  "Otros Presentes": [
    /*
      SÓLO JORNALEROS, igual que el resto de los jornales.

      La tabla original no lo acotaba y el archivo generado le puso un 0000 a un mensualizado. El
      archivo REAL de agosto no tiene un solo 0000 en las hojas de mensuales: de 177, ninguno. Un
      mensualizado ya cobra el mes, así que cubrir un día no le agrega un jornal.
    */
    { conceptoCodigo: "0000", param: "par2", unidad: "cantidad", fuente: "jornadas", aplicaA: "reemplazante", soloRegimen: "jornalero", nota: "Alguien que no es del proyecto vino a trabajar: cobra el jornal. Sólo jornaleros." },
  ],
  Renuncia: [],
};

/** La regla global de horas extra: los dos códigos de la tabla, con la unidad que dice el catálogo. */
export const HORAS_EXTRA = { codigo50: "0015", codigo100: "0016", param: "par1" as const, unidad: "cantidad" as const };

/**
 * EL JORNAL DEL DÍA TRABAJADO, para el que vino y no pasó nada.
 *
 * YA NO ES UNA SUPOSICIÓN. El archivo real de agosto lo separa sin ambigüedad: de 177 mensualizados
 * ninguno tiene 0000, y de 69 jornaleros ninguno tiene 0017 ni 0001. El 0000 es el jornal del
 * jornalero, y un mensualizado no cobra por día porque ya cobra el mes.
 *
 * Sin esto la liquidación de los jornaleros sale a menos de dos tercios: en agosto, 111 días de
 * jornal en vez de 175.
 */
export const JORNAL_BASE = { codigo: "0000", param: "par2" as const, soloRegimen: "jornalero" as const };

/** Nombre viejo, para no romper al verificador. */
export const JORNAL_BASE_SUGERIDO = JORNAL_BASE;

/**
 * LOS MOTIVOS QUE, REVISADOS, NO LIQUIDAN NADA.
 *
 * No es lo mismo que no estar configurados. Un cambio de turno es alguien que trabajó, sólo que en
 * otro horario; una renuncia se procesa como baja de contrato, no como novedad del mes. Marcarlos
 * evita que cada corrida levante decenas de avisos de algo que ya se decidió.
 */
export const MOTIVOS_QUE_NO_LIQUIDAN = ["Cambios de Turno", "Renuncia", "Horas Extras y Feriados"];
