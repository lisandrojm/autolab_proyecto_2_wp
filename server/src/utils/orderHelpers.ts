import { Order } from "../models/Order.js";
import { Types } from "mongoose";

export function getPlainOrderNumber(orderNumber: string | undefined | null): string {
  if (!orderNumber) return "";
  return orderNumber.includes("-")
    ? orderNumber.split("-")[1]
    : orderNumber;
}

export function getFormattedOrderNumber(orderNumber: string | undefined | null): string {
  const plain = getPlainOrderNumber(orderNumber);
  return plain ? `#${plain}` : "";
}

export async function getNextOrderNumber(tenantId: Types.ObjectId, prefix: string): Promise<string> {
  const lastOrder = await Order.findOne({ tenantId })
    .sort({ orderNumber: -1 })
    .select("orderNumber")
    .lean()
    .exec();

  let nextSequence = 1;

  if (lastOrder?.orderNumber) {
    const match = lastOrder.orderNumber.match(/-ORD-(\d+)$/);
    if (match) {
      const currentMax = parseInt(match[1], 10);
      nextSequence = currentMax + 1;
    }
  }

  const paddedNumber = nextSequence.toString().padStart(6, "0");
  return `${prefix}-ORD-${paddedNumber}`;
}
