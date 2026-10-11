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
 * sale en la primera corrida que la alcanza, y a más tardar en la de su propio día.
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
/** Qué fechas de alta toma la corrida de `hoy`: desde hoy hasta `diasAntes` días adelante. */
export declare const ventanaDeLaCorrida: (hoy: string, cfg: ConfigAltasAutomaticas) => {
    desde: string;
    hasta: string;
};
/**
 * La PRÓXIMA corrida que presentaría un alta con esa fecha, o null si ya no hay ninguna (su día pasó,
 * o es hoy y la hora ya pasó): entonces queda «sin presentar» y se fuerza a mano.
 *
 * La primera corrida que la alcanza es la de `fechaAlta - diasAntes`, o la de hoy si esa ya pasó; si
 * la de ese día ya corrió y todavía no es el día del alta, la siguiente.
 */
export declare function proximaCorridaPara(fechaAlta: string, cfg: ConfigAltasAutomaticas, ahora: Date, hoy: string): Date | null;
