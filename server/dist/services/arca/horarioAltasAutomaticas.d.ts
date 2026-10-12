/**
 * EL HORARIO DE LAS ALTAS AUTOMÁTICAS, puro (sin base): cuándo corre y qué altas toma cada corrida.
 *
 * Se configura por tenant (Configuración → ARCA → Altas Automáticas):
 *   · `hora` y `minuto`: a qué hora argentina corre, todos los días.
 *   · `diasAntes`: con cuánta anticipación. 0 = el mismo día del alta; 2 = hasta dos días antes.
 *
 * CON ANTICIPACIÓN SE TOMA UNA VENTANA, NO UN SOLO DÍA. Con `diasAntes = 2` la corrida de hoy presenta
 * las altas que empiezan hoy, mañana o pasado. Si fuera «exactamente dos días antes», un contrato
 * cargado ayer para mañana ya habría perdido su turno y no saldría nunca. Con la ventana, cada alta
 * sale en la primera corrida que la alcanza.
 *
 * LAS ATRASADAS TAMBIÉN ENTRAN (pedido del 11/10/2026). Un alta cuya fecha ya pasó —porque la corrida
 * falló, o porque el contrato se cargó después de su fecha de inicio— no queda para subir a mano: entra
 * en la corrida siguiente, y en todas las que vengan, hasta que se presente. El límite es
 * `DIAS_ATRAS_PENDIENTES`: más viejas que eso ya no se presentan solas (y se fuerzan a mano).
 *
 * Argentina no tiene horario de verano: el desfase es siempre -03:00.
 */
export interface ConfigAltasAutomaticas {
    hora: number;
    minuto: number;
    diasAntes: number;
}
export declare const CONFIG_POR_DEFECTO: ConfigAltasAutomaticas;
export declare const MAX_DIAS_ANTES = 30;
/** Hasta cuántos días atrás la corrida sigue tomando un alta pendiente cuya fecha ya pasó. */
export declare const DIAS_ATRAS_PENDIENTES = 30;
/**
 * UN CONTRATO QUE YA TERMINÓ NO SE DA DE ALTA (pedido del 11/10/2026): si la fecha de baja es anterior
 * a hoy, la relación laboral ya pasó entera y presentar el alta no tiene sentido. Queda fuera de la
 * automática y a la vista con ese motivo. Sin baja (relación abierta) no aplica.
 */
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
export declare const horaTexto: (cfg: ConfigAltasAutomaticas) => string;
/** "YYYY-MM-DD" ± n días. */
export declare const sumarDias: (iso: string, n: number) => string;
/** La corrida de ese día, en hora argentina. */
export declare const momentoDeCorrida: (fecha: string, cfg: ConfigAltasAutomaticas) => Date;
/** Minutos desde la medianoche argentina (0-1439), sin depender de la zona del servidor. */
export declare const minutosArgentina: (d?: Date) => number;
/** ¿Ya pasó la hora de la corrida de hoy? */
export declare const yaPasoLaHora: (cfg: ConfigAltasAutomaticas, d?: Date) => boolean;
/** Qué fechas de alta toma la corrida de `hoy`: las atrasadas (hasta `DIAS_ATRAS_PENDIENTES`) y hasta `diasAntes` días adelante. */
export declare const ventanaDeLaCorrida: (hoy: string, cfg: ConfigAltasAutomaticas) => {
    desde: string;
    hasta: string;
};
/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha: la de hoy si todavía no corrió, si no la de
 * mañana; nunca antes de `fechaAlta - diasAntes`. Null sólo si el alta es más vieja que
 * `DIAS_ATRAS_PENDIENTES`: ahí la automática ya no la toma y se fuerza a mano.
 */
export declare function proximaCorridaPara(fechaAlta: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string): Date | null;
