/**
 * EL HORARIO DE LAS ALTAS AUTOMÁTICAS, puro (sin base): cuándo corre y qué altas toma cada corrida.
 *
 * Se configura por tenant (Configuración → ARCA → Altas Automáticas):
 *   · `hora` y `minuto`: a qué hora argentina corre la corrida DEL DÍA, todos los días.
 *   · `diasAntes`: con cuánta anticipación. 0 = el mismo día del alta; 2 = hasta dos días antes.
 *   · `modo` (pedido del 19/10/2026):
 *       - "diaria": sólo la corrida del día, una vez por día.
 *       - "frecuente": además, cada `cadaMinutos` corre la COLA: lo que ya tuvo su turno y no salió
 *         (atrasadas, rechazadas, cargadas tarde). La corrida del día sigue siendo a la hora fija.
 *
 * EL TURNO DE UN ALTA es la corrida del día de `fechaAlta - diasAntes`. Antes de su turno no sale; desde
 * su turno, queda en la cola hasta que se presente.
 *
 * LA CORRIDA DEL DÍA PRIORIZA LAS DE ESE DÍA: presenta primero, en corridas propias, las altas cuyo
 * turno es hoy, y recién después la cola de atrasadas. Si algo de la cola falla (un lote rechazado
 * entero, ARCA que no responde), las del día ya salieron. En modo frecuente, una corrida de la cola que
 * está en curso cuando llega la hora del día corta entre lotes para dejarle el paso.
 *
 * NADA QUEDA FUERA DE LA AUTOMÁTICA (pedido del 19/10/2026): ni los contratos ya terminados, ni las
 * altas de más de 30 días, ni las rechazadas varias veces o con un rechazo del padrón. Todas siguen en
 * la cola hasta que se presenten. Lo único que se pide es aire: una rechazada en una corrida no se
 * vuelve a intentar hasta el día siguiente, para no golpear ARCA cada pocos minutos con lo mismo.
 *
 * Argentina no tiene horario de verano: el desfase es siempre -03:00.
 */
export type ModoAltasAutomaticas = "diaria" | "frecuente";
export interface ConfigAltasAutomaticas {
    hora: number;
    minuto: number;
    diasAntes: number;
    modo: ModoAltasAutomaticas;
    /** Modo frecuente: cada cuántos minutos corre la cola. */
    cadaMinutos: number;
}
/** Lo que mira el reloj: la hora de la corrida del día. */
export type HoraDelDia = Pick<ConfigAltasAutomaticas, "hora" | "minuto">;
/** Las frecuencias que ofrece la configuración, en minutos. */
export declare const FRECUENCIAS_MINUTOS: readonly [15, 30, 60, 120, 180, 240, 360];
export declare const CONFIG_POR_DEFECTO: ConfigAltasAutomaticas;
export declare const MAX_DIAS_ANTES = 30;
/** Un contrato cuya fecha de baja es anterior a hoy: la relación ya pasó entera. Sólo informativo: igual se presenta. */
export declare const yaTermino: (fechaBaja: string, hoy: string) => boolean;
/** Lo guardado (que puede faltar o venir viejo) a una configuración completa y válida. */
export declare const configDe: (guardado: any) => ConfigAltasAutomaticas;
/** Lo que manda el cliente al guardar: cada campo se valida; el que falta no se toca. */
export declare function validarConfig(body: any): {
    ok: true;
    cambios: Partial<ConfigAltasAutomaticas>;
} | {
    ok: false;
    error: string;
};
export declare const horaTexto: (cfg: HoraDelDia) => string;
/** "YYYY-MM-DD" ± n días. */
export declare const sumarDias: (iso: string, n: number) => string;
/** La corrida de ese día, en hora argentina. */
export declare const momentoDeCorrida: (fecha: string, cfg: HoraDelDia) => Date;
/** Minutos desde la medianoche argentina (0-1439), sin depender de la zona del servidor. */
export declare const minutosArgentina: (d?: Date) => number;
/** El día argentino ("YYYY-MM-DD") de un instante. */
export declare const diaArgentina: (d: Date) => string;
/** ¿Ya pasó la hora de la corrida de hoy? */
export declare const yaPasoLaHora: (cfg: HoraDelDia, d?: Date) => boolean;
/** El día del turno de un alta: el de su corrida del día. */
export declare const diaDelTurno: (fechaAlta: string, cfg: ConfigAltasAutomaticas) => string;
/**
 * Hasta qué fecha de alta toma una corrida de `hoy` (sin piso: las atrasadas entran todas).
 *   · La del día: hasta `hoy + diasAntes`.
 *   · La de la cola: sólo lo que ya tuvo su turno. Antes de la hora del día, el turno de hoy todavía no
 *     llegó (lo presenta la corrida del día, con prioridad); después, sí.
 */
export declare const hastaDeLaCorrida: (hoy: string, cfg: ConfigAltasAutomaticas, tipo: "dia" | "cola", ahora?: Date) => string;
/** En la corrida del día, van primero (y aparte) las que todavía no están atrasadas: las de su día. */
export declare const esDelDia: (fechaAlta: string, hoy: string) => boolean;
/**
 * Cuántas veces ARCA ya rechazó un alta en corridas automáticas. Ya no corta nada (pedido del
 * 19/10/2026: todas siguen en la cola); queda para mostrarlo.
 */
export declare const MAX_INTENTOS_AUTOMATICOS = 3;
/** Lo que mira la corrida de un candidato para decidir si entra o queda omitido con un motivo. */
export interface CandidatoParaCorrida {
    presentable: boolean;
    /** ISO del último rechazo de ARCA; vacío si no está rechazada. */
    rechazadaEl: string;
    motivo: string;
}
/** Rechazada hoy: espera al día siguiente para volver a intentarse. */
export declare const rechazadaHoy: (c: Pick<CandidatoParaCorrida, "rechazadaEl">, hoy: string) => boolean;
/** Entra en la corrida: completo, y sin un rechazo de hoy mismo. */
export declare const entraEnLaCorrida: (c: CandidatoParaCorrida, hoy: string) => boolean;
/** Por qué NO entró, para la lista «Sin presentar» de la corrida. `null` = entró. */
export declare function motivoDeOmision(c: CandidatoParaCorrida, hoy: string): string | null;
/** La próxima corrida de la cola (modo frecuente): `cadaMinutos` después de la última, y nunca antes de ahora. */
export declare const proximaDeLaCola: (cfg: ConfigAltasAutomaticas, ultimaCola: string | undefined, ahora: Date) => Date;
/** ¿Le toca correr a la cola? */
export declare const leTocaALaCola: (cfg: ConfigAltasAutomaticas, ultimaCola: string | undefined, ahora?: Date) => boolean;
/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha. Nunca null: nada queda fuera.
 *   · Antes de su turno: la corrida del día de su turno.
 *   · Desde su turno (en la cola): la próxima corrida que pase, sea la del día o la de la cola.
 *   · Rechazada hoy: la primera de mañana.
 */
export declare function proximaCorridaPara(fechaAlta: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string, o?: {
    ultimaCola?: string;
    rechazadaHoy?: boolean;
}): Date | null;
