/**
 * LOS DOS ESTADOS IMPOSITIVOS SON DEL SISTEMA. Siempre existen y no se pueden borrar.
 *
 * Todo contrato declara uno de los dos trámites: o es un alta temprana ante ARCA, o es una locación
 * de servicios. No es una preferencia de cada productora — es cómo se declara el vínculo ante el
 * organismo—, así que no puede depender de que alguien se acuerde de crearlos en el ABM.
 *
 * El problema real era ese: si alguien los borraba, o si un tenant nuevo arrancaba sin ellos, el
 * wizard se quedaba sin ningún estado que ofrecer y las altas entraban sin trámite declarado. Y eso
 * no se nota en la pantalla: se nota cuando el TXT de ARCA sale mal.
 *
 * SE CREAN SIN TIPOS DE CONTRATO ASOCIADOS, a propósito. Qué tipo de contrato lleva cuál lo decide
 * cada productora en el ABM; el sistema garantiza que los dos estados estén, no a qué se aplican.
 *
 * ADOPTA, NO DUPLICA. Si ya hay un estado con la misma clave canónica —«Falta pedido de AFIP» es el
 * mismo que «Pedido de AFIP»— se lo marca como de sistema y se le completa SOLO lo que le falte.
 * Nunca se pisa un valor ya configurado: el color, la etiqueta o los tipos que cargó alguien quedan
 * como están. Crear uno nuevo al lado dejaría dos estados para el mismo trámite, que es peor que el
 * problema que esto resuelve.
 *
 * El NOMBRE GUARDADO sigue diciendo «AFIP». Es la clave con la que matchean los contratos ya
 * guardados y los filtros (`claveEstado`); el renombre a ARCA se hace al dibujar (`TEXTO_VIEJO` en
 * `EstadoSelect.tsx`). Cambiarlo acá es una migración, no un seed.
 */
export declare const ESTADO_TYPE = "estado-empleado";
export interface EstadoImpositivoSistema {
    /** Nombre con el que se crea si no existe ninguno con su clave. */
    name: string;
    tipoImpositivo: "alta_temprana_afip" | "constancia_cuit";
    /** Texto del badge secundario en las tarjetas de Contrato. */
    etiquetaSecundaria: string;
    color: string;
    orden: number;
}
export declare const ESTADOS_IMPOSITIVOS_SISTEMA: EstadoImpositivoSistema[];
/** ¿Este estado (su `data`) es uno de los dos de sistema? */
export declare const esEstadoDeSistema: (data: any) => boolean;
/**
 * Deja los dos estados creados. Idempotente: se puede correr en cada arranque.
 *
 * Devuelve qué hizo, para que el log del arranque lo diga en vez de quedar en silencio.
 */
export declare function ensureEstadosImpositivosSistema(): Promise<{
    creados: string[];
    adoptados: string[];
}>;
