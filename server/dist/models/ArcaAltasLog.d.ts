import { Document, Model, Types } from "mongoose";
/**
 * Registro de cada corrida de ALTAS en ARCA (Carga Masiva o Altas Masivas).
 *
 * SIN TTL, a diferencia de `ArcaObrasSocialesLog`: aquel es un log operativo de lecturas, y esto es la
 * constancia de un trámite irreversible ante el organismo. Si alguna vez hay que responder «¿quién
 * presentó esta alta, cuándo y con qué número?», la respuesta es este documento.
 *
 * NO GUARDA el TXT ni claves. Los CUIL están en `contratos` (son el resultado por persona, que es lo
 * que se audita), pero no se vuelcan a la consola del servidor. `htmlResultado` va anonimizado: es la
 * pantalla que mostró ARCA después de presentar, y es lo que permite escribir el lector de esa
 * pantalla (que nunca se pudo relevar sin presentar de verdad).
 */
export interface IArcaAltasLog extends Document {
    tenantId: Types.ObjectId;
    tipo: "carga_masiva" | "altas_masivas";
    usuarioId?: Types.ObjectId;
    empresaId?: Types.ObjectId;
    empresaCuit?: string;
    empresaRazonSocial?: string;
    enSeco: boolean;
    contratos: Array<{
        userProjectId: Types.ObjectId;
        contractIndex: number;
        cuil: string;
        nombre: string;
        resultado: string;
        motivo?: string;
        tanda?: number;
        cat?: string;
        porConsulta?: boolean;
    }>;
    /** Altas Masivas por tandas: cada tanda con sus tiempos y su resultado. */
    tandas?: Array<{
        n: number;
        cuils: string[];
        inicio: Date;
        fin: Date;
        duracionMs: number;
        resultado: string;
        error?: string;
    }>;
    /** El tope del pegado que decía la pantalla, y el que se usó (el menor entre ese y la constante). */
    topeEnPantalla?: number;
    topeUsado?: number;
    /** Por qué se cortó antes de terminar: `detenida`, `error`, `dialogo`, `rechazos_seguidos`… */
    motivoCorte?: string;
    codigoNovedad?: string;
    nroTransaccion?: string;
    fechaPresentacion?: string;
    estadoArca?: string;
    /** `enviada` | `aceptada` | `seco` | `indeterminado` | `fallo` | `detenida` | `en_curso` | `cortada`. */
    resultado: string;
    /** Si se llegó a apretar el botón irreversible. */
    irreversible: boolean;
    pasoFallido?: string;
    error?: string;
    textoArca?: string;
    dialogos?: string[];
    seLogueo?: boolean;
    tiempos?: any;
    duracionMs?: number;
    htmlResultado?: string;
    createdAt: Date;
}
export declare const ArcaAltasLog: Model<IArcaAltasLog>;
