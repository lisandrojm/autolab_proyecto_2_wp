import { Document, Model, Types } from "mongoose";
/**
 * ContratoFrame = la Plantilla: el documento PDF (contenido + membrete) de un Contrato.
 * `contratoId` apunta al Contrato (colección `contratos`) que define el tipo real (jornadas,
 * multiplicador, tiempo indeterminado). Los campos de `data` se mantienen sincronizados con los
 * del Contrato elegido (se copian al guardar) para que el resto del código, que ya lee
 * `data.cantidadJornadas` / `data.esTiempoIndeterminado` de la Plantilla, siga funcionando igual.
 */
export interface IContratoFrame extends Document {
    externalId: string;
    name: string;
    /** Contenido del contrato redactado en la plataforma (HTML del editor, con variables `{{variable}}`). */
    content: string;
    /**
     * LOS TIPOS DE CONTRATO QUE USAN ESTA PLANTILLA. Una plantilla puede servir a varios («Plazo fijo
     * 5x7» y «Plazo fijo 6x6» con el mismo texto). Para saber si una plantilla es de un tipo se pregunta
     * por esta lista (ver `contratosDePlantilla` en el front).
     */
    contratoIds?: Types.ObjectId[];
    /**
     * El PRINCIPAL: siempre el primero de `contratoIds`. Se mantiene para todo lo que lee uno solo (el
     * `populate` que trae `requiereFirma`, la copia de `data`, el backfill, los scripts). Mismo patrón
     * que `sedeId` / `sedeIds` del proyecto.
     */
    contratoId?: Types.ObjectId;
    data: {
        id: number;
        nombre: string;
        cantidadJornadas: number;
        multiplicadorDiario: number;
        esTiempoIndeterminado: boolean;
    };
    /** Si el contrato lleva membrete (logo + encabezado de empresa) y firma al generar el PDF. */
    usaMembrete: boolean;
    /** Contrato activo/inactivo (para habilitarlo o no en el catálogo). */
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ContratoFrame: Model<IContratoFrame>;
