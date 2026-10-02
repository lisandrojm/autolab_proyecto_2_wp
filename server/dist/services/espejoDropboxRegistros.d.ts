/**
 * COPIA EN DROPBOX DE LO QUE ARCA CONTESTÓ AL REGISTRARSE (link de registro público).
 *
 * Un `.json` POR CUIT en `/WEPRODU/Registros/<cuit>_registro.json`, con la ÚLTIMA validación: cada
 * registro nuevo de ese CUIT lo reemplaza. Las consultas sueltas de «Validar CUIT» no se guardan (eran
 * un log que no se iba a mirar); lo que importa es con qué respuesta de ARCA quedó registrada la persona.
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
/**
 * Sube la evidencia en segundo plano. No devuelve nada que haya que esperar y no tira nunca.
 */
export declare function guardarRespuestaDeRegistro(o: {
    tenantId: string;
    cuit?: string;
    linkId?: string;
    contenido: Record<string, unknown>;
}): void;
