import mongoose, { Schema } from "mongoose";
const notificationSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    linkUrl: { type: String, trim: true },
    isRead: { type: Boolean, default: false, index: true },
    readAt: { type: Date },
}, { timestamps: true });
notificationSchema.index({ tenantId: 1, userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ tenantId: 1, userId: 1, type: 1 });
export const Notification = mongoose.model("Notification", notificationSchema);
