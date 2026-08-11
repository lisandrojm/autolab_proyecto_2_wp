/**
 * `identidadTag`: bloque `CUIL-...[_DNI-...]` de `buildIdentidadTag()` (employeeDocData.ts), el mismo
 * que llevan los PDF de Firma Digital. Va en el nombre del archivo para poder identificar de quién es
 * el documento sin abrirlo (desde el mail o al listar la carpeta). Si la persona no tiene los datos
 * cargados llega vacío y el nombre queda como antes.
 */
export declare function savePdfToStorage(tenantId: string, userId: string, orderNumber: string, pdfBuffer: Buffer, identidadTag?: string): Promise<string>;
/** `identidadTag`: ver `savePdfToStorage`. */
export declare function savePdfVacationToStorage(tenantId: string, userId: string, vacationNumber: string, pdfBuffer: Buffer, identidadTag?: string): Promise<string>;
export declare function deletePdfFromStorage(pdfUrl: string): Promise<void>;
