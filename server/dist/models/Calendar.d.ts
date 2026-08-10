import mongoose, { Document, Types } from "mongoose";
export interface ICalendar extends Document {
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
export declare const Calendar: mongoose.Model<ICalendar, {}, {}, {}, mongoose.Document<unknown, {}, ICalendar, {}, {}> & ICalendar & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
