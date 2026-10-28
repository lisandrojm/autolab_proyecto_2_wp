/**
 * «VINCULADO A FIRMA» EN LOS ESTADOS QUE YA EXISTÍAN, UNA SOLA VEZ (patrón `formasPagoSeed.ts`).
 *
 * Marca los que son de firma por su nombre (ENVIO DE DOCUMENTACION, FIRMA PENDIENTE, FIRMA ENVIADA) o
 * porque vigilan la carpeta de enviados/firmados de Dropbox Sign. Sólo los que todavía no tienen la
 * marca definida y no son impositivos. Después, lo que cada estado tenga lo decide quien lo edita.
 */
export declare function marcarEstadosDeFirmaUnaVez(): Promise<void>;
