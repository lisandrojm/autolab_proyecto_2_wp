import { Order } from "../models/Order.js";
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
    const lastOrder = await Order.findOne({ tenantId }).sort({ orderNumber: -1 }).select("orderNumber").lean().exec();
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
