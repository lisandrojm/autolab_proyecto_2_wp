import mongoose, { Types } from "mongoose";
import { UserOrderBalance } from "../models/UserOrderBalance.js";

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
  const OrderModel = mongoose.models.Order || mongoose.model("Order");
  const lastOrder = (await OrderModel.findOne({ tenantId }).sort({ orderNumber: -1 }).select("orderNumber").lean().exec()) as any;

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

export function getOrderRemainingCost(o: any, category: any): number {
  if (category.categoryType !== "dinero") {
    return category.categoryType === "fecha" ? (o.daysRequested || 0) : 1;
  }

  const baseCost = o.amount || 0;

  // Enforce that pending orders don't have installments subtracted yet
  const isApproved = o.status === "delivered" || o.signatureStatus === "signed" || (o.status === "approved" && (o.signatureStatus === "not_required" || !o.signatureStatus));
  if (!isApproved) {
    return baseCost;
  }

  // Find installments configuration
  let inst = o.installments;
  let resetOnPaid = true;

  if (!inst) {
    if (o.subcategories && o.subcategories.length > 0 && category.config?.subtipos) {
      const subId = o.subcategories[0];
      const subtype = category.config.subtipos.find((st: any) => st.id === subId);
      if (subtype?.repayment?.installments) {
        inst = subtype.repayment.installments;
        resetOnPaid = subtype.repayment.resetOnPaid ?? true;
      }
    }
    if (!inst && category.config?.repayment?.installments) {
      inst = category.config.repayment.installments;
      resetOnPaid = category.config.repayment.resetOnPaid ?? true;
    }
  } else {
    // If installments is explicitly set on the order, we check category for resetOnPaid
    if (o.subcategories && o.subcategories.length > 0 && category.config?.subtipos) {
      const subId = o.subcategories[0];
      const subtype = category.config.subtipos.find((st: any) => st.id === subId);
      if (subtype?.repayment) {
        resetOnPaid = subtype.repayment.resetOnPaid ?? true;
      }
    }
    if (category.config?.repayment) {
      resetOnPaid = category.config.repayment.resetOnPaid ?? true;
    }
  }

  if (!inst) {
    return baseCost;
  }

  const numInstallments = inst || 1;
  const baseDateStr = o.approvedAt || o.preApprovedAt || o.deliveredAt || o.requestedAt;

  if (!baseDateStr) {
    return baseCost;
  }

  const baseDate = new Date(baseDateStr);
  if (isNaN(baseDate.getTime())) {
    return baseCost;
  }

  const startYear = baseDate.getFullYear();
  const startMonth = baseDate.getMonth();

  let passedInst = 0;
  const now = new Date();
  for (let i = 0; i < numInstallments; i++) {
    const discountDate = new Date(startYear, startMonth + i + 1, 0); // last day of month
    discountDate.setHours(23, 59, 59, 999);
    if (discountDate.getTime() <= now.getTime()) {
      passedInst++;
    }
  }

  if (resetOnPaid) {
    const remainingFraction = Math.max(0, 1 - passedInst / numInstallments);
    return baseCost * remainingFraction;
  }

  return baseCost;
}

export async function recalculateUserOrderBalance(
  tenantId: any,
  userId: any,
  orderConfigId: any,
  year: number,
  subtypeId?: string
) {
  try {
    const overrideQuery: any = { tenantId, userId, orderConfigId, year };
    if (subtypeId) {
      overrideQuery.subtypeId = subtypeId;
    } else {
      overrideQuery.subtypeId = { $in: [null, undefined] };
    }

    const override = await UserOrderBalance.findOne(overrideQuery);
    if (!override) return;

    const Order = mongoose.models.Order || mongoose.model("Order");
    const startOfYear = new Date(year, 0, 1);
    const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);

    const orderFilter: any = {
      tenantId,
      userId,
      categoryId: orderConfigId,
      status: { $nin: ["rejected", "cancelled"] },
      requestedAt: { $gte: startOfYear, $lte: endOfYear }
    };
    if (subtypeId) {
      orderFilter.subcategories = subtypeId;
    }

    const orders = await Order.find(orderFilter).lean();

    const OrderConfig = mongoose.models.OrderConfig || mongoose.model("OrderConfig");
    const category = await OrderConfig.findById(orderConfigId).lean() as any;
    if (!category) {
      console.warn(`[ORDER BALANCE] Category not found: ${orderConfigId}`);
      return;
    }

    let taken = 0;
    let pending = 0;

    for (const o of orders) {
      const cost = getOrderRemainingCost(o, category);
      const isSigned = o.signatureStatus === "signed";
      const isDelivered = o.status === "delivered";

      if (isDelivered || isSigned || (o.status === "approved" && (o.signatureStatus === "not_required" || !o.signatureStatus))) {
        taken += cost;
      } else {
        pending += cost;
      }
    }

    override.taken = taken;
    override.pending = pending;
    if (override.totalAnnual !== undefined) {
      override.available = Math.max(0, override.totalAnnual - taken - pending);
    } else {
      override.available = undefined;
    }
    await override.save();
    console.log(`[ORDER BALANCE] Recalculated for user ${userId}, year ${year}, category ${orderConfigId}, subtype ${subtypeId}: categoryType=${category.categoryType}, taken=${taken}, pending=${pending}, available=${override.available}`);
  } catch (error) {
    console.error("Error recalculating user order balance:", error);
  }
}


