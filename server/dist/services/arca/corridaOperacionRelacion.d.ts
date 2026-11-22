/**
 * LA CORRIDA DE UNA OPERACIÓN SOBRE UNA RELACIÓN LABORAL EN ARCA (20/11/2026): baja, modificación o anulación,
 * en Relaciones Laborales → Modificaciones y Bajas. Misma infraestructura que las altas: el candado de ARCA por
 * tenant, la sesión del usuario delegado (`navegador.ts`), el motor importado en tiempo de ejecución, una corrida
 * en memoria por tenant con eventos que la pantalla lee cada ~2 s, el registro en `arca_altas_logs` y la marca en
 * el contrato por `contratoKey` (auditada por los hooks del modelo).
 *
 * LO QUE AGREGA:
 *   · EN SECO POR DEFECTO. Sólo con `confirmar: true` (y sin `ARCA_ALTAS_EN_SECO=true`) se aprieta algo que no se
 *     deshace. En seco la corrida entra a ARCA, lee la relación, completa el formulario, informa exactamente lo que
 *     mandaría y lo cancela: nada queda en ARCA.
 *   · IDEMPOTENCIA en dos capas: el plan (`reglasOperacionRelacion.ts`) no deja arrancar si ya hay una marca de la
 *     misma operación o el espejo ya muestra el resultado; el motor relee la relación en vivo antes de operar.
 *   · EL RASTRO ANTES DEL CLICK: el contrato se marca `presentando` justo antes de «Confirmar» (o del ícono de anular).
 *     Si el servidor se cae ahí, la marca queda y nadie vuelve a mandar lo mismo sin mirar ARCA.
 *   · DOS CLASES DE FALLO: `regla_arca` (ARCA rechazó o no habilita: el texto literal) y `navegacion` (sesión,
 *     pantalla, timeout: se puede reintentar). Van en la marca, en el log y en los eventos.
 *
 *   · SIN CONTRATO (22/11/2026): una relación de ARCA que ningún contrato de WeProdu explica se opera igual. No hay
 *     contrato que marcar: el rastro antes del click y el resultado van al log, con la clave de la relación
 *     (`operacion.claveRelacion`), y de ahí salen las marcas que traban (`registroOperaciones.ts`). Si el log no se
 *     pudo crear, no se confirma nada.
 *
 * El núcleo (`ejecutarOperacion`) no toca Mongo ni Playwright: recibe el motor y el guardado por parámetro, y así
 * se prueba con un ARCA simulado (`corridaOperacionRelacion.test.ts`).
 */
