import mongoose, { Schema, Document, Types } from "mongoose";

export interface IArea extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  isSystem: boolean;
  /**
   * LOS ROLES EMPRESA QUE TRABAJAN EN ESTA ÁREA (pedido del 18/10/2026). Un rol puede estar en varias
   * áreas (un Asistente está en Técnica y en Postproducción); lo que importa es que TODO rol esté en
   * alguna: así, al pedir un contrato desde la app, se ofrecen sólo las áreas (y turnos) donde ese rol
   * existe, y no la lista entera. `GET /areas/roles-sin-area` dice cuáles faltan.
   */
  rolesFrame: Types.ObjectId[];
  vacationConfig?: {

    useGlobalConfig: boolean;
    permiteFraccionadas: boolean;
    minDiasFraccion?: number;
    diasCorridos?: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const areaSchema = new Schema<IArea>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    isSystem: { type: Boolean, default: false },
    rolesFrame: [{ type: Schema.Types.ObjectId, ref: "RoleFrame" }],
    vacationConfig: {

      useGlobalConfig: { type: Boolean, default: true },
      permiteFraccionadas: { type: Boolean, default: true },
      minDiasFraccion: { type: Number },
      diasCorridos: { type: Boolean },
    },
  },
  { timestamps: true }
);

areaSchema.index({ tenantId: 1, name: 1 }, { unique: true });
areaSchema.index({ tenantId: 1, rolesFrame: 1 });

export const Area = mongoose.model<IArea>("Area", areaSchema);
