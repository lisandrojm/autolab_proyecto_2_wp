/** Lee una propiedad sin importar la capitalización ni los guiones bajos de más. */
const prop = (obj, nombre) => {
    if (!obj || typeof obj !== "object")
        return undefined;
    const buscado = nombre.toLowerCase().replace(/_/g, "");
    for (const clave of Object.keys(obj)) {
        if (clave.toLowerCase().replace(/_/g, "") === buscado)
            return obj[clave];
    }
    return undefined;
};
const texto = (v) => (v === null || v === undefined ? "" : String(v).trim());
/**
 * ¿Este registro es el de CENTROS DE COSTO?
 *
 * Se aceptan las dos formas en que lo nombran las empresas: el código «CC» o una descripción que
 * hable de centros de costo. Es a propósito más ancha que una igualdad —«CENTRO DE COSTOS»,
 * «Centros de Costo», «CTRO COSTOS» pasan— y aun así rechaza cualquier otro tipo de auxiliar.
 */
export const esTipoCentrosDeCosto = (codigo, descripcion) => {
    const normalizar = (s) => s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    const cod = normalizar(codigo);
    const desc = normalizar(descripcion);
    if (cod === "cc")
        return true;
    return /c(en)?tr[oa]s?\s*(de\s*)?costos?/.test(desc);
};
/**
 * Convierte la respuesta del proceso 1656 en centros de costo.
 *
 * No escribe nada ni sabe de la base: devuelve los ítems o los motivos por los que esta respuesta no
 * se puede usar. Quien llama decide qué hacer —y con tres empresas, que una falle no tiene por qué
 * voltear a las otras dos—.
 */
export function leerRegistroAuxiliares(sobre) {
    const errores = [];
    const vacio = (msg, tipo = { codigo: "", descripcion: "" }) => ({ ok: false, items: [], tipo, errores: [...errores, msg] });
    if (!sobre || typeof sobre !== "object")
        return vacio("Tango no devolvió una respuesta que se pueda leer.");
    // `succeeded: false` es la forma en que esta API dice que algo salió mal, con el motivo en `message`.
    if (sobre.succeeded === false)
        return vacio(`Tango rechazó la consulta${sobre.message ? `: ${sobre.message}` : "."}`);
    const value = sobre.value;
    if (!value || typeof value !== "object")
        return vacio("La respuesta de Tango vino sin datos (`value` vacío).");
    const tipo = { codigo: texto(prop(value, "COD_TIPO_AUXILIAR")), descripcion: texto(prop(value, "DESC_TIPO_AUXILIAR")) };
    if (!esTipoCentrosDeCosto(tipo.codigo, tipo.descripcion)) {
        return vacio(`El registro que devolvió Tango es «${tipo.descripcion || tipo.codigo || "sin nombre"}», que no es el catálogo de centros de costo. No se tocó nada.`, tipo);
    }
    const auxiliares = prop(value, "AUXILIAR");
    if (!Array.isArray(auxiliares))
        return vacio("La respuesta no trae la lista de auxiliares (`AUXILIAR`).", tipo);
    if (auxiliares.length === 0)
        return vacio("Tango devolvió el catálogo de centros de costo vacío.", tipo);
    const items = [];
    auxiliares.forEach((a, i) => {
        const id = Number(prop(a, "ID_AUXILIAR"));
        const cod = texto(prop(a, "COD_AUXILIAR"));
        const desc = texto(prop(a, "DESC_AUXILIAR"));
        const hab = texto(prop(a, "HABILITADO")).toUpperCase();
        if (!Number.isInteger(id) || id <= 0 || !cod) {
            // Se informa y se sigue: un auxiliar roto no puede dejar sin catálogo a los otros 805.
            errores.push(`AUXILIAR[${i}]: ${!cod ? "sin COD_AUXILIAR" : `ID_AUXILIAR inválido (${texto(prop(a, "ID_AUXILIAR"))})`}. Se omitió.`);
            return;
        }
        items.push({
            idAuxiliar: id,
            codAuxiliar: cod,
            // La descripción es opcional en Tango; el código no. Sin descripción se usa el código, que es
            // lo que se muestra igual, en vez de descartar un centro que sí existe.
            descAuxiliar: desc || cod,
            habilitado: hab === "N" ? "N" : "S",
        });
    });
    if (items.length === 0)
        return vacio("Ninguno de los auxiliares que devolvió Tango tiene código e id válidos.", tipo);
    return { ok: true, items, tipo, errores };
}
