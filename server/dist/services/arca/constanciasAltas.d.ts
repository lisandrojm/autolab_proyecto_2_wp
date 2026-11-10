import type { FueraDeLaCorrida, OrigenDescarga } from "./cicloConstancia.js";
/**
 * BAJAR DE ARCA LAS CONSTANCIAS DE ALTA TEMPRANA de lo ya presentado, y mandarlas a donde va cada
 * una (Outbox si se firma, «Alta temprana de Arca/No firmar» si no).
 *
 * Es lo que antes se hacía a mano: Relaciones Laborales → Consultas → por CUIL → tildar la relación →
 * ícono de impresora, persona por persona. SOLO LEE en ARCA.
 *
 * Mismo mecanismo que las otras corridas: arranca, vuelve enseguida, se sigue por eventos, y toma el
 * candado de ARCA del tenant (una sola sesión por vez). Va de a una persona y con pausa.
 *
 * Cada PDF pasa por `registrarAltaDeContrato`, el mismo camino que la subida a mano: si no es la
 * constancia de ALTA de ese contrato (ARCA entrega la de BAJA cuando la relación ya tiene cese) no se
 * guarda ni se envía, y queda dicho por qué.
 */
export type EventoConstancias = {
    tipo: "abriendo";
} | {
    tipo: "sesion";
    seLogueo: boolean;
} | {
    tipo: "persona";
    cuil: string;
    nombre: string;
    estado: "descargando" | "lista" | "rechazada" | "sin_constancia" | "error";
    detalle?: string;
    /** Bajada: si ARCA la dio de ALTA (relación activa) o de BAJA (ya terminada). */
    tipoConstancia?: "alta" | "baja";
} | {
    tipo: "fin";
    listas: number;
    total: number;
} | {
    tipo: "fallo";
    mensaje: string;
};
interface DescargaConstancias {
    empresaId: string;
    empresaRazonSocial: string;
    total: number;
    eventos: EventoConstancias[];
    terminada: boolean;
    arrancadaEl: Date;
    /** Encadenada a una presentación, el barrido diario o pedida a mano (11/11/2026). */
    origen: OrigenDescarga;
    /** La encadenada: cuándo terminó la presentación de la que salió. */
    presentacionTerminadaEl?: Date;
}
/** La presentación de la que sale una descarga encadenada (ver `descargaEncadenada.ts`). */
export interface PresentacionEncadenada {
    terminadaEl: Date;
    logId?: string | null;
    automatica: boolean;
}
export interface Pendiente {
    userProjectId: string;
    contractIndex: number;
    userId: string;
    cuil: string;
    nombre: string;
    /** ddmmaaaa, como lo muestra ARCA sin las barras. */
    fechaInicio: string;
    /** "YYYY-MM-DD" del alta y cuándo se presentó en ARCA (para la pantalla de Descargas Automáticas). */
    fechaAlta: string;
    presentadaEl: string;
    empresaId: string;
    /** "YYYY-MM-DD" de la baja del contrato, o "": con ella se acepta la constancia de baja y se elige entre relaciones del mismo inicio. */
    fechaBaja: string;
    /** La de `constancias_arca` (ver `constanciasArca.ts`) y si se pidió a mano: con eso se anota el intento. */
    clave?: string;
    manual?: boolean;
}
export declare const descargaConstanciasDe: (tenantId: string) => DescargaConstancias | undefined;
/** Los contratos de esa empleadora presentados en ARCA que todavía no tienen su constancia validada. */
export declare function pendientesDeConstancia(tenantObjectId: any, empresaId: string): Promise<Pendiente[]>;
/** Los pendientes de constancia de TODAS las empleadoras con CUIT, con la razón social de cada una. */
export declare function pendientesDeConstanciaTodas(tenantObjectId: any): Promise<Array<Pendiente & {
    empresaRazonSocial: string;
}>>;
export declare function arrancarDescargaConstancias(o: {
    tenantId: string;
    tenantObjectId: any;
    tenantCarpeta: string;
    empresaId: string;
    /** Tope de personas en esta corrida (la automática lo usa); sin tope, todas. */
    maximo?: number;
    /** Sólo estos contratos (forzar una o varias personas); sin lista, todos los pendientes de la empleadora. */
    soloItems?: Array<{
        userProjectId: string;
        contractIndex: number;
    }>;
    /** Quién la pidió; la descarga automática no tiene persona (`automatica: true`). Queda en cada constancia. */
    usuarioId?: string | null;
    automatica?: boolean;
    /**
     * ENCADENADA A UNA PRESENTACIÓN (11/11/2026): `soloItems` son las altas que se acaban de presentar. Sin
     * tope, pero como corrida automática: un fallo cuenta como intento y sigue su ciclo de reintentos.
     */
    encadenada?: PresentacionEncadenada;
}): Promise<{
    total: number;
    pendientes: number;
    fuera: FueraDeLaCorrida;
}>;
export {};
