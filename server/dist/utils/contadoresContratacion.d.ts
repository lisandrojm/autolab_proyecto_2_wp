/**
 * LOS NÚMEROS DE LAS BANDEJAS DE CONTRATACIÓN QUE VIVEN EN LA BASE (11/11/2026): Trámite impositivo
 * (Alta temprana de ARCA / Constancia de CUIT / Sin CUIT) y Generar documentos.
 *
 * El menú lateral los muestra sin entrar a la bandeja, así que tienen que dar LO MISMO que la pantalla.
 * La regla es la de `contracts-overview` con `estados` más el corte de `ContractBulkAfipTab`:
 *
 *  · Sólo contratos creados en WeProdu (Solicitudes o «Agregar miembro»).
 *  · De cada vínculo, el contrato que rige y los que arrancaron hace hasta `DIAS_ATRAS_BANDEJA` días
 *    (o arrancan más adelante): los viejos que quedaron en un estado de trámite no son trabajo pendiente.
 *  · Quien no tiene CUIT va a «Sin CUIT», cualquiera sea el trámite de su estado, y no se cuenta en los otros dos.
 *  · Generar documentos: los que están en el estado de envío de documentación y todavía no se enviaron a firmar.
 *
 * Puro, para probarlo sin base.
 */
export declare const DIAS_ATRAS_BANDEJA = 90;
export interface ContratoParaContar {
    fecha_alta_contrato?: string;
    fecha_baja_contrato?: string;
    fecha_carga?: string;
    nombre_estado_empleado?: string | null;
    delSistema?: boolean;
    firmaEnviadaAt?: unknown;
}
export interface VinculoParaContar {
    userId: string;
    contracts: ContratoParaContar[];
}
export interface ContadoresDeLaBase {
    alta: number;
    cuit: number;
    sinCuit: number;
    generarDocumentos: number;
}
/** Sin CUIT: marcado, vacío o todo el mismo dígito (como `noPoseeCuit` de la pantalla). */
export declare const noPoseeCuit: (cuit: unknown, sinCuit: unknown) => boolean;
export declare function contarBandejasDeLaBase(vinculos: VinculoParaContar[], opciones: {
    /** Los estados impositivos del ABM con su trámite (`data.tipoImpositivo`). */
    estadosImpositivos: {
        name: string;
        tipoImpositivo?: string | null;
    }[];
    /** El estado que alimenta Generar documentos (envío de documentación). Sin él, esa bandeja da 0. */
    estadoEnvio?: string | null;
    /** userId → sin CUIT. Quien no está en el mapa se cuenta como sin CUIT (no hay dato). */
    sinCuitDe: (userId: string) => boolean;
    hoy?: string;
}): ContadoresDeLaBase;
