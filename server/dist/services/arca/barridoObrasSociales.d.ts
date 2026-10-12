import { Types } from "mongoose";
/** Una corrida sin novedades de ARCA durante este tiempo se considera colgada y se destraba sola. */
export declare const INACTIVIDAD_COLGADA_MS: number;
/**
 * EL BARRIDO DE OBRAS SOCIALES SIN VALIDAR: la red de seguridad de la cola.
 *
 * La cola (`colaObrasSociales.ts`) valida en segundo plano apenas nace el contrato, pero vive en memoria:
 * un reinicio la pierde, y si ARCA está ocupada diez minutos la abandona. Este barrido corre cada
 * `ARCA_BARRIDO_OS_MIN` minutos (10) por tenant y toma TODO lo que quedó sin validar: contratos creados
 * en WeProdu (Solicitudes o «Agregar miembro») en los últimos `DIAS_ATRAS` días, con empleadora,
 * categoría y CUIL válido, que todavía no están constatados en ARCA. Los manda a la MISMA corrida que
 * el botón y la cola (`arrancarCorrida`), marcada como automática.
 *
 * NO PISA A NADIE: con el candado tomado no hace nada y vuelve a probar en el próximo tick (sin tope:
 * «rendirse» es lo que hacía la cola y dejaba gente sin validar). Y no insiste con quien ARCA acaba de
 * rechazar: a cada CUIL se lo vuelve a intentar recién pasados `ARCA_BARRIDO_OS_REINTENTO_MIN` (60).
 *
 * La DECISIÓN (`planBarrido`) es pura y se testea; `barrerTenant` la ejecuta.
 */
export declare const DIAS_ATRAS = 30;
export interface ContratoSinValidar {
    cuil: string;
    empresaId: string;
}
export interface PlanBarrido {
    grupos: Array<{
        empresaId: string;
        cuils: string[];
    }>;
    /** CUILs que se saltearon por un intento reciente. */
    esperando: number;
}
/**
 * Qué mandar a ARCA: agrupa por empleadora, un CUIL por empleadora, y deja afuera a quien se intentó
 * hace menos de `reintentoMs`.
 */
export declare function planBarrido(sinValidar: ContratoSinValidar[], ultimoIntento: Map<string, number>, ahora: number, reintentoMs: number): PlanBarrido;
/**
 * Los contratos del tenant que la automática todavía debe validar. Proyectado en la base: no viajan
 * los `contracts` enteros (ver memoria «Latencia = bytes desde Atlas»).
 */
export declare function contratosSinValidar(tenantObjectId: Types.ObjectId, diasAtras?: number): Promise<Array<ContratoSinValidar & {
    userId: string;
    nombre: string;
    fechaCarga: string;
    projectId: string;
    proyecto: string;
}>>;
/** ¿El tenant tiene la validación automática prendida? Por defecto sí; se apaga en Configuración → ARCA → Conexión. */
export declare function validacionAutomaticaActivaEn(tenantObjectId: unknown): Promise<boolean>;
export declare const reintentoMs: () => number;
export type ResultadoBarrido = "apagada" | "sin_credenciales" | "ocupado" | "nada" | "arrancada" | "fallo";
/** Una pasada del barrido para UN tenant. Nunca tira. `ignorarReintentos` es «Validar ahora»: manda también a quien espera reintento. */
export declare function barrerTenant(tenantId: string, tenantObjectId: Types.ObjectId, log?: (l: string) => void, opts?: {
    ignorarReintentos?: boolean;
}): Promise<{
    resultado: ResultadoBarrido;
    total: number;
    esperando: number;
}>;
/** Para la pantalla: si ese CUIL está esperando reintento (se intentó hace poco y falló). */
export declare const esperaReintento: (tenantId: string, cuil: string) => boolean;
/** Para la pantalla: cuántos CUILs del tenant están esperando reintento. */
export declare const esperandoReintento: (tenantId: string) => number;
