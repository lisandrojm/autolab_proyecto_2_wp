import { Document, Model } from "mongoose";
/**
 * Tabla oficial de ARCA (Simplificación Registral): SITUACIÓN DE BAJA (el «motivo de la baja», 1 ó 2 díg.).
 *
 * La pide el formulario de Relaciones Laborales → Modificaciones y Bajas → Registrar baja (`RegistraBaja.aspx`,
 * autocompletar `PredictCodeSitB`, que lee `window.l_SBV`). Es también lo que el TXT de Carga Masiva lleva en
 * las posiciones 46-47 y lo que Consultas muestra como «SITUACION De BAJA» en texto. El código se guarda tal
 * cual lo publica ARCA («0», «7», «21», «99»): sin ceros agregados, porque así viaja en el formulario.
 *
 * Se siembra desde el fixture relevado (`src/scripts/sembrarSituacionesBajaArca.ts`); una lectura nueva de la
 * pantalla lo actualiza sin borrar lo que ya no esté (puede haber contratos históricos que lo usen).
 */
export interface IArcaSituacionBaja extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaSituacionBaja: Model<IArcaSituacionBaja>;
