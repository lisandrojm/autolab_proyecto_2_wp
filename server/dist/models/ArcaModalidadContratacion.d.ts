import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): modalidad de contratación.
 *
 * Es un nomenclador del organismo, no un dato del negocio: se siembra desde el CSV extraído de la
 * pantalla de alta individual de ARCA (`src/scripts/seedTablasArca.ts`) y se edita a mano solo si
 * ARCA la actualiza. Sigue la forma de los demás catálogos simples para poder reusar el ABM genérico.
 *
 * `externalId` es el CÓDIGO tal cual lo espera el TXT (3 díg., pos. 17-19 del TXT de alta), con sus ceros a la izquierda.
 * Se guarda como string justamente para no perderlos.
 */
export interface IArcaModalidadContratacion extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaModalidadContratacion: Model<IArcaModalidadContratacion>;
