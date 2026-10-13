/**
 * LA ANTIGÜEDAD EN PALABRAS, igual en todas las pantallas: «9 años, 11 meses, 18 días».
 *
 * Años de 365 días y meses de 30, como venía escrito en Vacaciones, la ficha de usuario y el perfil
 * de la app: cada una tenía su copia. Una sola acá para que las tres digan lo mismo del mismo número.
 */
export declare function textoAntiguedad(dias: number): string;
/**
 * Lo que viaja a las pantallas cuando la persona está en ARCA: la fila global de `AntiguedadArca`
 * resumida. Si el usuario no la trae, la pantalla sigue con su cuenta de siempre (contratos de
 * WeProdu o fecha de ingreso).
 */
export interface AntiguedadArcaResumen {
    fuente: "arca";
    /** Días efectivamente trabajados según ARCA, sin contar dos veces los solapados. */
    diasTrabajados: number;
    /** `textoAntiguedad(diasTrabajados)`. */
    texto: string;
    primeraAlta: string | null;
    ultimaFecha: string | null;
    antiguedadDesdePrimeraAlta: {
        dias: number;
        anios: number;
    };
    cantidadContratos: number;
    empresas: string[];
    tieneRelacionAbierta: boolean;
    calculadoEl: string | null;
}
