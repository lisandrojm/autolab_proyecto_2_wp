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
}
interface Pendiente {
    userProjectId: string;
    contractIndex: number;
    userId: string;
    cuil: string;
    nombre: string;
    /** ddmmaaaa, como lo muestra ARCA sin las barras. */
    fechaInicio: string;
}
export declare const descargaConstanciasDe: (tenantId: string) => DescargaConstancias | undefined;
/** Los contratos de esa empleadora presentados en ARCA que todavía no tienen su constancia validada. */
export declare function pendientesDeConstancia(tenantObjectId: any, empresaId: string): Promise<Pendiente[]>;
export declare function arrancarDescargaConstancias(o: {
    tenantId: string;
    tenantObjectId: any;
    tenantCarpeta: string;
    empresaId: string;
}): Promise<{
    total: number;
}>;
export {};
