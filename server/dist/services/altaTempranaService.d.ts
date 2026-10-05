import { IUserProject } from "../models/UserProject.js";
/**
 * EL PDF DEL ALTA DE UN CONTRATO: validarlo, guardarlo y mandarlo a donde corresponde.
 *
 * Un solo camino para las dos entradas del PDF —la subida a mano y la descarga desde ARCA
 * (`arca/constanciasAltas.ts`)—, así las dos validan y rutean igual.
 *
 * SI ES EL ALTA TEMPRANA, SE VALIDA ANTES DE GUARDAR. El PDF tiene que ser la «Constancia del
 * trabajador» de ARCA, decir Alta, y traer el CUIL, el CUIT de la empleadora y la fecha de inicio de
 * ESTE contrato. ARCA entrega por la misma impresora la constancia de BAJA cuando la relación ya
 * terminó, y un PDF de otra persona con el nombre de este contrato saldría a firmar igual. Si no
 * coincide no se guarda, no se archiva y no se envía: se devuelve por qué.
 *
 * La subida a mano también recibe la Constancia de CUIT (contratos de Servicios): esos no se tocan.
 * Se valida cuando el contrato está en el trámite de alta temprana, o cuando el PDF ES una
 * constancia del trabajador (aunque el contrato ya haya avanzado de estado).
 *
 * POR DÓNDE SIGUE EL ALTA YA VALIDADA. Un archivo, un lugar:
 *
 *   · el tipo de contrato la manda a firmar → va YA al Outbox de HelloSign, sola, y queda marcada
 *     como enviada (`altaEnviadaAFirmarEl`): el envío del contrato no la vuelve a mandar;
 *   · el tipo de contrato no la firma → se archiva en «Alta temprana de Arca/No firmar».
 *
 * Las dos con la nomenclatura de Altas de ARCA. Y en los dos casos el alta ya está: el contrato pasa
 * al estado que la carpeta de altas alimenta («Envío de documentación»), sin esperar ninguna firma.
 * Se avanza acá y no por el proceso de carpetas porque ese solo lee la raíz de cada una, y porque la
 * que va al Outbox no pasa por la de altas. El proceso, a su vez, sabe que el alta en el Outbox no
 * es el contrato (`esElAltaEnviada`).
 */
export interface RuteoAlta {
    vaAFirma: boolean;
    /** El path de Dropbox donde quedó. Sin esto, no se subió (ver `aviso`). */
    archivadaEn?: string;
    aviso?: string;
    /** El estado al que pasó el contrato, si avanzó. */
    estado?: string;
}
export type ResultadoAlta = {
    ok: false;
    problemas: string[];
} | {
    ok: true;
    altaDocumentoUrl: string;
    altaDocumentoNombre: string;
    ruteo?: RuteoAlta;
};
export declare function registrarAltaDeContrato(o: {
    tenantObjectId: any;
    up: IUserProject;
    idx: number;
    userId: string;
    buffer: Buffer;
    /** El archivo YA guardado en el storage local (`/storage/...`) y el nombre con el que llegó. */
    altaDocumentoUrl: string;
    altaDocumentoNombre: string;
    /** La descarga desde ARCA solo trae constancias de alta temprana: se valida siempre. */
    exigirConstancia?: boolean;
}): Promise<ResultadoAlta>;
/** Guarda en el storage local un PDF que no llegó por formulario (la descarga desde ARCA). Devuelve su URL. */
export declare function guardarPdfDeAlta(o: {
    tenantCarpeta: string;
    userId: string;
    buffer: Buffer;
}): Promise<{
    url: string;
    ruta: string;
}>;
