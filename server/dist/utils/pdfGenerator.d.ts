import { IOrder } from "../models/Order.js";
import { IOrderConfig } from "../models/OrderConfig.js";
import { IPdf } from "../models/Pdf.js";
import { IUser } from "../models/User.js";
import { IVacation } from "../models/Vacation.js";
export declare function generatePreviewPDF(content: string, code: string, tenantId: string, isGlobalPreview?: boolean, title?: string, pdfText?: string, usaMembrete?: boolean): Promise<Buffer>;
interface GeneratePdfResult {
    pdfUrl: string;
    success: boolean;
    error?: string;
}
export declare function generateOrderPDF(order: IOrder, category: IOrderConfig, template: IPdf, user: IUser, tenantId: string, tenantName: string): Promise<GeneratePdfResult>;
export declare function generateVacationPDF(vacation: IVacation, template: IPdf, user: IUser, tenantId: string, tenantName: string, vacationNumber: string): Promise<GeneratePdfResult>;
export {};
