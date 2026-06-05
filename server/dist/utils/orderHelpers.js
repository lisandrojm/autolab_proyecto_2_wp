import mongoose from "mongoose";
import { UserOrderBalance } from "../models/UserOrderBalance.js";
export function getPlainOrderNumber(orderNumber) {
    if (!orderNumber)
        return "";
    if (orderNumber.includes("-")) {
        const parts = orderNumber.split("-");
        return parts[parts.length - 1];
    }
    return orderNumber;
}
export function getFormattedOrderNumber(orderNumber) {
    const plain = getPlainOrderNumber(orderNumber);
    return plain ? `#${plain}` : "";
}
export async function getNextOrderNumber(tenantId, prefix) {
    const OrderModel = mongoose.models.Order || mongoose.model("Order");
    const lastOrder = (await OrderModel.findOne({ tenantId }).sort({ orderNumber: -1 }).select("orderNumber").lean().exec());
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
export async function recalculateUserOrderBalance(tenantId, userId, orderConfigId, year, subtypeId) {
    try {
        const overrideQuery = { tenantId, userId, orderConfigId, year };
        if (subtypeId) {
            overrideQuery.subtypeId = subtypeId;
        }
        else {
            overrideQuery.subtypeId = { $in: [null, undefined] };
        }
        const override = await UserOrderBalance.findOne(overrideQuery);
        if (!override)
            return;
        const Order = mongoose.models.Order || mongoose.model("Order");
        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year, 11, 31, 23, 59, 59, 999);
        const orderFilter = {
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
        let taken = 0;
        let pending = 0;
        for (const o of orders) {
            const isSigned = o.signatureStatus === "signed";
            const isDelivered = o.status === "delivered";
            if (isDelivered || isSigned || (o.status === "approved" && (o.signatureStatus === "not_required" || !o.signatureStatus))) {
                taken += o.daysRequested || 0;
            }
            else {
                pending += o.daysRequested || 0;
            }
        }
        override.taken = taken;
        override.pending = pending;
        override.available = Math.max(0, (override.totalAnnual ?? 0) - taken - pending);
        await override.save();
        console.log(`[ORDER BALANCE] Recalculated for user ${userId}, year ${year}, category ${orderConfigId}, subtype ${subtypeId}: taken=${taken}, pending=${pending}, available=${override.available}`);
    }
    catch (error) {
        console.error("Error recalculating user order balance:", error);
    }
}
