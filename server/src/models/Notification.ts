import mongoose, { Schema, Document, Types } from "mongoose";

export interface INotification extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  type: string;
  title: string;
  message: string;
  linkUrl?: string;
  /**
   * DE QUÉ HABLA EL AVISO: la persona que se registró, la solicitud que entró.
   *
   * Sin esto un aviso era sólo un texto: se podían marcar todos como leídos o ninguno, porque no había
   * forma de saber qué fila de la lista le corresponde. Con la referencia, la fila puede mostrarse como
   * nueva y marcarse leída sola.
   */
  refId?: Types.ObjectId;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    linkUrl: { type: String, trim: true },
    refId: { type: Schema.Types.ObjectId },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
  },
  { timestamps: true }
);

notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, type: 1 });
// Marcar leído «esto de acá»: el aviso de una fila puntual de la lista.
notificationSchema.index({ tenantId: 1, userId: 1, refId: 1 });

export const Notification = mongoose.model<INotification>("Notification", notificationSchema);
