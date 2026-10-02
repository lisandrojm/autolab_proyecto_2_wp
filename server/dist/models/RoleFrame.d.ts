import mongoose, { Document, Model } from "mongoose";
interface ICategoriaSat {
    /**
     * La VALORACIÓN de esta categoría DENTRO DE ESTA FUNCIÓN (Plata, Oro…).
     *
     * Vive en la asociación y no en el catálogo `categorias` porque el mismo código de ARCA puede ser
     * Oro en una función y Plata en otra: lo que cambia es lo que la productora paga por ese puesto,
     * no la categoría del convenio.
     *
     * OPCIONAL: ausente = «sin valorar», y el filtro de contratación no se aplica (modo permisivo).
     * Es lo que permite desplegar esto sin frenar la contratación mientras se cargan las valoraciones.
     */
    valoracionId?: mongoose.Types.ObjectId | null;
    id: number;
    numeroCategoria: number;
    sueldoBruto: number;
    sueldoBrutoLetras: string;
    neto: number;
    sueldoNetoLetras: string;
    fechaActualizacion: string | Date;
    codigoAfip: number;
    presentismo: number;
    sueldoBasico: number;
    sueldoAdicional: number;
    nombre: string;
}
export interface IRoleFrame extends Document {
    externalId: string;
    data: {
        rol: {
            id: number;
            nombre: string;
        };
        categoriasSat: ICategoriaSat[];
        /**
         * PUESTO DESEMPEÑADO de ARCA (4 díg.) de esta función: el registro de 85 de Altas Masivas lo exige.
         * Es el primer escalón de la resolución (función → categoría → empresa → instalación, ver
         * `compartido/puestosDesempenados.ts`). Código del catálogo `arca-puestos-desempenados`. Opcional.
         */
        puestoDesempenado?: string;
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RoleFrame: Model<IRoleFrame>;
export {};
