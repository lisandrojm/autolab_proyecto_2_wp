import mongoose, { Schema, Document, Types } from "mongoose";

export interface IUserProfile extends Document {
  tenantId: Types.ObjectId;
  userId: Types.ObjectId;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  position?: string;
  department?: string;
  hireDate?: Date;
  birthDate?: Date;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
  profilePhotoUrl?: string;
  vacationPolicy: {
    annualDays: number;
    carryOverDays: number;
  };
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userProfileSchema = new Schema<IUserProfile>(
  {
    tenantId: { type: Schema.Types.ObjectId, ref: "Tenant", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    position: { type: String, trim: true },
    department: { type: String, trim: true },
    hireDate: { type: Date },
    birthDate: { type: Date },
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      country: { type: String, trim: true },
      zip: { type: String, trim: true },
    },
    profilePhotoUrl: { type: String, trim: true },
    vacationPolicy: {
      annualDays: { type: Number, default: 20, min: 0 },
      carryOverDays: { type: Number, default: 0, min: 0 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "users_profiles" },
);

userProfileSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
userProfileSchema.index({ tenantId: 1, email: 1 });
userProfileSchema.index({ tenantId: 1, department: 1 });

export const UserProfile = mongoose.model<IUserProfile>("UserProfile", userProfileSchema);
