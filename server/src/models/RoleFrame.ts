import mongoose, { Schema, Document, Model } from "mongoose";

interface ICategoriaSat {
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

const roleFrameSchema = new Schema<IRoleFrame>(
  {
    externalId: { type: String, required: true },
    data: {
      rol: {
        id: { type: Number },
        nombre: { type: String },
      },
      categoriasSat: [
        {
          id: { type: Number },
          numeroCategoria: { type: Number },
          sueldoBruto: { type: Number },
          sueldoBrutoLetras: { type: String },
          neto: { type: Number },
          sueldoNetoLetras: { type: String },
          fechaActualizacion: { type: Schema.Types.Mixed },
          codigoAfip: { type: Number },
          presentismo: { type: Number },
          sueldoBasico: { type: Number },
          sueldoAdicional: { type: Number },
          nombre: { type: String },
        },
      ],
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
  },
);

export const RoleFrame: Model<IRoleFrame> = mongoose.model<IRoleFrame>("RoleFrame", roleFrameSchema, "roles_frame");
