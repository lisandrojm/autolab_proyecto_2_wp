/**
 * GENERACIÓN Y ENVÍO AUTOMÁTICOS DE DOCUMENTOS (paso 3, 27/11/2026): lo que hacen los botones «Generar
 * todo y enviar a firmar» de la bandeja Generar Documentos, sin que nadie los apriete.
 *
 * Una corrida toma, del tenant, cada contrato que está en «Envío de documentación» (el estado al que
 * llegan solos el alta temprana archivada y la constancia de CUIT validada) y todavía no se envió a
 * firmar, decide con LA MISMA REGLA que la pantalla (`compartido/pendienteDeFirma.ts`) qué le falta,
 * genera el contrato y/o los releases con los MISMOS servicios que los botones
 * (`services/firmaDigital/documentos.ts`) y, con todo generado, lo manda a «Para Firmar» (Outbox).
 *
 * Lo que necesita una decisión de una persona —el proyecto tiene varias empresas y la fila no eligió,
 * un contrato custom sin texto, una plantilla vacía— no se toca: queda en la bandeja y se nombra en
 * el resumen de la corrida (`paraResolver`). Lo que falla al generar o al enviar queda también en la
 * bandeja, con su motivo (`errores`), y se vuelve a intentar en la corrida siguiente.
 *
 * Va de a uno: cada PDF lo arma un navegador en el server, y el reloj no tiene apuro.
 */
import { Types } from "mongoose";
import { ItemDeCorrida } from "./config.js";
export interface ResumenGeneracion {
    fecha: Date;
    /** Contratos en «Envío de documentación» sin enviar que se miraron. */
    revisados: number;
    /** A los que se les generó el contrato y/o los releases en esta corrida. */
    generados: number;
    /** Los que salieron a «Para Firmar». */
    enviados: number;
    /** Tipos que no mandan nada a firmar: no hay nada que hacer con ellos acá. */
    sinNadaQueFirmar: number;
    /** Necesitan una decisión de una persona: quedan en la bandeja. */
    paraResolver: ItemDeCorrida[];
    /** Fallaron al generar o al enviar: quedan en la bandeja y se reintentan. */
    errores: ItemDeCorrida[];
}
export declare function correrGeneracionDocumentos(tenantObjectId: Types.ObjectId, log?: (l: string) => void): Promise<ResumenGeneracion>;
