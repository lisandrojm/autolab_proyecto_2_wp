export declare function savePdfToStorage(tenantId: string, userId: string, orderNumber: string, pdfBuffer: Buffer): Promise<string>;
export declare function savePdfVacationToStorage(tenantId: string, userId: string, vacationNumber: string, pdfBuffer: Buffer): Promise<string>;
export declare function deletePdfFromStorage(pdfUrl: string): Promise<void>;
