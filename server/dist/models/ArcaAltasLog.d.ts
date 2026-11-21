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
    /**
     * `verificacion`: no presentó nada; registra las altas que la verificación encontró ya hechas en ARCA (`verificacionAltas.ts`).
     * `baja` | `modificacion` | `anulacion`: una operación sobre una relación ya dada de alta, en Modificaciones y
     * Bajas (`corridaOperacionRelacion.ts`); el detalle va en `operacion` y el contrato tocado en `contratos[0]`.
     */
    tipo: "carga_masiva" | "altas_masivas" | "verificacion" | "externa" | "baja" | "modificacion" | "anulacion";
    usuarioId?: Types.ObjectId;
    /** La lanzó la presentación automática de las 14 h: no hay persona detrás. */
    automatica?: boolean;
    empresaId?: Types.ObjectId;
    empresaCuit?: string;
    empresaRazonSocial?: string;
    enSeco: boolean;
    contratos: Array<{
        userProjectId: Types.ObjectId;
        contractIndex: number; /** Etapa 2c: la identidad del contrato. */
        contratoKey?: Types.ObjectId | null; /** Etapa 2c: no se le pudo dar clave con evidencia (su log no quedó en ningún contrato): queda por posición y NO hay que creerle a la posición. */
        claveNoResuelta?: string;
        cuil: string;
        nombre: string; /** El registro de 85 tal cual se mandó a ARCA. */
        registro?: string;
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
        /** Lo que devolvió ARCA en esa tanda (rechazo o fallo): motivo, diálogos, HTML anonimizado, renglones nuevos, textos en rojo. */
        textoArca?: string;
        dialogos?: string[];
        html?: string;
        textoNuevo?: string;
        enRojo?: string[];
    }>;
    /** El tope del pegado que decía la pantalla, y el que se usó (el menor entre ese y la constante). */
    topeEnPantalla?: number;
    topeUsado?: number;
    /** Por qué se cortó antes de terminar: `detenida`, `error`, `dialogo`, `rechazos_seguidos`… */
    motivoCorte?: string;
    /**
     * Las operaciones de Modificaciones y Bajas: qué se pidió (`payload`, con las fechas y los códigos tal como se
     * escribieron), la relación como la mostraba ARCA antes (`relacion`), el acuse leído después (`acuse`), y de qué
     * lado estuvo el problema si falló (`clase`: `regla_arca` o `navegacion`). `que` sólo en la anulación.
     */
    operacion?: {
        que?: "alta" | "baja";
        payload?: any;
        relacion?: any;
        acuse?: any;
        clase?: string;
        cambios?: Array<{
            campo: string;
            antes: string;
            despues: string;
        }>;
        /** Lo que ARCA mostró después de confirmar, sin CUIL ni VIEWSTATE (para escribir el lector que falte). */
        html?: string;
        textoNuevo?: string;
        enRojo?: string[];
        /** Cómo se leyó el resultado: `listado` (se volvió a buscar la relación) o `pantalla` (lo que quedó después de confirmar). */
        leidoDe?: string;
    };
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
