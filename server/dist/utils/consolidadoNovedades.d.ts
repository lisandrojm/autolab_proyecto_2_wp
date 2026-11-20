/**
 * EL CONSOLIDADO DE NOVEDADES (20/11/2026): las cinco hojas que sirven para liquidar, SIN BASE.
 *
 * Reemplaza al «Exportar Detalle Diario» del reporte, que emitía una fila por persona y día del período
 * (5.301 filas para LN+ en noviembre, 3.980 «Sin Registro»). Acá sale sólo lo que tiene algo que decir, y
 * lo que no se sabe se dice que no se sabe. Las reglas las confirmó el usuario el 20/11:
 *
 *  - UN DÍA SIN PARTE no es una sola cosa. Según los días asignados en el contrato que rige ese día:
 *      no le correspondía trabajar → no hay fila;  le correspondía → «Falta parte» (y A revisar);
 *      contrato de días rotativos o sin días cargados → NO se infiere (ni del turno: los turnos tienen
 *      los 7 días y daban 387 «Falta parte» falsos, domingos incluidos): una línea «Días no evaluables».
 *  - UNA PERSONA SIN NINGÚN PARTE EN EL PERÍODO no llena el detalle con 25 «Falta parte»: una sola
 *    alerta («Sin ningún parte en el mes»). El dato es «nadie cargó nada».
 *  - Un parte de alguien SIN CONTRATO que cubra ese día: estado «Sin contrato vigente» (lo que el parte
 *    dijo va en el motivo) y A revisar. Sin parte y sin contrato no se emite nada.
 *  - LAS JORNADAS (contratos con `fechas_trabajadas`) de una misma persona, tipo, empresa, categoría y
 *    valor son UNA fila del resumen (Leonardo Aquino tenía 14 contratos en el mes); las fechas quedan en
 *    el detalle. Los demás tipos: una fila por contrato.
 *  - CONTRATOS DUPLICADOS exactos (misma alta, baja y tipo): se muestra uno y se avisa.
 *  - El COMENTARIO es del parte, no de la persona: va en la hoja Partes, una vez.
 *  - El estado nunca queda vacío; si no aplica ninguna regla, «Sin determinar» con el motivo al lado.
 *
 * LO QUE NO SE HACE ACÁ: el reparto de las extras entre 50% y 100% y los importes. El glosario de rangos
 * vive en el navegador de quien exporta (`overtimeUtils`), así que cada fila del detalle lleva las extras
 * CRUDAS (total, reparto guardado, horas reales, horario del turno) y el navegador reparte con la misma
 * función de siempre. Pendiente anotado: ese cálculo tiene que terminar en el server con el glosario
 * como dato.
 *
 * «Otros Presentes»: 40 registros de noviembre tienen ese motivo con estado Ausente y el tipo ya no
 * existe en el catálogo. Si para liquidación son jornadas trabajadas, lo decide liquidaciones (pendiente
 * al 20/11): mientras tanto cuentan como ausencia en «Otro motivo» y van a A revisar como «Motivo fuera
 * del catálogo», con las fechas, para que lo vean. Cuando lo decidan, la equivalencia va acá con su
 * comentario: es un valor histórico que nadie puede volver a crear.
 */
