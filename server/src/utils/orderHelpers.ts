import { Types, model, models } from "mongoose";

export function getPlainOrderNumber(orderNumber: string | undefined | null): string {
  if (!orderNumber) return "";
  if (orderNumber.includes("-")) {
    const parts = orderNumber.split("-");
    return parts[parts.length - 1];
  }
  return orderNumber;
}

export function getFormattedOrderNumber(orderNumber: string | undefined | null): string {
  const plain = getPlainOrderNumber(orderNumber);
  return plain ? `#${plain}` : "";
}

export async function getNextOrderNumber(tenantId: Types.ObjectId, prefix: string): Promise<string> {
  const OrderModel = models.Order || model("Order");
  const lastOrder = await OrderModel.findOne({ tenantId }).sort({ orderNumber: -1 }).select("orderNumber").lean().exec();

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
