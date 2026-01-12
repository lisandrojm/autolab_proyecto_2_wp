import mongoose, { Types } from "mongoose";

export async function getNextReportNumber(tenantId: Types.ObjectId, prefix: string): Promise<string> {
  const ActivityReport = mongoose.model("ActivityReport");
  const lastReport = await ActivityReport.findOne({ tenantId }).sort({ reportNumber: -1 }).select("reportNumber").lean().exec();

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
