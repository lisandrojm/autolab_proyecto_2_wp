const DOMINIO_SERVICIO = /serviciossegsoc\.afip\.gob\.ar/i;
const DOMINIO_AFIP = /auth\.afip\.gob\.ar|portalcf\.cloud\.afip\.gob\.ar/i;
const SESION_CAIDA = /sesi[oó]n ha finalizado|no ha iniciado su sesi[oó]n|ingrese con su clave fiscal/i;
export function clasificarPantalla(url, texto) {
    if (!DOMINIO_SERVICIO.test(url))
        return DOMINIO_AFIP.test(url) ? "login" : "otra";
    // La URL manda sobre el texto: son los dos redirects propios del servicio cuando no hay sesión
    // suya, y hay que reconocerlos aunque la página venga vacía o no se haya podido leer el texto.
    if (/FinSession\.aspx/i.test(url))
        return "login";
    if (/ErrorPage\.aspx/i.test(url))
        return "error";
    if (SESION_CAIDA.test(texto))
        return "login";
    if (/ha ocurrido un error/i.test(texto))
        return "error";
    return "servicio";
}
