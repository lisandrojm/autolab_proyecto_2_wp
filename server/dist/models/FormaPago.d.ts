import { Document, Model } from "mongoose";
/**
 * FORMA DE PAGO (Configuración → Formas de pago). Mismo formato que los catálogos simples (`name`,
 * `externalId`, `data`) para que la administre el mismo ABM que Entidades Financieras; el `externalId`
 * es el CÓDIGO («TRANSFERENCIA_BANCARIA»). Las reglas, en `compartido/formasPago.ts`.
 *
 * Global, como los tipos de contrato (`Contrato`) que la habilitan.
 */
export interface IFormaPago extends Document {
    name: string;
    externalId: string;
    data: {
        id?: number;
        nombre: string;
    };
    descripcion?: string;
    requiereDatosBancarios: boolean;
    requiereComprobante: boolean;
    /** Si se ofrece en los selectores. Inactiva NO se borra: los contratos que ya la tienen la conservan. */
    activo: boolean;
    /** Orden en los selectores (1, 2, 3…). */
    orden?: number | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const FormaPago: Model<IFormaPago>;
