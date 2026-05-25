import { IOrder } from "../models/Order.js";
import { IOrderConfig } from "../models/OrderConfig.js";
import { IUser } from "../models/User.js";
import { IVacation } from "../models/Vacation.js";
interface PdfVariables {
    categoria: string;
    subcategoria: string;
    monto: string;
    fechaDesde: string;
    fechaHasta: string;
    fechaUnica: string;
    dias: string;
    nombreCompleto: string;
    nombreUsuario: string;
    numeroPedido: string;
    fechaSolicitud: string;
    fechaAprobacion: string;
    tenantName: string;
    descripcion: string;
    [key: string]: string;
}
export declare function sanitizeHtml(str: string): string;
export declare function prepareVariables(order: IOrder, category: IOrderConfig, user: IUser, tenantName: string): Record<string, string>;
export declare function prepareVacationVariables(vacation: IVacation, user: IUser, tenantName: string, vacationNumber: string): PdfVariables;
export declare function replacePdfVariables(htmlTemplate: string, variables: Record<string, string>): string;
export declare function getSystemVariables(config: any): Record<string, string>;
export declare function getDummyVariables(code: string): Record<string, string>;
export {};
