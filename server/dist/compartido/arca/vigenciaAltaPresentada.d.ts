/**
 * HASTA CUÁNDO UN ALTA PRESENTADA TRABA A LA PERSONA (pedido del 02/11/2026: «que no se superpongan los
 * días»). Puro, compartido: lo usan el servidor (`secuenciaPorPersona.ts`, que decide si la próxima alta
 * puede salir) y la pantalla (el aviso de «Forzar alta»), para que digan exactamente lo mismo.
 *
 * LA REGLA DE ARCA: una persona tiene UNA relación activa por vez con cada empleadora, y activa = sin la
 * baja procesada. ARCA procesa el vencimiento la noche del último día, así que un alta presentada queda
 * vigente hasta el mayor entre su baja y el día en que se presentó, y la siguiente alta de esa persona con
 * esa empleadora recién se puede presentar desde las 00:00 del día siguiente. Sin baja (tiempo
 * indeterminado) no se libera sola: alguien tiene que informar la baja.
 *
 * Ejemplo del pedido: un alta del 01/12 forzada el 01/11 queda vigente hasta el 01/12, y hasta el 02/12 a
 * las 00:00 no se puede presentar ninguna otra alta de esa persona con esa empleadora.
 */
/** "YYYY-MM-DD" + n días, sin husos horarios. */
export declare function sumarDiasIso(iso: string, n: number): string;
/** El último día en que el alta sigue vigente para ARCA; "" si no tiene baja (queda abierta). */
export declare function venceAltaPresentada(baja: string, diaPresentada: string): string;
/** Desde qué día (a las 00:00) se puede presentar otra alta de la persona con esa empleadora; "" si no se libera sola. */
export declare const libreDesdeTrasAlta: (baja: string, diaPresentada: string) => string;
export interface AltaParaAviso {
    alta: string;
    baja: string;
    tipoContrato?: string;
}
export interface AvisoForzarAlta {
    titulo: string;
    /** Los párrafos del aviso, en orden. */
    parrafos: string[];
    /** Las otras altas pendientes de la misma persona y empleadora que quedan trabadas por ésta. */
    trabadas: Array<AltaParaAviso & {
        atrasada: boolean;
    }>;
    /** Desde cuándo se libera (YYYY-MM-DD, a las 00:00); "" si no se libera sola. */
    libreDesde: string;
}
/**
 * EL AVISO DE «FORZAR ALTA»: que es inmediato y qué traba. `otras` son las demás altas PENDIENTES de esa
 * persona con esa empleadora: las que empiezan antes de que ésta se libere no van a poder salir hasta
 * entonces, y las que empezaban antes van a salir atrasadas.
 */
export declare function avisoForzarAlta(o: {
    nombre: string;
    empresa: string;
    hoy: string;
    alta: AltaParaAviso;
    otras: AltaParaAviso[];
}): AvisoForzarAlta;
