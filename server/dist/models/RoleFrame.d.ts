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
    };
    name: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const RoleFrame: Model<IRoleFrame>;
export {};
