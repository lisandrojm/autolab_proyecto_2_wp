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
 * 1. VACACIONES NO SE MAPEA para el titular. La tabla dice "código a confirmar con Memosoft": los
 *    únicos códigos de vacaciones del catálogo son 0601 Plus Vacacional y 0701 No Gozadas, y
 *    ninguno es la licencia. Elegir uno porque son los que hay sería inventar un concepto.
 *
 * 2. "HORAS EXTRAS Y FERIADOS" TAMPOCO. Las horas extra se liquidan haya o no novedad, así que son
 *    una regla global. Mapear además el motivo haría que un parte emitiera el 0015 dos veces.
 *    (Ese motivo, además, quedó del seed original y nunca se usó: cero renglones en la historia.)
 *
 * 3. SIN GOCE DE SUELDO VA COMO `manual`. El catálogo dice que 0090 lleva un IMPORTE en par2 y de
 *    un parte salen días. Hasta que el estudio lo confirme, el efecto existe pero no calcula.
 */
export type EfectoSemilla = {
  conceptoCodigo: string;
  param: "par1" | "par2";
  unidad: "cantidad" | "importe";
  fuente: "jornadas" | "horas50" | "horas100" | "fijo" | "manual";
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
  Vacaciones: [JORNAL_DEL_REEMPLAZANTE],
  "Sin Goce de Sueldo": [
    {
      conceptoCodigo: "0090",
      param: "par2",
      unidad: "importe",
      fuente: "manual",
      aplicaA: "titular",
      nota: "PENDIENTE: el catálogo dice importe en par2, pero de un parte salen días. Confirmar con el estudio.",
    },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  Feriado: [
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "titular", nota: "Feriado, en días." },
    /*
      Al reemplazante mensual se le paga el feriado; al jornalero, el jornal. Es la lectura de
      "0017 o 0000 según régimen" de la tabla, y está marcada como supuesto a confirmar.
    */
    { conceptoCodigo: "0017", param: "par1", unidad: "cantidad", fuente: "jornadas", aplicaA: "reemplazante", soloRegimen: "mensual", nota: "SUPUESTO: al mensual que cubre un feriado se le liquida el feriado." },
    JORNAL_DEL_REEMPLAZANTE,
  ],
  "Horas Extras y Feriados": [],
  "Otros Presentes": [
    { conceptoCodigo: "0000", param: "par2", unidad: "cantidad", fuente: "jornadas", aplicaA: "reemplazante", nota: "Alguien que no es del proyecto vino a trabajar: cobra el jornal." },
  ],
  Renuncia: [],
};

/** La regla global de horas extra: los dos códigos de la tabla, con la unidad que dice el catálogo. */
export const HORAS_EXTRA = { codigo50: "0015", codigo100: "0016", param: "par1" as const, unidad: "cantidad" as const };

/**
 * EL JORNAL DEL DÍA TRABAJADO, para el que vino y no pasó nada.
 *
 * Sin código por defecto: es una decisión de RRHH, no del motor. Está acá para que el verificador
 * pueda mostrar cuánto cambia la liquidación cuando se lo configura, que es lo que hace falta ver
 * para decidirlo.
 */
export const JORNAL_BASE_SUGERIDO = { codigo: "0000", param: "par2" as const, soloRegimen: "jornalero" as const };

/**
 * LOS MOTIVOS QUE, REVISADOS, NO LIQUIDAN NADA.
 *
 * No es lo mismo que no estar configurados. Un cambio de turno es alguien que trabajó, sólo que en
 * otro horario; una renuncia se procesa como baja de contrato, no como novedad del mes. Marcarlos
 * evita que cada corrida levante decenas de avisos de algo que ya se decidió.
 */
export const MOTIVOS_QUE_NO_LIQUIDAN = ["Cambios de Turno", "Renuncia", "Horas Extras y Feriados"];
