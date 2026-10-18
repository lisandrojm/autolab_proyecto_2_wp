/**
 * CUÁNTO QUEDA DESCUBIERTO UN ROL EN UN MES: día por día, quiénes del grupo (área × turno × rol) están
 * de vacaciones según los bloques del plan. «Alguien afuera» justifica el reemplazo mensual; «nadie
 * presente» (todo el rol de vacaciones a la vez) se pinta en rojo. Sólo miran los bloques vivos (no
 * cancelados ni rechazados).
 */
export interface BloqueDeCobertura {
    userId: string;
    desde: string;
    hasta: string;
    estado: string;
}
export interface CoberturaDelMes {
    /** Días del mes dentro de la ventana. */
    dias: number;
    diasConAlguienAfuera: number;
    diasSinNadie: number;
    porDia: Array<{
        dia: string;
        ausentes: string[];
        presentes: number;
    }>;
}
export declare function coberturaDelMes(bloques: BloqueDeCobertura[], personasDelGrupo: string[], mes: string, ventanaDesde: string, ventanaHasta: string): CoberturaDelMes;
