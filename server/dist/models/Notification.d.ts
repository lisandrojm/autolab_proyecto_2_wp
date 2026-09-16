import mongoose, { Document, Types } from "mongoose";
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
export declare const Notification: mongoose.Model<INotification, {}, {}, {}, mongoose.Document<unknown, {}, INotification, {}, {}> & INotification & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
