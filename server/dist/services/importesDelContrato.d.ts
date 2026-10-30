/** Lo del tipo de contrato (`Contrato.data`) que hace falta acá; para el `.select()`. */
export declare const CAMPOS_DEL_TIPO_PARA_IMPORTES = "data.cantidadJornadas data.modoFechas data.multiplicadorDiario data.importesEnCero data.esTiempoIndeterminado";
export interface TipoParaImportes {
    data?: {
        cantidadJornadas?: number | null;
        modoFechas?: string;
        esTiempoIndeterminado?: boolean;
        multiplicadorDiario?: number | null;
        importesEnCero?: boolean;
    } | null;
}
/**
 * LAS JORNADAS QUE FIJA EL TIPO DE CONTRATO PARA ESTE CONTRATO, con la misma cuenta que el formulario
 * (`jornadasFijadasPorElTipo`, regla del 19/10/2026): un mes completo vale las jornadas del tipo («Plazo
 * fijo»: 30; «Servicios»: 22); un tramo de mes, los días que trabaja en él. Con tiempo indeterminado se
 * cuenta el mes del alta (`periodoDeCalculo`). `null` si el tipo no fija jornadas o es por días sueltos.
 *
 * Hasta el 30/10/2026 el server ponía las del tipo enteras: un Servicios del 1 al 9 de octubre (7
 * jornadas) se guardaba con 22 y el sueldo en mano pasaba a ser el mensual.
 */
export declare const jornadasQueFijaElTipo: (contrato: any, tipo: TipoParaImportes | null | undefined) => number | null;
/**
 * LOS IMPORTES DE UN TIPO «IMPORTES EN 0» (cambio de franco, 27/10/2026): todos en cero, digan lo que
 * digan el formulario o la escala. El día trabajado reemplaza a uno de franco y no se paga.
 */
export declare const IMPORTES_EN_CERO: {
    sueldo_jornada: number;
    sueldo_mano: number;
    sueldo_mano_texto: string;
    sueldo_neto: number;
    sueldo_bruto: number;
    sueldo_diario_neto: number;
    diferencia_diaria_neto: number;
};
/** Los sueldos del contrato con la misma cuenta que la solicitud del móvil y el formulario (`sueldosDelContrato`). */
export declare const sueldosConEscala: (contrato: any, tipoContrato: TipoParaImportes | null | undefined) => Promise<Record<string, unknown>>;
