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
 * SE RECONOCEN POR SU TRÁMITE, NO POR EL NOMBRE (05/11/2026). Se buscaban sólo por nombre: alguien
 * renombró «Pedido de AFIP» a «AFIP» y, como esto corre cada vez que se lista, al instante se creó otro
 * «Pedido de AFIP» al lado. Ahora un estado de sistema con ese `tipoImpositivo` ya cuenta, se llame como
 * se llame. Renombrarlo es legítimo: el PATCH de `routes/info.ts` lleva el nombre nuevo a los contratos.
 *
 * ADOPTA, NO DUPLICA. Si ya hay un estado con la misma clave canónica —«Falta pedido de AFIP» es el
 * mismo que «Pedido de AFIP»— se lo marca como de sistema y se le completa SOLO lo que le falte.
 * Nunca se pisa un valor ya configurado: el color, la etiqueta o los tipos que cargó alguien quedan
 * como están. Crear uno nuevo al lado dejaría dos estados para el mismo trámite, que es peor que el
 * problema que esto resuelve.
 *
 * Se llaman AFIP y SERVICIOS desde el 05/11/2026 (pedido del usuario). «Pedido de AFIP», «Falta pedido
 * de AFIP» y «Pedido de Servicios» son alias de esos dos (`claveEstado`): un contrato que llegue con un
 * nombre viejo cae en el mismo estado.
 */
export declare const ESTADO_TYPE = "estado-empleado";
/** El paso de los estados impositivos: el 1 es «Solicitud pendiente». El ABM y el editor lo fijan. */
export declare const PASO_IMPOSITIVOS = 2;
/** Dónde se guarda el `.json` de cada solicitud, si nadie configuró otra carpeta (`espejoDropboxSolicitudes.ts`). */
export declare const CARPETA_SOLICITUDES = "/WEPRODU/Solicitudes";
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
export declare const NOMBRE_ESTADO_SOLICITUD = "Solicitud pendiente";
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
