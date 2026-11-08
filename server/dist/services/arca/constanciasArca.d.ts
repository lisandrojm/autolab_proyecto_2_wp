import { IConstanciaArca } from "../../models/ConstanciaArca.js";
import { type CarpetaDelDocumento, type CategoriaConstancia, type EstadoConstancia, type Fallo, type FueraDeLaCorrida, type Intento, type Redescarga } from "./cicloConstancia.js";
import { getTenantDropboxConfig } from "../dropboxService.js";
/**
 * La huella de una constancia de alta por su NOMBRE: CUIL|fecha de alta|CUIT de la empleadora. Sólo
 * para nombres de constancias de alta (AltaAFIP / AltaArca) que traen las tres cosas; si no, "". Puro.
 */
export declare function huellaDelNombre(nombre: string): string;
/** La misma huella, de una fila de `constancias_arca`. Puro. */
export declare const huellaDe: (d: {
    cuil: string;
    fechaAlta: string;
    empresaCuit: string;
}) => string;
/** La subcarpeta de «Alta temprana de Arca» donde se archiva la constancia firmada (la raíz la lee el escaneo de estados). */
export declare const SUBCARPETA_FIRMADAS = "Firmadas";
/** Lo que una presentación ya tiene dicho en el contrato, como fila de `constancias_arca` (sin `_id`). */
export interface FilaConstancia {
    clave: string;
    cuil: string;
    nombre: string;
    userId: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    empresaCuit: string;
    empresaRazonSocial: string;
    fechaAlta: string;
    fechaBaja: string;
    presentadaEl: Date | null;
    logId: string | null;
    estado: EstadoConstancia;
    tipoConstancia: "alta" | "baja" | null;
    mismoDia: boolean;
    documento: IConstanciaArca["documento"];
}
/**
 * El estado que dice el contrato, para una presentación que todavía no tiene fila. Puro.
 *
 * Con la constancia validada: descargada si fue al Outbox; archivada si fue a «No firmar». Dónde está
 * HOY lo dice después `actualizarUbicaciones`; esto es sólo el punto de partida.
 */
export declare function filaDesdeContrato(o: {
    up: any;
    idx: number;
    c: any;
    user: any;
    empresa: {
        _id: unknown;
        cuit: string;
        razonSocial: string;
    };
}): FilaConstancia | null;
/** Las altas presentadas del tenant (o de una empleadora), como filas. SOLO LEE. */
export declare function filasPresentadas(tenantObjectId: any, o?: {
    empresaId?: string;
}): Promise<FilaConstancia[]>;
/**
 * UNA FILA POR CADA ALTA PRESENTADA, sin duplicar nunca (upsert por clave). Lo que ya existe no se pisa
 * —sus intentos y su estado son la historia—, salvo para reconocer una constancia que entró por otro
 * lado (subida a mano en Contratos): eso la saca de pendiente o de revisión.
 */
export declare function sincronizarConstancias(tenantObjectId: any, o?: {
    empresaId?: string;
}): Promise<{
    filas: number;
    nuevas: number;
    actualizadas: number;
}>;
export interface ElegidaParaDescargar {
    userProjectId: string;
    contractIndex: number;
    clave: string;
    /** El reintento a mano de una que estaba en revisión o esperando: no gasta intentos automáticos. */
    manual: boolean;
}
/**
 * QUÉ SE PIDE EN ESTA CORRIDA DE UNA EMPLEADORA. La automática respeta el cupo (nuevas primero), las
 * esperas y la revisión; la forzada (`soloItems`) pide lo que se eligió aunque esté esperando o en
 * revisión. En las dos, lo que ya tiene su constancia no se pide nunca.
 */
export declare function colaDeDescarga(tenantObjectId: any, empresaId: string, o: {
    ahora: Date;
    tope?: number;
    soloItems?: Array<{
        userProjectId: string;
        contractIndex: number;
    }>;
}): Promise<{
    elegidas: ElegidaParaDescargar[];
    fuera: FueraDeLaCorrida;
    total: number;
}>;
/** La constancia se bajó y quedó subida (o cargada en el contrato). */
export declare function anotarDescarga(tenantObjectId: any, clave: string, r: {
    tipo: "alta" | "baja";
    mismoDia: boolean;
    vaAFirma: boolean;
    archivadaEn?: string;
    nombre?: string;
    dropboxId?: string;
    manual?: boolean;
}): Promise<void>;
/** Un intento que no trajo la constancia: cuenta, espera o pasa a revisión (ver `trasUnFallo`). */
export declare function anotarFallo(tenantObjectId: any, clave: string, fallo: Fallo, o?: {
    manual?: boolean;
}): Promise<{
    estado: EstadoConstancia;
    motivoRevision?: string;
}>;
/** La fila y el contrato después de pedir volver a bajarla, o por qué no. Puro (lo prueba `constanciasArca.test.ts`). */
export declare function planDeRedescarga(fila: {
    estado: EstadoConstancia;
    fechaAlta: string;
    documento?: any;
    redescarga?: Redescarga | null;
    intentos?: Intento[];
}, contrato: {
    fecha_alta_contrato?: unknown;
    altaConstancia?: any;
} | null | undefined, o: {
    ahora: Date;
    porUsuarioId?: string | null;
}): {
    ok: false;
    motivo: string;
} | {
    ok: true;
    fila: {
        estado: EstadoConstancia;
        proximoIntentoEl: null;
        motivoRevision: null;
        documento: null;
        tipoConstancia: null;
        mismoDia: false;
        redescarga: Redescarga;
        intentos: Intento[];
    };
    intento: Intento;
    contrato: any;
};
export interface ResultadoRedescarga {
    clave: string;
    nombre: string;
    cuil: string;
    pedida: boolean;
    motivo: string;
}
/**
 * Pide volver a bajar esas constancias. Por cada una: la fila se toma con una escritura condicionada
 * (sigue en revisión por documento no ubicado), así dos pedidos a la vez no la encolan dos veces; recién
 * después se limpia la validación del contrato. Si el contrato no se pudo tocar, la fila vuelve a como
 * estaba. Antes de llamar, `actualizarUbicaciones` sobre estas filas: un documento que reapareció sale
 * de revisión y acá ya no se toca.
 */
