import mongoose, { Schema, Document, Types } from "mongoose";

export interface ICalendarEvent extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  isAllDay: boolean;
  visibility: "private" | "team" | "company";
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const calendarEventSchema = new Schema<ICalendarEvent>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true, index: true },
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
  },
  { timestamps: true }
);

calendarEventSchema.index({ tenantId: 1, userId: 1, start: 1 });
calendarEventSchema.index({ tenantId: 1, visibility: 1, start: 1 });
calendarEventSchema.index({ tenantId: 1, start: 1, end: 1 });

export const CalendarEvent = mongoose.model<ICalendarEvent>("CalendarEvent", calendarEventSchema);
