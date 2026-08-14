import { Document, Model } from "mongoose";
export interface ICategoriaSat extends Document {
    externalId: string;
    name: string;
    data: {
        id: number;
        numeroCategoria: number;
        sueldoBruto: number;
        sueldoBrutoLetras: string;
        neto: number;
        sueldoNetoLetras: string;
        fechaActualizacion: Date | string;
        codigoAfip: number;
        /**
         * Código del Convenio Colectivo (CCT) al que pertenece esta categoría, con el formato del
         * nomenclador de ARCA ("0131/75"). NO va al TXT — el campo Convenio del registro de 130
         * (pos. 91-100) va en blanco a propósito, porque ARCA lo infiere del código de categoría.
         *
         * Sirve para VALIDAR: ARCA solo acepta categorías de los convenios que la empleadora tiene
         * habilitados, igual que solo acepta actividades declaradas para el domicilio. Con este campo,
         * el chequeo de completitud puede cruzar la categoría del contrato contra `companies.convenioIds`
         * y frenar una categoría de un convenio que esa empresa no tiene — un dato que hoy pasa todos
         * los controles y llega mal a ARCA.
         */
        convenio?: string;
        presentismo: number;
        sueldoBasico: number;
        sueldoAdicional: number;
        nombre: string;
    };
    createdAt: Date;
    updatedAt: Date;
}
export declare const CategoriaSat: Model<ICategoriaSat>;
