/**
 * ¿ESTA ALTA PENDIENTE YA LA HIZO ALGUIEN A MANO EN ARCA? (pedido del 04/11/2026). Puro.
 *
 * Cuando ARCA rechaza o retiene un alta, a veces el operador la fuerza a mano en el sitio de ARCA. La
 * plataforma no se enteraba: el contrato seguía «Pedido de ARCA», en la cola de Altas Automáticas, y
 * nadie bajaba la constancia. Ahora, con las Relaciones Laborales SINCRONIZADAS (el TXT de movimientos
 * que genera ARCA, ver `sincronizarRelaciones.ts`), se busca la relación que es esta alta:
 *
 *   · UNA relación con la misma persona y empleadora (eso ya viene filtrado), que empieza el mismo día,
 *     termina el mismo día (o las dos sin fin) y con la misma modalidad → se ADOPTA: queda presentada
 *     como si la hubiera presentado la plataforma (`altaArcaPresentada.via = "externa"`).
 *   · Una relación que empieza durante el contrato pero no coincide en todo (fechas o modalidad) →
 *     REVISIÓN MANUAL, con lo esperado y lo encontrado lado a lado. Nunca se adopta sola.
 *   · Varias relaciones idénticas, u otro contrato de WeProdu que ya es esa alta → REVISIÓN MANUAL.
 *   · Nada que empiece durante el contrato → `null`: no es asunto de esta regla (sigue la cola normal).
 *     Una relación ANTERIOR al contrato es otro contrato (o algo activo que lo bloquea): eso lo resuelve
 *     `bloqueoPorVigencia`, no esto.
 *
 * Decisiones del usuario (04/11/2026): alcanza con lo sincronizado, sin consultar ARCA en vivo (el TXT
 * trae la modalidad, la consulta no); la constancia la baja la descarga diaria de siempre.
 *
 * LA MODALIDAD: el contrato la tiene como CÓDIGO (022) y el TXT de ARCA como DESCRIPCIÓN («A tiempo
 * completo determinado (contrato a plazo fijo)»). Se comparan por el catálogo oficial
 * (`ArcaModalidadContratacion`: código → nombre). Si ARCA no la informa, no se compara (la regla del
 * pedido: «si está disponible»); si la informa y no hay cómo saber la del contrato, es revisión manual.
 */
/** Una relación de ARCA tal como quedó sincronizada. Fechas "YYYY-MM-DD"; `fin` vacío = abierta. */
export interface RelacionSincronizada {
    inicio: string;
    fin: string;
    /** Como la escribe ARCA en el TXT: la descripción (a veces con el código adelante). Vacío = no la informó. */
    modalidad: string;
}
export interface AltaPendiente {
    /** "YYYY-MM-DD" */
    alta: string;
    /** "YYYY-MM-DD"; vacío = tiempo indeterminado. */
    baja: string;
    /** El código de modalidad del contrato (resuelto como para el TXT): "022". Vacío si no se pudo resolver. */
    modalidadCodigo: string;
    /** El nombre de ese código en el catálogo oficial. Vacío si el catálogo no lo tiene. */
    modalidadNombre: string;
    /** Otro contrato de WeProdu de la misma persona y empleadora, ya presentado, empieza el mismo día. */
    otroContratoMismoDia: boolean;
}
/** Lo esperado y lo encontrado, para mostrarlos lado a lado. */
export interface LadoALado {
    esperado: {
        inicio: string;
        fin: string;
        modalidad: string;
    };
    encontradas: RelacionSincronizada[];
}
export type DecisionAltaExterna = ({
    accion: "adoptar";
    motivo: string;
    relacion: RelacionSincronizada;
} & LadoALado) | ({
    accion: "revision_manual";
    motivo: string;
    relacion?: RelacionSincronizada;
} & LadoALado);
/**
 * ¿La modalidad de ARCA es la del contrato? `true`/`false`, o `null` si no se puede saber (ARCA la
 * informa y del contrato no se conoce el código o su nombre).
 */
export declare function mismaModalidad(alta: Pick<AltaPendiente, "modalidadCodigo" | "modalidadNombre">, deArca: string): boolean | null;
export declare function decidirAltaExterna(a: AltaPendiente, relaciones: RelacionSincronizada[]): DecisionAltaExterna | null;
