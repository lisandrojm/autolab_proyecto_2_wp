/**
 * PARA QUÉ SIRVE CADA CARPETA VIGILADA DE DROPBOX. La única fuente.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * Hasta acá, saber qué carpeta era cuál se hacía matcheando texto contra el ÚLTIMO tramo del path:
 * `[/alta/i, /temprana|afip/i]` encontraba «Alta temprana de Arca» por la palabra «temprana». Anda,
 * pero queda atado al nombre que una persona le puso a la carpeta en Dropbox — y el día que alguien
 * la renombre a «Alta ARCA», deja de matchear **en silencio**: la transición no se dispara, no hay
 * error, no hay log, y el síntoma aparece semanas después como «los contratos no avanzan».
 *
 * Con un propósito explícito, el nombre de la carpeta pasa a ser lo que es —una etiqueta para
 * humanos— y la resolución deja de depender de él.
 *
 * DE ACÁ CONSUMEN TODOS: el tipo del campo, el backfill, la validación, la resolución, el
 * desplegable del modal y los tests. Un array escrito a mano en el componente sería una segunda
 * verdad sobre lo mismo, que es exactamente cómo se generó el problema anterior con las etiquetas.
 *
 * LOS SEIS NO SON OBLIGATORIOS. Un tenant puede legítimamente no usar alguno: en el tenant demo,
 * «Alta temprana de Arca» y «Sin cuit» están vacías. Faltar un propósito produce un 400 recién
 * cuando alguien usa esa función concreta (`routes/afip.ts`, `routes/firmaDigital.ts`), no al
 * guardar la configuración. Por eso la completitud es una ADVERTENCIA, nunca un bloqueo.
 */
export interface DefinicionProposito {
    valor: string;
    /** Cómo se llama en el desplegable. */
    etiqueta: string;
    /** Qué pasa cuando llega un archivo ahí. Es lo que la persona necesita para elegir bien. */
    descripcion: string;
    /**
     * Cómo se lo reconocía por el nombre. Se conserva SOLO para dos cosas: inferir el propósito de las
     * carpetas ya configuradas (backfill) y como red de contención mientras queden sin migrar.
     *
     * Todos los patrones tienen que matchear. Se prueban contra `detalle + nombre de la carpeta`.
     */
    patrones: RegExp[];
}
/**
 * El orden importa: es el del flujo real de un contrato —trámite impositivo, después firma— y es el
 * que va a ver quien abra el desplegable.
 */
export declare const PROPOSITOS: readonly [{
    readonly valor: "alta_temprana";
    readonly etiqueta: "Alta temprana de ARCA";
    readonly descripcion: "Llega el acuse del alta temprana. El contrato avanza a Envío de documentación.";
    readonly patrones: [RegExp, RegExp];
}, {
    readonly valor: "constancia_cuit";
    readonly etiqueta: "Constancia de CUIT";
    readonly descripcion: "Se archiva la constancia de inscripción consultada en ARCA.";
    readonly patrones: [RegExp, RegExp];
}, {
    readonly valor: "sin_cuit";
    readonly etiqueta: "Sin CUIT";
    readonly descripcion: "Comprobante de las personas que todavía no tienen CUIT/CUIL argentino.";
    readonly patrones: [RegExp, RegExp];
}, {
    readonly valor: "outbox";
    readonly etiqueta: "Outbox (para firmar)";
    readonly descripcion: "Donde se dejan los documentos que Dropbox Sign tiene que mandar a firmar.";
    readonly patrones: [RegExp];
}, {
    readonly valor: "pendbox";
    readonly etiqueta: "Pendbox (firma enviada)";
    readonly descripcion: "Intermedia: el documento ya se envió y espera la firma del destinatario.";
    readonly patrones: [RegExp];
}, {
    readonly valor: "firmados";
    readonly etiqueta: "Firmados";
    readonly descripcion: "Donde Dropbox Sign deja los documentos ya firmados. La carpeta se llama «Requested signatures»: ese nombre lo pone Dropbox Sign, no nosotros.";
    readonly patrones: [RegExp, RegExp];
}];
export type PropositoCarpeta = (typeof PROPOSITOS)[number]["valor"];
/** Los valores sueltos, para el `enum` de Mongoose y las validaciones. */
export declare const VALORES_PROPOSITO: readonly PropositoCarpeta[];
export declare const esProposito: (v: unknown) => v is PropositoCarpeta;
export declare const definicionDe: (v: string) => DefinicionProposito | undefined;
/** Cómo se llama un propósito en pantalla. Cae al valor crudo antes que mostrar vacío. */
export declare const etiquetaProposito: (v: string) => string;
/** El texto contra el que corren los patrones: la nota libre más el nombre visible de la carpeta. */
export declare const textoDeCarpeta: (c: {
    dropboxCarpeta?: string;
    detalle?: string;
}) => string;
/**
 * Qué propósito tendría esta carpeta según su nombre.
 *
 * Devuelve TODOS los que matchean, no el primero. Un nombre que encaja en dos propósitos es un dato
 * que hay que ver: significa que el matcheo por texto era ambiguo también antes, y que la carpeta
 * podía estar resolviendo cualquiera de los dos según el orden en que estuvieran cargadas.
 */
export declare const inferirPropositos: (c: {
    dropboxCarpeta?: string;
    detalle?: string;
}) => PropositoCarpeta[];
