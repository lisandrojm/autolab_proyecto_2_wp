/**
 * ALTAS MASIVAS POR TANDAS: el orden de una corrida, sin navegador ni base.
 *
 * El pegado de ARCA admite pocos registros (9), así que una selección grande se presenta en tandas
 * sucesivas, con la misma sesión y de a una. Este archivo decide QUÉ se presenta y CUÁNDO; el motor
 * (`frontend/tools/altas-arca.mjs`) y la base entran por parámetro, y por eso se puede probar entero
 * con un ARCA simulado (`tandasAltas.test.ts`).
 *
 * Las reglas, que son las del pedido:
 *
 *   · NO DUPLICAR. Antes del «Aceptar» de cada tanda se deja escrito en el contrato que se está
 *     presentando; al volver ARCA se guarda el resultado, y recién ahí se pasa a la tanda siguiente.
 *     Un corte en el medio deja rastro, y lo que quedó sin resultado no se vuelve a presentar: se
 *     CONSULTA en ARCA por CUIL (solo lectura).
 *   · UNA INCIERTA NO SE REINTENTA. Si la consulta la encuentra, queda registrada. Si no la
 *     encuentra queda «incierta» —no verla no prueba que no esté— y la corrida sigue con las demás.
 *   · UNA RECHAZADA NO FRENA AL RESTO: queda con el motivo textual de ARCA.
 *   · SE CORTA SOLA si ARCA deja de comportarse como se espera: un error del motor (sesión caída,
 *     pantalla que no es), un diálogo que nadie esperaba, o más de N rechazos seguidos.
 *   · «DETENER» corta al terminar la tanda en curso: una tanda a medio presentar no se abandona.
 */
export type EstadoPersonaTanda = "pendiente" | "presentando" | "registrada" | "rechazada" | "incierta" | "seco";
export interface ItemTanda {
    userProjectId: string;
    contractIndex: number;
    cuil: string;
    nombre: string;
    registro: string;
}
export interface ResultadoItem {
    item: ItemTanda;
    estado: EstadoPersonaTanda;
    tanda?: number;
    motivo?: string;
    /** Clave de alta temprana, si ARCA la mostró. */
    cat?: string;
    /** El alta se confirmó leyendo Consultas, no por el resultado de la presentación. */
    porConsulta?: boolean;
}
export interface TandaHecha {
    n: number;
    cuils: string[];
    inicio: Date;
    fin: Date;
    duracionMs: number;
    /** `aceptada` | `rechazada` | `seco` | `indeterminado` | `fallo`. */
    resultado: string;
    error?: string;
}
export type MotivoCorte = "detenida" | "error" | "error_despues_de_presentar" | "dialogo" | "rechazos_seguidos";
export interface MotorTandas {
    /** El tope que dice la pantalla del pegado, o null si no lo dice. */
    leerTope(): Promise<number | null>;
    presentar(o: {
        texto: string;
        cuils: string[];
        tope: number;
        antesDeAceptar: (cuils: string[]) => Promise<void>;
    }): Promise<{
        resultado: string;
        porPersona?: Array<{
            cuil: string;
            estado: string;
            motivo?: string;
            cat?: string;
        }>;
    }>;
    /** `encontrada` es `true` o `null`: nunca `false` (ver `altaEnConsulta` en el motor). */
    consultar(o: {
        cuil: string;
        fechaInicio: string;
    }): Promise<{
        encontrada: true | null;
        cat?: string;
    }>;
}
export interface GuardadoTandas {
    /** Antes del «Aceptar»: deja dicho en cada contrato que se está presentando. */
    presentando(items: ItemTanda[], tanda: number): Promise<void>;
    /** El resultado de UN contrato. `pendiente` = no se presentó: borra la marca de «presentando». */
    resultado(r: ResultadoItem): Promise<void>;
    /** Al cerrar cada tanda, con sus tiempos. */
    tanda(t: TandaHecha, resultados: ResultadoItem[]): Promise<void>;
}
export type EventoTandas = {
    tipo: "tope";
    enPantalla: number | null;
    usado: number;
} | {
    tipo: "plan";
    tandas: number;
    total: number;
    tope: number;
} | {
    tipo: "tanda";
    n: number;
    de: number;
    cuils: string[];
    estado: "presentando" | "terminada";
    resultado?: string;
    duracionMs?: number;
} | {
    tipo: "personaTanda";
    cuil: string;
    tanda?: number;
    estado: EstadoPersonaTanda;
    motivo?: string;
    cat?: string;
    porConsulta?: boolean;
} | {
    tipo: "corte";
    motivo: MotivoCorte;
    mensaje: string;
};
export interface ResultadoTandas {
    tope: number;
    topeEnPantalla: number | null;
    tandas: TandaHecha[];
    resultados: ResultadoItem[];
    corte?: {
        motivo: MotivoCorte;
        mensaje: string;
    };
}
/** Más de esta cantidad de rechazos SEGUIDOS corta la corrida: algo está mal armado y no es una persona. */
export declare const maxRechazosSeguidos: () => number;
/** La fecha de inicio del registro de 85 (posiciones 48–55, ddmmaaaa): es lo que se busca en la consulta. */
export declare const fechaInicioDeRegistro85: (registro: string) => string;
export declare function correrTandas(o: {
    items: ItemTanda[];
    /** Contratos que una corrida anterior dejó sin resultado: NO se presentan, se consultan. */
    inciertas?: ItemTanda[];
    enSeco: boolean;
    motor: MotorTandas;
    guardar: GuardadoTandas;
    emitir?: (e: EventoTandas) => void;
    /** Se mira ANTES de cada tanda: «Detener» y los diálogos inesperados cortan acá, no en el medio. */
    cortePedido?: () => {
        motivo: MotivoCorte;
        mensaje: string;
    } | null;
    maxRechazos?: number;
    /** La pausa entre tandas (ritmo de una persona). */
    pausa?: () => Promise<void>;
}): Promise<ResultadoTandas>;
