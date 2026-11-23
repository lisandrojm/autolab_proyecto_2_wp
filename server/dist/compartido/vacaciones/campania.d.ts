import { type TramoDeVentana, type VentanaEfectiva } from "../ventanaGoce.js";
export interface ConfigCampania {
    /** La pestaña y la tarjeta de la app sólo se ofrecen con la campaña activa. */
    activa: boolean;
    /** Cuántos días tiene la persona para elegir, desde que se la invita. */
    plazoParaDefinirDias: number;
    /** Aviso por escrito antes del INICIO de las vacaciones (LCT: 30; el CCT puede pedir más). */
    avisoMinimoDias: number;
    /** El tramo más corto que se acepta al fraccionar (LCT: 7 días corridos). */
    minDiasPorTramo: number;
    /**
     * Con qué tipos de contrato (`tipo_contrato_id`) arranca tildada una campaña nueva. Vacío = todos los
     * habilitados. Cada campaña guarda su propia lista: ver «A QUIÉN SE INVITA», más abajo.
     */
    /** Los tipos del catálogo (`_id` de `contratos`), no el número de FRAME: ver `vacaciones/tipoDeContrato.ts`. */
    tiposContratoInvitar: string[];
}
export declare const CONFIG_CAMPANIA_POR_DEFECTO: ConfigCampania;
/**
 * Qué pasa si la persona no elige, y cómo asigna la empresa. Son constantes y no configuración: NO hay
 * otra opción. En particular, no existe «pagar en lugar de gozar» (art. 156: sólo al egreso).
 */
export declare const ACCION_SI_NO_DEFINE: "empresaAsigna";
export declare const ASIGNACION_POR_DEFECTO: "tramoUnico";
/** Lee la configuración guardada tolerando lo que falte o venga mal: cada dato inválido cae al de por defecto. */
export declare function normalizarConfigCampania(v: any): ConfigCampania;
/**
 * A QUIÉN SE INVITA, POR TIPO DE CONTRATO (16/11/2026). La campaña puede limitarse a ciertos tipos de
 * contrato. Lo que se mira de cada persona es UN contrato: el vigente en su EMPRESA DE CÓMPUTO (la
 * empleadora de la que sale su antigüedad); si ahí tiene varios vigentes, el de alta más reciente. Lo
 * elige el server (`utils/contratoDeComputo.ts`); acá está la decisión, que comparten el lanzamiento y
 * la vista previa para que digan el mismo número:
 *  · Un tipo deshabilitado en «Visibilidad por tipo de Contrato» (`contractRules.vacationsEnabled = false`)
 *    NUNCA se invita, esté o no tildado en la campaña.
 *  · Sin selección (lista vacía) no se filtra por tipo: la población de siempre, menos los deshabilitados.
 *  · Con selección, sólo quien tiene su contrato vigente de cómputo en uno de esos tipos. Quien no tiene
 *    contrato vigente en su empresa de cómputo (o lo tiene sin tipo) queda afuera: no hay qué comparar.
 */
export type MotivoNoInvitar = "tipo_deshabilitado" | "tipo_no_incluido" | "sin_contrato_vigente";
/**
 * La lista de tipos tal como se guarda: ids del catálogo (24 hex), sin repetir, ordenados. Lo que no es una lista
 * queda vacío. Un número es la clave vieja (el de FRAME, 23/11/2026): se descarta, no se adivina a qué tipo era.
 */
export declare function normalizarTiposContrato(v: unknown): string[];
/** Por qué NO se invita a alguien, o `null` si se la invita. `tipoContratoId` null = sin contrato vigente de cómputo. */
export declare function motivoDeNoInvitar(o: {
    tipoContratoId: string | null;
    seleccion: string[];
    deshabilitados: string[];
}): MotivoNoInvitar | null;
/** Cuánta gente con días hay en cada tipo de contrato (por su contrato vigente de cómputo), y cuánta sin contrato. */
export interface PoblacionPorTipo {
    porTipo: {
        id: string;
        nombre: string;
        personas: number;
    }[];
    sinContrato: number;
}
export interface ResumenDeInvitables {
    invitar: number;
    tipoDeshabilitado: number;
    tipoNoIncluido: number;
    sinContrato: number;
}
/**
 * LA VISTA PREVIA: cuántas personas se invitarían con esa selección, y cuántas quedan afuera por cada
 * motivo. Es `motivoDeNoInvitar` aplicado grupo por grupo, así que coincide con lo que hace el lanzamiento.
 */
export declare function resumenDeInvitables(p: PoblacionPorTipo, seleccion: string[], deshabilitados: string[]): ResumenDeInvitables;
export interface Tramo {
    desde: string;
    hasta: string;
}
/** La ventana de una campaña, con año: «del 1/11/2026 al 30/4/2027». */
export type VentanaDeCampania = Tramo;
/**
 * Cuántos días cuenta un tramo: corridos, o de lunes a viernes cuando la configuración no usa días
 * corridos. Es la misma cuenta que `contarDias` del server (sin descontar feriados), para que la suma
 * de la propuesta dé lo mismo que van a descontar las vacaciones que se crean.
 */
export declare function contarDiasTramo(t: Tramo, diasCorridos: boolean): number;
/** El último día de un tramo que empieza en `desde` y tiene `dias` días (corridos o hábiles). */
export declare function hastaParaDias(desde: string, dias: number, diasCorridos: boolean): string;
/**
 * LA VENTANA DE LA TEMPORADA, CON AÑO: la que está en curso o, si ya terminó, la próxima. La ventana
 * anual es «MM-DD» sin año (1/11 → 30/4); una campaña lanzada el 15/9/2026 es para la del 1/11/2026 al
 * 30/4/2027, y una lanzada el 15/1/2027, para la que ya empezó (termina el 30/4/2027).
 */
