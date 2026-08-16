import { Document, Model } from "mongoose";
/**
 * Convenio Colectivo de Trabajo (CCT) del nomenclador de AFIP/ARCA — Simplificación Registral.
 *
 * Sigue la forma de los catálogos simples de FRAME, con estos nombres de dominio:
 *   externalId → código CCT, con el formato "NNNN/AA" (ej. "0130/75"). NO es numérico: lleva barra
 *                y ceros a la izquierda, así que se guarda tal cual como string y `data.id` queda
 *                vacío (a diferencia de Obras Sociales, donde el RNOS sí es un número).
 *   name       → descripción de la actividad.
 *   signatario → descripción de los signatarios del convenio.
 */
export interface IConvenio extends Document {
    externalId: string;
    name: string;
    signatario?: string;
    /**
     * Obra social que le corresponde a quien trabaja bajo este convenio. Guarda el `data.id` del
     * catálogo de Obras Sociales (el RNOS numérico), igual que `osId` en el contrato.
     *
     * **Cuelga del convenio y no de la empleadora porque así funciona en la Argentina**: la obra social
     * la define el sindicato, y al sindicato lo define el CCT. Quien está bajo el convenio de
     * televisión aporta a la O.S. del Personal de Televisión, sin importar qué productora lo contrate.
     *
     * Vacío = el convenio no tiene obra social sindical. El caso real es "9999/99 — EXCLUIDO DE
     * CONVENIO", que por definición no tiene sindicato: ahí manda la default de la empleadora.
     */
    obraSocialDefaultId?: number;
    data: {
        id?: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const Convenio: Model<IConvenio>;
