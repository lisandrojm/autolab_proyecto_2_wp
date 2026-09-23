import mongoose, { Schema, Document, Types, Model } from "mongoose";

export interface IActivityLogGeneralConfig extends Document {
  tenantId: Types.ObjectId;
  /** Cuántos días hacia atrás se puede CARGAR una novedad. */
  allowedPastDays: number;
  /**
   * Cuántos días hacia atrás se puede EDITAR una novedad ya cargada.
   *
   * Es otra decisión que la de cargar y por eso es otro campo: la ventana de carga la fija la
   * operación —hasta cuándo tiene sentido registrar un día— y la de edición, el control: hasta cuándo
   * se acepta que un parte enviado cambie. Estaba clavada en 2 días dentro de la pantalla del móvil,
   * así que el default es 2: quien no toque nada sigue teniendo exactamente lo de antes.
   */
  allowedEditPastDays: number;
  createdAt: Date;
  updatedAt: Date;
}

interface IActivityLogGeneralConfigModel extends Model<IActivityLogGeneralConfig> {
  getOrCreateDefault(tenantId: Types.ObjectId): Promise<IActivityLogGeneralConfig>;
}

const ActivityLogGeneralConfigSchema = new Schema<IActivityLogGeneralConfig>(
  {
    tenantId: {
      type: Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      unique: true,
      index: true,
    },
    allowedPastDays: {
      type: Number,
      default: 3,
    },
    allowedEditPastDays: {
      type: Number,
      default: 2,
    },
  },
  {
    timestamps: true,
    collection: "activity_log_general_configs",
  },
);

ActivityLogGeneralConfigSchema.statics.getOrCreateDefault = async function (tenantId: Types.ObjectId) {
  let config = await this.findOne({ tenantId });

  if (!config) {
    config = await this.create({
      tenantId,
      allowedPastDays: 3,
      allowedEditPastDays: 2,
    });
  }

  return config;
};

export const ActivityLogGeneralConfig = mongoose.model<IActivityLogGeneralConfig, IActivityLogGeneralConfigModel>(
  "ActivityLogGeneralConfig",
  ActivityLogGeneralConfigSchema,
);
