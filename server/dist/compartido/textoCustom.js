/**
 * CONTRATO CUSTOM Y RELEASE CUSTOM: plantillas (`ContratoFrame` / `Release` con `esCustom`) cuyo cuerpo
 * se escribe al generar el documento, en la pestaña Firma digital. La plantilla guarda sólo un
 * placeholder; el texto real vive en el trámite (`UserProject.contracts[i].contenidoCustomContrato` y
 * `contenidoCustomReleases`) y no se reutiliza: cada trámite arranca del placeholder.
 *
 * Membrete, firma y {{variables}} funcionan como en cualquier plantilla: sólo el cuerpo es libre.
 *
 * Lo comparten el server (para negarse a generar con el placeholder) y el escritorio (para no habilitar
 * «Generar» hasta que haya texto), así que la regla vive en un solo lugar.
 */
export const PLACEHOLDER_CONTRATO_CUSTOM = "<p>Contrato custom</p>";
export const PLACEHOLDER_RELEASE_CUSTOM = "<p>Release custom</p>";
/** El texto del HTML del editor, sin etiquetas ni espacios de más. */
const textoPlano = (html) => String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
/**
 * ¿El texto custom se puede usar para generar? Tiene que tener texto y no ser el placeholder (ni el de
 * contrato ni el de release: da igual cuál quedó, ninguno es un documento).
 */
export const textoCustomUsable = (html) => {
    const texto = textoPlano(html);
    if (!texto)
        return false;
    return texto !== textoPlano(PLACEHOLDER_CONTRATO_CUSTOM) && texto !== textoPlano(PLACEHOLDER_RELEASE_CUSTOM);
};
/** El texto custom que tiene el trámite para un release, o `null`. */
export const textoCustomDeRelease = (contenidos, releaseId) => {
    const encontrado = (contenidos || []).find((c) => String(c?.releaseId ?? "") === String(releaseId));
    return encontrado?.content ?? null;
};
