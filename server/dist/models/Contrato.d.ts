import { Document, Model } from "mongoose";
/**
 * Contrato: el tipo de contrato real (Jornada, Plazo fijo 5x7, Tiempo Indeterminado, ...), con su
 * configuración de jornadas/multiplicador/vigencia. Es la unidad que se elige en el wizard de
 * Agregar/Configurar miembro.
 *
 * Distinto de `ContratoFrame` (la Plantilla): la Plantilla es el documento PDF en sí (contenido +
 * membrete) y apunta a un Contrato vía `contratoId`. Un Contrato puede tener varias Plantillas
 * (por ejemplo variantes con/sin membrete, o por empresa); el wizard resuelve cuál usar.
 */
export interface IContrato extends Document {
    name: string;
    data: {
        cantidadJornadas: number;
        multiplicadorDiario: number;
        esTiempoIndeterminado: boolean;
        /** Si al firmar el contrato el documento se envía a firmar (p. ej. por Dropbox Sign). */
        requiereFirma: boolean;
        /**
         * Códigos AFIP para la generación del TXT de Alta masiva. Son específicos del convenio/modalidad,
         * por eso se cargan por Tipo de Contrato. Se guardan como string para conservar ceros a la izquierda.
         */
        afipModalidadContrato?: string;
        afipTipoServicio?: string;
        afipActividad?: string;
        afipModalidadLiquidacion?: string;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Contrato: Model<IContrato>;
