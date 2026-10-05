import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): grupo de tipo de servicio (`l_GTS`).
 *
 * Son DOS registros —1 CONTINUOS y 2 DISCONTINUOS— y existe por una sola razón: desambiguar el
 * catálogo de Tipos de Servicio. De los 293 tipos, 49 nombres están repetidos (98 registros): en el
 * selector se ven dos filas idénticas y elegir la equivocada escribe otro código en las posiciones
 * 107-109 del TXT. Lo que las separa es el grupo, que ARCA pide como campo aparte de la pantalla.
 *
 * NO VIAJA EN EL TXT. El registro de 130 posiciones no le reserva ninguna: el grupo filtra el combo
 * de la pantalla y nada más. Se guarda igual porque sin él el selector es una trampa.
 *
 * `externalId` es el código del grupo ("1" / "2"), y es lo que guardan los tipos de servicio en su
 * campo `grupo`.
 */
export interface IArcaGrupoTipoServicio extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaGrupoTipoServicio: Model<IArcaGrupoTipoServicio>;