export declare function ventanaDeLaTemporada(hoy: string, tramo: TramoDeVentana): VentanaDeCampania;
/** Hasta cuándo puede elegir: `hoy` + el plazo. */
export declare const fechaLimite: (hoy: string, plazoDias: number) => string;
/** El primer día en que pueden empezar unas vacaciones avisadas hoy. */
export declare const primerInicioPosible: (hoy: string, avisoDias: number) => string;
export interface Alerta {
    nivel: "error" | "aviso";
    codigo: string;
    mensaje: string;
}
/**
 * LO QUE CONVIENE SABER ANTES DE LANZAR. La cuenta que importa es la del peor caso: alguien que no elige
 * hasta la fecha límite, la empresa le asigna ese día y recién ahí corre el aviso. Si ese inicio (más los
 * días a otorgar) se pasa del fin de la ventana, la campaña no llega a otorgar en término.
 *
 * `diasMasLargo`: los días del que más tiene para gozar (si se sabe), para medir también el fin del tramo.
 */
export declare function alertasDeLanzamiento(o: {
    hoy: string;
    plazoDias: number;
    avisoDias: number;
    ventana: VentanaDeCampania;
    diasMasLargo?: number;
}): Alerta[];
/**
 * LA PROPUESTA DE LA PERSONA: uno o más tramos.
 *  · Cada tramo dentro de la ventana de la campaña (y de la suya, si su área o proyecto tiene otra).
 *  · Ninguno empieza antes de `hoy + aviso`: el aviso por escrito sale al aprobarse, y tiene que llegar.
 *  · Los tramos no se pisan, y si son varios, cada uno de al menos `minPorTramo` días (fraccionar es un
 *    acuerdo: proponerlo la persona y aprobarlo la empresa es ese acuerdo).
 *  · La suma da los días disponibles: sin acumulación pactada (segunda etapa) no quedan días sueltos.
 * Devuelve los errores, en castellano; vacío = está bien.
 */
export declare function validarPropuesta(o: {
    tramos: Tramo[];
    diasDisponibles: number;
    ventana: VentanaDeCampania;
    ventanaPersona?: VentanaEfectiva | null;
    hoy: string;
    avisoDias: number;
    minPorTramo: number;
    diasCorridos: boolean;
}): string[];
/**
 * AL OTORGAR (aprobar la propuesta o confirmar lo que asigna la empresa): el aviso por escrito sale HOY,
 * así que tiene que haber al menos `aviso` días hasta el inicio, y el goce tiene que terminar dentro de la
 * ventana. Devuelve los errores; vacío = se puede otorgar.
 */
export declare function validarOtorgamiento(o: {
    hoy: string;
    desde: string;
    hasta: string;
    avisoDias: number;
    ventana: VentanaDeCampania;
}): string[];
/**
 * EL TRAMO ÚNICO QUE SUGIERE EL SISTEMA para quien no eligió: el primero, desde `desdeMinimo` (hoy +
 * aviso), que entra entero en la ventana (la de la campaña y la de la persona) y no toca ningún día
 * bloqueado (topes de solapamiento del área, otras vacaciones). Continuo siempre: la empresa no
 * fracciona sin acuerdo. `null` si no entra en ningún lado.
 */
export declare function sugerirTramoUnico(o: {
    dias: number;
    ventana: VentanaDeCampania;
    desdeMinimo: string;
    diasCorridos: boolean;
    ventanaPersona?: VentanaEfectiva | null;
    bloqueadas?: Iterable<string>;
}): Tramo | null;
export type EstadoInvitacion = "pendiente_de_invitar" | "invitado" | "acuso_recibo" | "propuso_fechas" | "rechazada" | "aprobado_notificado" | "vencido_sin_definir" | "asignado_por_empresa_notificado"
/** Ya no le quedan días de ese año (los tomó por otra vía): no hay nada que otorgar. */
 | "sin_dias_pendientes";
/** Lo que se muestra: el estado guardado, o «en curso» / «gozado» cuando las vacaciones otorgadas ya empezaron. */
export type EstadoVisible = EstadoInvitacion | "en_curso" | "gozado";
export declare const ETIQUETA_ESTADO: Record<EstadoVisible, string>;
/** Los estados en que la persona todavía puede elegir (y en que la tarjeta de la app está viva). */
export declare const PUEDE_PROPONER: EstadoInvitacion[];
/** Los estados ya otorgados: hubo aviso por escrito. */
export declare const OTORGADOS: EstadoInvitacion[];
/** Los que ya no deben nada: otorgados con aviso, o sin días que otorgar. La campaña cierra sólo si todos están acá. */
export declare const RESUELTOS: EstadoInvitacion[];
/** «En curso» o «gozado» según las fechas otorgadas; si no, el estado guardado. */
export declare function estadoVisible(estado: EstadoInvitacion, otorgados: Tramo[], hoy: string): EstadoVisible;
/**
 * LAS ALERTAS DE SEGUIMIENTO DE UNA PERSONA: no acusó recibo, la fecha límite está por vencer, o lo que
 * propuso ya no llega con el aviso (la jerarquía tardó en aprobar).
 */
export declare function alertasDeInvitacion(o: {
    estado: EstadoInvitacion;
    fechaLimite: string;
    acuseInvitacionAt?: string | Date | null;
    invitadoAt?: string | Date | null;
    tramos?: Tramo[];
    hoy: string;
    avisoDias: number;
}): Alerta[];