import { Types } from "mongoose";
import { type DatosOperacion, type PlanOperacion, type TipoOperacion } from "./reglasOperacionRelacion.js";
import { type PlanConContexto, type ReferenciaContrato } from "./operacionRelacion.js";
export type EventoOperacion = {
    tipo: "abriendo";
} | {
    tipo: "sesion";
    seLogueo: boolean;
} | {
    tipo: "empleadoraVerificada";
    cuit: string;
} | {
    tipo: "pantalla";
    que: string;
} | {
    tipo: "pagina";
    numero: number;
} | {
    tipo: "relacion";
    relacion: any;
} | {
    tipo: "formulario";
    valores: Record<string, unknown>;
    cambios?: Array<{
        campo: string;
        antes: string;
        despues: string;
    }>;
} | {
    tipo: "seco";
} | {
    tipo: "irreversible";
    que: string;
} | {
    tipo: "rechazo";
    motivo: string;
} | {
    tipo: "acuse";
    acuse: Record<string, unknown>;
} | {
    tipo: "dialogoInesperado";
    mensaje: string;
} | {
    tipo: "fin";
    resultado: string;
    clase?: string;
    motivo?: string;
} | {
    tipo: "fallo";
    mensaje: string;
    clase: string;
};
/** Lo que devuelve el motor por cada operación (ver `modificaciones-arca.mjs`). */
export interface ResultadoOperacion {
    resultado: "presentada" | "rechazada" | "fallida" | "indeterminado" | "seco" | "ya_hecha";
    clase?: "regla_arca" | "navegacion" | "";
    motivo?: string;
    acuse?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    relacion?: any;
    cambios?: Array<{
        campo: string;
        antes: string;
        despues: string;
    }>;
    antes?: Record<string, string>;
    html?: string;
    textoNuevo?: string;
    enRojo?: string[];
    dialogos?: string[];
    leidoDe?: string;
    pantallaDesconocida?: boolean;
}
export interface MotorOperaciones {
    registrarBaja(o: any): Promise<ResultadoOperacion>;
    modificarRelacion(o: any): Promise<ResultadoOperacion>;
    anularRelacion(o: any): Promise<ResultadoOperacion>;
}
export interface GuardadoOperacion {
    /** Justo antes del click que no se deshace: deja dicho en el contrato que se está mandando. */
    presentando(payload: Record<string, unknown>): Promise<void>;
    /** El resultado, apenas se lee. No se llama en seco. */
    resultado(r: ResultadoOperacion): Promise<void>;
}
/**
 * EL RECORRIDO DE UNA OPERACIÓN, sin Mongo ni navegador. Llama al motor con `antesDeConfirmar` cableado al guardado
 * (`presentando`), convierte lo que el motor tira en un resultado con su clase, y guarda el resultado (salvo en seco).
 * Un error DESPUÉS de haber dejado el rastro es `indeterminado`: no se sabe si ARCA tomó la operación.
 */
export declare function ejecutarOperacion(o: {
    op: TipoOperacion;
    args: {
        page?: unknown;
        empresaCuit: string;
        cuil: string;
        fechaInicio: string;
        fechaFin?: string;
        datos: any;
        yaAdentro?: boolean;
    };
    enSeco: boolean;
    motor: MotorOperaciones;
    guardar: GuardadoOperacion;
    emitir?: (e: EventoOperacion) => void;
    señal?: {
        cortada: boolean;
    };
}): Promise<ResultadoOperacion>;
export interface CorridaOperacion {
    tenantId: string;
    op: TipoOperacion;
    userProjectId: string;
    contractIndex: number;
    contratoKey: string | null;
    persona: string;
    cuil: string;
    empresaRazonSocial: string;
    empresaCuit: string;
    plan: PlanOperacion;
    enSeco: boolean;
    eventos: EventoOperacion[];
    terminada: boolean;
    /** Se avisó el paso que no se deshace: desde acá «Detener» no corta. */
    irreversible: boolean;
    señal: {
        cortada: boolean;
    };
    arrancadaEl: Date;
    resultado?: ResultadoOperacion;
    logId?: string | null;
    usuarioId?: string;
}
export declare const corridaOperacionDe: (tenantId: string) => CorridaOperacion | undefined;
export declare function detenerOperacion(tenantId: string): {
    detenida: boolean;
    motivo?: string;
};
/** Lo que una presentación del motor significa en la marca del contrato y en el log. */
export declare function resultadoParaMarca(r: ResultadoOperacion): {
    marca: "presentada" | "indeterminado" | "fallida";
    log: string;
    clase: "regla_arca" | "navegacion" | "";
    porConsulta: boolean;
};
/**
 * Arranca la operación y vuelve enseguida; el progreso se sigue por `corridaOperacionDe`. Antes de abrir nada arma
 * el plan: si no se puede, tira `OperacionInvalida` con el motivo y no toma la sesión.
 */
export declare function arrancarOperacionRelacion(opts: {
    tenantId: string;
    tenantObjectId: Types.ObjectId;
    usuarioId?: string;
    op: TipoOperacion;
    ref: ReferenciaContrato;
    datos: DatosOperacion;
    /** Sólo con `true` se aprieta lo que no se deshace. Sin eso, en seco. */
    confirmar?: boolean;
}): Promise<{
    arrancada: true;
    enSeco: boolean;
    plan: PlanOperacion;
    contexto: PlanConContexto["contexto"];
}>;
