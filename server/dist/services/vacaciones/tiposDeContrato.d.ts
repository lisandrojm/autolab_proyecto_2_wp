/**
 * LOS TIPOS DE CONTRATO PARA VACACIONES, DEL CATÁLOGO (23/11/2026). Ver `compartido/vacaciones/tipoDeContrato.ts`
 * por qué no se usa más el número de FRAME. Acá se cargan el catálogo y las plantillas UNA vez por pedido, y se arma:
 *  · `lectorDeTiposDeContrato`: el tipo del catálogo de un contrato (saldos, campaña, perfil).
 *  · `tiposParaVacaciones`: la lista que muestran «Visibilidad por tipo de Contrato» y la campaña de goce.
 */
import { Types } from "mongoose";
import { type ContratoConTipo, type PlantillaConTipo, type ReglaDeVisibilidad, type TipoDelCatalogo } from "../../compartido/vacaciones/tipoDeContrato.js";
export interface CatalogoDeTipos {
    tipos: Array<TipoDelCatalogo & {
        activo: boolean;
        orden: number;
        arca: {
            modalidad: string;
            servicio: string;
            liquidacion: string;
        };
    }>;
    plantillas: PlantillaConTipo[];
}
export declare function cargarCatalogoDeTipos(): Promise<CatalogoDeTipos>;
/** El tipo del catálogo de cada contrato, con el catálogo ya cargado. */
export declare function lectorDeTiposDeContrato(cat?: CatalogoDeTipos): Promise<(c: ContratoConTipo) => string | null>;
/** Los tipos del catálogo sin vacaciones, según las reglas guardadas (viejas o nuevas). */
export declare function tiposSinVacacionesDe(reglas: ReglaDeVisibilidad[] | null | undefined, cat?: CatalogoDeTipos): Promise<string[]>;
export interface TipoParaVacaciones {
    id: string;
    name: string;
    activo: boolean;
    arca: {
        modalidad: string;
        servicio: string;
        liquidacion: string;
    };
    /** Personas del tenant con un contrato vigente de este tipo. */
    vigentes: number;
    /** Lo que dice «Visibilidad por tipo de Contrato» (sin regla = con vacaciones). */
    vacationsEnabled: boolean;
}
/**
 * LA LISTA DE TIPOS para «Visibilidad por tipo de Contrato» y la campaña de goce: uno por tipo del catálogo, en su
 * orden. Van los activos, y un inactivo sólo si todavía hay alguien con un contrato vigente de ese tipo.
 */
export declare function tiposParaVacaciones(tenantId: Types.ObjectId | string, reglas: ReglaDeVisibilidad[] | null | undefined): Promise<TipoParaVacaciones[]>;
/** Las reglas que se guardan desde «Visibilidad por tipo de Contrato»: una por tipo del catálogo. */
export declare function reglasParaGuardar(entrada: unknown, cat: CatalogoDeTipos): Array<{
    tipoContratoId: string;
    contractName: string;
    vacationsEnabled: boolean;
}>;
