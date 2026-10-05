/**
 * Rellena una plantilla .docx reemplazando las variables `{variable}` por los
 * valores del objeto `data`. Las variables no presentes en `data` se reemplazan
 * por una cadena vacía (nullGetter), de modo que el render nunca falla por
 * placeholders desconocidos.
 */
export declare function fillDocxTemplate(content: Buffer, data: Record<string, any>): Buffer;
/** Formatea una fecha (ISO o dd/mm/yyyy) a dd/mm/yyyy. Devuelve "" si es inválida. */
export declare function formatDateAr(s?: string | Date | null): string;