export declare function pedirRedescarga(tenantObjectId: any, claves: string[], o?: {
    porUsuarioId?: string | null;
    ahora?: Date;
}): Promise<ResultadoRedescarga[]>;
type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
/**
 * DÓNDE ESTÁ HOY CADA CONSTANCIA, y el estado que eso dice. Lista una vez cada carpeta del circuito y
 * busca el código de cada documento; la carpeta más avanzada donde aparece manda. La firmada se
 * archiva (copia) en «Alta temprana de Arca/Firmadas». Lo que no aparece en ninguna se sigue por su
 * path o su id de Dropbox: si se movió a otra carpeta, se anota; si se borró, pasa a revisión
 * («documento no ubicado») con la fecha en que se borró.
 */
export interface ResultadoUbicaciones {
    revisadas: number;
    cambiadas: number;
    archivadas: number;
    noUbicadas: number;
    /** Cada cambio de estado, con su motivo (lo imprime el script de migración). */
    cambios: Array<{
        clave: string;
        de: EstadoConstancia;
        a: EstadoConstancia;
        motivo: string;
    }>;
}
/**
 * `enSeco`: no copia ni escribe nada; devuelve lo que haría. `docs`: las filas a ubicar (el script en seco
 * pasa las deducidas de los contratos, porque `constancias_arca` todavía está vacía).
 */
/** Lo que `actualizarUbicaciones` le pide a Dropbox: se inyecta en los tests (ver `constanciasArca.test.ts`). */
export interface AdaptadorDropbox {
    listar: (path: string) => Promise<Array<{
        tag: string;
        name: string;
        path: string;
        id?: string;
    }>>;
    copiar: (desde: string, hacia: string) => Promise<{
        path: string;
        name: string;
        id?: string;
    }>;
    ubicar: (ref: string) => Promise<{
        path: string;
        borrado?: boolean;
    } | null>;
    borradoEl: (path: string) => Promise<string | null>;
}
export declare function actualizarUbicaciones(tenantId: string, cfg: TenantDropboxConfig | null, o?: {
    log?: (l: string) => void;
    enSeco?: boolean;
    docs?: any[];
    dropbox?: AdaptadorDropbox;
    carpetas?: {
        outbox: string | null;
        pendbox: string | null;
        firmados: string | null;
        altaTemprana: string | null;
    };
}): Promise<ResultadoUbicaciones>;
/**
 * «VOLVER A BAJAR», completo: primero se mira en Dropbox dónde están hoy esos documentos (uno que
 * reapareció sale de revisión y no se toca) y después se pide la re-descarga de lo que sigue perdido.
 * Sin Dropbox conectado no se puede mirar: se pide igual (la constancia nueva tampoco tendría a dónde ir,
 * pero queda en el contrato).
 */
export declare function volverABajar(tenantObjectId: any, claves: string[], o: {
    cfg: TenantDropboxConfig | null;
    porUsuarioId?: string | null;
    log?: (l: string) => void;
}): Promise<ResultadoRedescarga[]>;
export declare const ETIQUETA_CARPETA: Record<CarpetaDelDocumento, string>;
/** Lo que ven las pantallas de cada constancia. */
export interface ConstanciaEnPantalla {
    clave: string;
    cuil: string;
    nombre: string;
    userProjectId: string;
    contractIndex: number;
    empresaId: string;
    empresaRazonSocial: string;
    fechaAlta: string;
    fechaBaja: string;
    presentadaEl: string | null;
    estado: EstadoConstancia;
    categoria: CategoriaConstancia;
    mismoDia: boolean;
    tipoConstancia: "alta" | "baja" | null;
    intentos: Array<{
        fecha: string;
        resultado: string;
        detalle?: string;
        manual?: boolean;
    }>;
    proximoIntentoEl: string | null;
    motivoRevision: string | null;
    documento: {
        codigo: string;
        nombre: string;
        path: string;
        carpeta: string | null;
        etiquetaCarpeta: string;
        firmada: boolean;
    } | null;
    /** En revisión porque el documento no está en ninguna carpeta del circuito: se puede «Volver a bajar». */
    noUbicado: boolean;
    /** «Volver a bajar» pedido: cuándo, qué documento se había perdido, y si sigue en curso. */
    redescarga: {
        pedidaEl: string;
        enCurso: boolean;
        codigoAnterior: string;
    } | null;
    /** Sin fila en `constancias_arca` todavía: deducida del contrato (antes de la migración). */
    deducida?: boolean;
}
/** Las constancias para las pantallas: las de la colección y, para las presentadas sin fila, lo que dice el contrato. SOLO LEE. */
export declare function constanciasDeLaPantalla(tenantObjectId: any, o?: {
    empresaId?: string;
}): Promise<ConstanciaEnPantalla[]>;
/** «24/10/2026 17:59» en hora argentina (el `toLocaleString` de Node daba «05:59» sin el p. m.). */
export declare function fechaHoraArgentina(iso: string | Date): string;
export {};
