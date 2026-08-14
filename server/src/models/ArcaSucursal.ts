import mongoose, { Schema, Document, Model } from "mongoose";

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
   * Actividades declaradas para ESTE domicilio (pos. 79-84 del TXT). ARCA admite más de una: con
   * una sola, el contrato la hereda; con varias, el contrato elige cuál declara.
   *
   * NO hacer un ABM global de Actividades. Son subentidad de la sucursal a propósito:
   *
   *  - ARCA solo acepta las actividades declaradas en el padrón para ese domicilio. Un código
   *    válido en otra sucursal es rechazado acá.
   *  - La propia pantalla de alta de ARCA no expone una lista global: el combo se arma con
   *    `l_ActDom`, filtrado por el código de sucursal elegido.
   *  - Un selector global dejaría elegir códigos que ARCA rechaza para esa sede — el mismo tipo de
   *    error silencioso que motivó sacar la actividad del Tipo de Contrato.
   *
   * Se cargan por extracción desde ARCA, logueado con cada CUIT (ver el script de migración y el
   * método de extracción por consola documentado con el CSV del padrón).
   *
   * Pendiente opcional y de baja prioridad: una tabla diccionario `codigo → descripcion`, SOLO para
   * normalizar los textos (no para elegir).
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

const arcaSucursalSchema = new Schema<IArcaSucursal>(
  {
    codigo: { type: String, required: true },
    domicilio: { type: String, required: true },
    localidad: { type: String, default: "" },
    codigoPostal: { type: String, default: "" },
    actividades: [
      {
        _id: false,
        codigo: { type: String, required: true },
        descripcion: { type: String, default: "" },
      },
    ],
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    collection: "arca-sucursales",
  }
);

export const ArcaSucursal: Model<IArcaSucursal> = mongoose.model<IArcaSucursal>("ArcaSucursal", arcaSucursalSchema);
