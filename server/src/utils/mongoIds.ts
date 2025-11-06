import { Types } from "mongoose";

export function toObjectIdArray(input: unknown): Types.ObjectId[] {
  const arr = Array.isArray(input) ? input : (input == null ? [] : [input]);
  return arr
    .map(v => (v == null ? "" : String(v)))
    .filter(s => Types.ObjectId.isValid(s))
    .map(s => new Types.ObjectId(s));
}

export function toObjectIdOrNull(input: unknown): Types.ObjectId | null {
  if (input == null) return null;
  const s = String(input);
  return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : null;
}
