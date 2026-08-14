import { Document, Model } from "mongoose";
/**
 * Sucursal / domicilio de desempeño del padrón de ARCA (Simplificación Registral).
 *
 * NO es una Sede: la Sede es el lugar de trabajo con el que opera el sistema (proyectos, personas,
 * contratos) y tiene nombres de uso interno. La Sucursal es una entidad del padrón de ARCA, con su
 * código, su domicilio tal como está declarado y sus actividades. Son cosas distintas y se cargan
 * por separado.
 *
 * Las empresas no cargan estos datos: solo eligen cuáles de estas sucursales les corresponden
 * (`companies.sucursalIds`). El mismo domicilio declarado por dos empleadoras se carga como dos
 * sucursales distintas, porque el código sale del padrón de cada CUIT.
 */
export interface IArcaSucursal extends Document {
    /** Código de sucursal (5 díg., con ceros a la izquierda). Pos. 74-78 del TXT de alta. */
    codigo: string;
    /** Domicilio tal como figura en el padrón, ej. "ZAPIOLA 392". */
    domicilio: string;
    localidad?: string;
    codigoPostal?: string;
    /**
     * Actividades declaradas para este domicilio (pos. 79-84 del TXT). ARCA admite más de una: con
     * una sola, el contrato la hereda; con varias, el contrato elige cuál declara.
     */
    actividades: Array<{
        /** Código de actividad (6 díg.). */
        codigo: string;
        descripcion?: string;
    }>;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ArcaSucursal: Model<IArcaSucursal>;
