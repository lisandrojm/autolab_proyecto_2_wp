import mongoose, { Schema, Document, Types } from "mongoose";

export interface ILevel extends Document {
  tenantId: Types.ObjectId;
  name: string;
  description?: string;
  type: "general" | "position-specific";
  positionId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const levelSchema = new Schema<ILevel>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: {
      type: String,
      enum: ["general", "position-specific"],
      required: true,
      default: "general"
    },
    positionId: {
      type: Schema.Types.ObjectId,
      ref: "Position",
      required: false
    },
  },
  { timestamps: true }
);

levelSchema.index({ tenantId: 1, name: 1, positionId: 1 }, { unique: true });

levelSchema.pre("validate", function(next) {
  if (this.type === "position-specific" && !this.positionId) {
    next(new Error("positionId es requerido cuando el tipo es 'position-specific'"));
  } else {
    next();
  }
});

export const Level = mongoose.model<ILevel>("Level", levelSchema);
