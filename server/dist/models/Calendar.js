import mongoose, { Schema } from "mongoose";
const calendarSchema = new Schema({
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    start: { type: Date, required: true, index: true },
    end: { type: Date, required: true },
    isAllDay: { type: Boolean, default: false },
    visibility: {
        type: String,
        enum: ["private", "team", "company"],
        default: "private",
        index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, collection: "calendar" });
calendarSchema.index({ tenantId: 1, userId: 1, start: 1 });
calendarSchema.index({ tenantId: 1, visibility: 1, start: 1 });
calendarSchema.index({ tenantId: 1, start: 1, end: 1 });
export const Calendar = mongoose.model("Calendar", calendarSchema);
