import { getTenantDropboxConfig } from "./dropboxService.js";
/**
 * ESPEJO EN DROPBOX: una copia con nombre legible de cada PDF de paritaria.
 *
 * DROPBOX ES ESPEJO, NO ALMACÉN. La app sigue leyendo el archivo del disco del server y ningún
 * endpoint lee de acá. Si Dropbox falla, cambia de token o alguien reordena la carpeta a mano, la app
 * no se entera y no se rompe: servir un PDF sigue siendo abrir un archivo local, que no falla nunca.
 * Agregarle red, rate limits y un modo de falla nuevo a un camino que ya funciona sería cambiar un
 * problema chico —que la evidencia viva en un solo disco— por uno grande.
 *
 * DOS ESQUEMAS DE NOMBRE PARA DOS CONSUMIDORES. En disco el archivo se llama por su hash, que es
 * correcto para la app —identidad, deduplicación, detección de reemplazos— e inútil para una persona
 * que abre una carpeta. Acá se llama por lo que dice. Por eso la publicación guarda las dos
 * referencias, y la de Dropbox es solo un puntero de conveniencia que puede quedar viejo.
 */
/**
 * Dónde vive el espejo. CONFIGURACIÓN, no literal en el código.
 *
 * Hoy cuelga de FZERO porque WeProdu corre para las empresas del usuario. Pero una paritaria no es un
 * documento de FZERO: es del convenio, y le sirve igual a cualquier tenant. El día que entre una
 * productora ajena esta carpeta se muda, y con la ruta en configuración mudarla es cambiar una
 * variable y correr el script — con la ruta escrita en el código, es una migración.
 *
 * QUEDA FUERA DE `ARCA/` A PROPÓSITO: ese árbol tiene «Alta temprana» y «Constancia de CUIT», que son
 * datos personales de trabajadores. Una paritaria es un documento público del gremio. Mezclarlas
 * obliga a fijar los permisos de la carpeta por lo más sensible que contiene, y entonces quien
 * necesita mirar una escala termina con acceso a constancias de CUIT.
 */
export declare const BASE_POR_DEFECTO = "/WEPRODU/Paritarias";
export declare const basePariarias: () => string;
export interface ConexionEspejo {
    tenantId: string;
    cfg: NonNullable<ReturnType<typeof getTenantDropboxConfig>>;
}
/**
 * La conexión de Dropbox a usar: EXACTAMENTE LA MISMA QUE SIRVE `/WEPRODU/ARCA`.
 *
 * HAY DOS INTEGRACIONES QUE SE LLAMAN «DROPBOX» Y NO SON LO MISMO:
 *
 *   `integrations.dropbox`      · la conexión de ARCHIVOS (OAuth con refresh token). Es la que lista
 *                                 y sirve la pestaña Documentos, la que tiene `/WEPRODU/ARCA`, y la
 *                                 única que este espejo usa.
 *   `integrations.dropboxSign`  · una casilla IMAP para leer los avisos de Dropbox Sign. No toca
 *                                 archivos ni tiene token de Dropbox: no es candidata a nada de acá.
 *
 * El `rootPath` de la primera —hoy `/HelloSign`— es SOLO la carpeta donde abre el explorador de
 * Documentos. No limita el token: la raíz real del espacio tiene `WEPRODU`, `HelloSign` y las
 * carpetas de proyecto como hermanas. Confundir ese `rootPath` con el alcance del token fue lo que
 * hizo concluir que la app no veía este Dropbox.
 *
 * Si hay más de un tenant conectado hay que elegir explícitamente: subir la evidencia a la cuenta
 * equivocada porque el script agarró la primera que encontró es peor que no subirla.
 */
export declare const conexionEspejo: () => Promise<{
    conexion: ConexionEspejo | null;
    motivo: string;
}>;
/**
 * Que la cuenta conectada sea la que tiene esta carpeta, ANTES de subir nada.
 *
 * El chequeo existe por un modo de falla concreto y silencioso: si el token es de una app con carpeta
 * propia (el caso de la integración de Dropbox Sign, cuya raíz son `Outbox`, `Pendbox` y compañía),
 * subir a `/FZERO S.R.L/WEPRODU/Paritarias` NO falla — Dropbox crea ese árbol ADENTRO de la carpeta
 * de la app. Quedarían 33 PDF en un lugar que nadie va a mirar, con la corrida diciendo «ok».
 *
 * Se verifica el PRIMER tramo de la ruta y no la ruta entera: que falte `Paritarias` es normal la
 * primera vez y se crea sola al subir; que falte `FZERO S.R.L` en la raíz significa que estamos
 * mirando otro Dropbox, y ahí no hay nada que crear.
 */
export declare const baseAlcanzable: (con: ConexionEspejo, base?: string) => Promise<{
    ok: boolean;
    motivo: string;
}>;
/** El año de la carpeta: el del acuerdo si se detectó, si no el de la detección. */
export declare const anioDe: (periodo?: string | null, detectadaEl?: Date | null) => string;
/**
 * El nombre legible: `2026-04-28 · SATSAID · 131-75 + 634-11 · RE-2026-43103223.pdf`.
 *
 * Las barras de los convenios pasan a guiones porque `/` separa carpetas: «0131/75» en un nombre de
 * archivo crearía una carpeta «0131» con un archivo «75 + ...» adentro.
 *
 * El saneado es el de `archivoParitariaService`, con los espacios CONSERVADOS: en el nombre sugerido
 * de una descarga los espacios molestan, pero acá son el punto — el nombre existe para que una
 * persona lo lea en una carpeta.
 */
export declare const nombreLegible: (p: {
    detectadaEl?: Date | null;
    textoEnlace?: string;
    entidad: string;
    conveniosMencionados?: string[];
    periodo?: string | null;
    expediente?: string | null;
}) => string;
export declare const rutaEspejo: (entidad: string, anio: string, nombre: string, base?: string) => string;
/**
 * Sube una copia. Devuelve el estado que se guarda en la publicación.
 *
 * NO LANZA: el espejo nunca puede tumbar a quien lo llama. La detección de una paritaria nueva vale
 * mucho más que su copia de respaldo, y perder el aviso de que salió un acuerdo porque Dropbox
 * devolvió 429 sería cambiar un problema chico por uno grande. Lo que falla queda en `pendiente` y se
 * reintenta en la próxima corrida.
 */
export declare const subirEspejo: (con: ConexionEspejo, path: string, bytes: Buffer) => Promise<{
    estado: "ok" | "pendiente" | "error";
    motivo: string;
}>;
