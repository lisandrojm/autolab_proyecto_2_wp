/**
 * COPIA EN DROPBOX DE LO QUE ARCA CONTESTÓ EN CADA REGISTRO (link de registro público).
 *
 * Cada consulta de «Validar CUIT» del formulario y cada registro terminado dejan un `.json` en
 * `/WEPRODU/Registros/AAAA-MM/`. Es la evidencia de qué dijo el organismo en ese momento: si después
 * hay que explicar un nombre sellado, un «CUIT ya registrado» o un CUIT inactivo, está la respuesta tal
 * cual vino, no lo que se dedujo de ella.
 *
 * SIN `/FZERO S.R.L` ADELANTE: es el nombre del espacio de equipo en la web, no un path de la API (ver
 * `espejoDropboxParitaria.ts`). Para el token, `/WEPRODU` cuelga de la raíz.
 *
 * NUNCA FRENA EL REGISTRO: se sube en segundo plano y un error de Dropbox solo se loguea. Del otro
 * lado hay una persona sola completando un formulario; no puede quedar esperando a Dropbox.
 *
 * NO SE GUARDA LA CONTRASEÑA ni el token del link: solo lo que respondió ARCA y quién lo pidió.
 */
export declare const BASE_REGISTROS = "/WEPRODU/Registros";
/** `validar-cuit` (cada consulta del botón) o `registro` (el registro terminado). */
export type TipoEvidenciaRegistro = "validar-cuit" | "registro";
/**
 * Sube la evidencia en segundo plano. No devuelve nada que haya que esperar y no tira nunca.
 */
export declare function guardarRespuestaDeRegistro(o: {
    tenantId: string;
    tipo: TipoEvidenciaRegistro;
    cuit?: string;
    linkId?: string;
    contenido: Record<string, unknown>;
}): void;