export interface PersonaConsolidado {
    id: string;
    /** «Apellido, Nombre». */
    nombre: string;
    /** Apellido y nombre por separado: la planilla de liquidación los lleva en dos columnas. */
    apellido: string;
    nombrePila: string;
    cuil: string;
    legajo: string;
}
export interface ContratoConsolidado {
    key: string;
    personaId: string;
    proyectoId: string;
    proyecto: string;
    centroCosto: string;
    /** «AAAA-MM-DD». */
    alta: string;
    /** «AAAA-MM-DD» o «» (abierto). */
    baja: string;
    tipo: string;
    tipoId: string;
    empresa: string;
    empresaId: string;
    categoria: string;
    categoriaId: string;
    /** Grupo de la categoría (`categorias-sat.data.numeroCategoria`, el «N* 4» de la planilla). null = categoría fuera del catálogo. */
    grupo: number | null;
    /**
     * RNOS de la obra social que se declara por este contrato, resuelto con la cascada de ARCA
     * (`compartido/arca/afipCompleteness.ts`): la fijada en el contrato → la del convenio de la categoría →
     * la de la empleadora si la categoría está excluida de convenio. «» = ninguna resolvió.
     */
    obraSocialCodigo: string;
    obraSocialOrigen: "contrato" | "convenio" | "empresa" | "";
    area: string;
    turno: string;
    horaInicio: string;
    horaFin: string;
    sueldoJornada: number | null;
    sueldoMano: number | null;
    /** Jornadas: las fechas que trabaja. Vacío si no es jornada. */
    fechasTrabajadas: string[];
    /** 0 = domingo … 6 = sábado. */
    diasSemana: number[];
    rotativo: boolean;
}
export interface RegistroConsolidado {
    personaId: string;
    /** present | absent | late | … */
    status: string;
    motivo: string;
    reemplazanteId: string;
    extras: number;
    /** Reparto guardado en el parte (0 si no hay). */
    h50: number;
    h100: number;
    /** Horas reales de las extras (`inTime`/`outTime`). */
    entradaReal: string;
    salidaReal: string;
    /** Horario del turno de la persona ese día según el parte (`scheduleInTime`/`scheduleOutTime`). */
    entradaPrevista: string;
    salidaPrevista: string;
    /** Ya resueltos por el servicio (fila del registro > parte > turno único por horario); «» si no hay. */
    area: string;
    turno: string;
}
export interface ParteConsolidado {
    numero: string;
    fecha: string;
    proyectoId: string;
    proyecto: string;
    area: string;
    turno: string;
    responsable: string;
    comentario: string;
    registros: RegistroConsolidado[];
}
export interface EntradaConsolidado {
    desde: string;
    hasta: string;
    personas: PersonaConsolidado[];
    contratos: ContratoConsolidado[];
    partes: ParteConsolidado[];
    feriados: {
        fecha: string;
        nombre: string;
    }[];
    /** Los motivos de ausencia del catálogo del tenant, en su orden. */
    motivos: string[];
}
export interface FilaResumen {
    clave: string;
    legajo: string;
    colaborador: string;
    cuil: string;
    empresa: string;
    tipo: string;
    categoria: string;
    centroCosto: string;
    proyecto: string;
    area: string;
    turno: string;
    desde: string;
    hasta: string;
    /** Cuántos contratos agrupa (jornadas). */
    contratos: number;
    jornadasTrabajadas: number;
    /** null = no se puede saber (rotativo o sin días). */
    jornadasPrevistas: number | null;
    ausencias: number;
    /** Por motivo del catálogo + «Otro motivo». */
    porMotivo: Record<string, number>;
    diasSinParte: number;
    valorJornada: number | null;
    /** El navegador divide por el divisor del glosario. null = no aplica (jornadas) o no hay. */
    sueldoMano: number | null;
    /** Jornada: el sueldo mano cargado es el valor de la jornada, no un mensual: valor hora e importes vacíos. */
    valorHoraNoAplica: boolean;
    /** Suma cruda de las extras (para saber si la fila necesita importes). */
    extrasCrudas: number;
    proyectoId: string;
    apellido: string;
    nombrePila: string;
    grupo: number | null;
    obraSocialCodigo: string;
    obraSocialOrigen: string;
    esJornada: boolean;
    /** Fila de un parte sin contrato que lo cubra: no va a la hoja por empresa. */
    sinContrato: boolean;
    /** Tiempo indeterminado o plazo fijo (`esMensualizado`): lo único que va a la hoja por empresa. */
    mensualizado: boolean;
    /** La persona figura en algún parte del período. Si no, sus novedades están vacías porque NO HAY DATOS, no porque no haya novedades. */
    conAlgunParte: boolean;
    /** Horas trabajadas los feriados del período: salida real − entrada real, o el turno si no hay reales. Dio 10 de 10 contra la planilla real (concepto 0017). */
    horasFeriado: number;
    /** Vacaciones contadas como se pagan: días CORRIDOS de cada tramo, del primer al último día con motivo Vacaciones, aunque en el medio haya francos. Un día trabajado corta el tramo. */
    vacacionesCorridas: number;
    /** Días en que la persona figura en el parte reemplazando a otra. */
    reemplazos: number;
}
export interface ExtrasCrudas {
    total: number;
    h50: number;
    h100: number;
    /** Contra qué horario se reparte: el del parte, o el del contrato. */
    horarioEntrada: string;
    horarioSalida: string;
    feriado: boolean;
}
export interface FilaDetalle {
    claveResumen: string;
    fecha: string;
    dia: string;
    /** «» o el nombre del feriado. */
    feriado: string;
    colaborador: string;
    cuil: string;
    proyecto: string;
    /** Empresa del contrato que rige ese día («» si no hay). */
    empresa: string;
    area: string;
    turno: string;
    estado: string;
    motivo: string;
    entradaPrevista: string;
    salidaPrevista: string;
    entradaReal: string;
    salidaReal: string;
    extras: ExtrasCrudas | null;
    reemplazo: string;
    parte: string;
}
export interface FilaParte {
    parte: string;
    fecha: string;
    proyecto: string;
    area: string;
    turno: string;
    responsable: string;
    presentes: number;
    ausentes: number;
    comentario: string;
}
export interface FilaRevisar {
    tipo: string;
    colaborador: string;
    cuil: string;
    fecha: string;
    detalle: string;
}
export interface Consolidado {
    resumen: FilaResumen[];
    detalle: FilaDetalle[];
    partes: FilaParte[];
    revisar: FilaRevisar[];
}
export declare const OTRO_MOTIVO = "Otro motivo";
export declare const diaDeSemana: (f: string) => number;
export declare const diaCorto: (f: string) => string;
export declare const esJornada: (c: ContratoConsolidado) => boolean;
/**
 * Mensualizado = lo que va en la planilla de liquidación por empresa: Tiempo indeterminado y Plazo fijo (5x7, 6x6).
 * Por NOMBRE del tipo y en lista blanca: un «Servicios Adicional» de un día sin fechas cargadas no es jornada
 * para `esJornada`, pero tampoco es un sueldo mensual (con la lista negra aparecían 39 filas de más).
 * Los jornaleros (Servicios, Jornada, Eventual) tienen su propia planilla.
 */
export declare const esMensualizado: (tipo: string) => boolean;
/** Horas entre dos «HH:mm»; una salida anterior a la entrada cruza la medianoche. 0 si falta alguna. */
export declare const horasEntre: (entrada: string, salida: string) => number;
type Esperado = "si" | "no" | "rotativo" | "sin_dias";
/** Si a la persona le correspondía trabajar ese día según el contrato. No se infiere del turno. */
export declare function leCorresponde(c: ContratoConsolidado, d: string): Esperado;
/**
 * Entre los contratos que cubren el día: el abierto manda; si no, el de alta más reciente. A igual alta, el
 * que más dice (Aguinaga: dos indeterminados del 01/06/2023, uno con área, turno y días y otro vacío; si
 * regía el vacío, la fila salía «Sin área»).
 */
export declare function contratoQueRige(contratos: ContratoConsolidado[], d: string): ContratoConsolidado | null;
export declare function consolidarNovedades(e: EntradaConsolidado): Consolidado;
export {};
