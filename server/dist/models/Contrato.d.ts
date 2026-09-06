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
        /**
         * @deprecated NO se usa más para generar el TXT y ya no se edita desde el ABM.
         *
         * La actividad (pos. 79-84) es la del DOMICILIO de desempeño, no la del tipo de contrato: en el
         * padrón de ARCA cuelga de cada sucursal de cada CUIT. Mientras vivió acá, dos personas del mismo
         * tipo de contrato en sedes distintas salían con la misma actividad — un alta válida para ARCA
         * pero mal declarada, y sin ningún control que lo frenara. Ahora sale de la sucursal elegida en
         * el contrato: `companies.sucursalIds` → `ArcaSucursal.actividades[]` (con una sola actividad el
         * contrato la hereda; con varias, elige cuál declara en `contracts.actividadArca`).
         *
         * El campo se conserva para no perder lo ya cargado; se puede borrar en una limpieza posterior.
         */
        afipActividad?: string;
        afipModalidadLiquidacion?: string;
        /**
         * Si este tipo de contrato genera alta temprana ante ARCA.
         *
         * VACÍO NO ES LO MISMO QUE «NO CORRESPONDE», Y HOY SE VEN IGUAL. «Servicios» es una locación de
         * servicios: no es relación laboral, no lleva modalidad de contrato y no se declara. Sin este
         * campo queda con los tres códigos en blanco, indistinguible de un tipo al que le falta
         * cargarlos — así que figura como incompleto para siempre y alguien, tarde o temprano, va a
         * «completarlo» declarando ante el organismo una relación que no existe.
         *
         * `true` por defecto: la enorme mayoría de los tipos sí generan alta, y un default en `false`
         * haría desaparecer de la pestaña de altas a cualquier tipo nuevo sin que nadie lo note.
         */
        generaAlta?: boolean;
    };
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Contrato: Model<IContrato>;
