import mongoose, { Types } from "mongoose";
import type { IRequestActivityReport } from "../models/RequestActivityReport.js";

export async function getNextReportNumber(tenantId: Types.ObjectId, prefix: string): Promise<string> {
  const RequestActivityReport = mongoose.model<IRequestActivityReport>("RequestActivityReport");
  const lastReport = await RequestActivityReport.findOne({ tenantId }).sort({ reportNumber: -1 }).select("reportNumber").lean().exec();

  let nextSequence = 1;

  if (lastReport?.reportNumber) {
    // Expected format: PRE-REG-000001
    const match = lastReport.reportNumber.match(/-REG-(\d+)$/);
    if (match) {
      const currentMax = parseInt(match[1], 10);
      nextSequence = currentMax + 1;
    }
  }

  const paddedNumber = nextSequence.toString().padStart(6, "0");
  return `${prefix}-REG-${paddedNumber}`;
}
