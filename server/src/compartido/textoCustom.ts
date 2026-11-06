/**
 * CONTRATO CUSTOM Y RELEASE CUSTOM: plantillas (`ContratoFrame` / `Release` con `esCustom`) cuyo cuerpo
 * se escribe al generar el documento, en la pestaña Firma digital. La plantilla guarda sólo un
 * placeholder; el texto real vive en el trámite (`UserProject.contracts[i].contenidoCustomContrato` y
 * `contenidoCustomReleases`) y no se reutiliza: cada trámite arranca del placeholder.
 *
 * El del contrato es el bloque de firma de la persona, para escribir el cuerpo arriba. Los renglones en
 * blanco van con `&nbsp;`: un `<p></p>` no ocupa lugar en el PDF y la aclaración quedaba pegada a la firma.
 *
 * Membrete, firma y {{variables}} funcionan como en cualquier plantilla: sólo el cuerpo es libre.
 *
 * Lo comparten el server (para negarse a generar con el placeholder) y el escritorio (para no habilitar
 * «Generar» hasta que haya texto), así que la regla vive en un solo lugar.
 */
export const PLACEHOLDER_CONTRATO_CUSTOM = "<p>{{firma}}</p><p>&nbsp;</p><p>&nbsp;</p><p>Aclaración: {{nombre}} {{apellido}}</p><p>DNI: {{dni}}</p>";
export const PLACEHOLDER_RELEASE_CUSTOM = "<p>Release custom</p>";
/** El placeholder anterior del contrato: puede haber quedado guardado en un borrador. */
const PLACEHOLDER_CONTRATO_ANTERIOR = "<p>Contrato custom</p>";

/** El texto del HTML del editor, sin etiquetas ni espacios de más. */
const textoPlano = (html?: string | null): string =>
  String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * ¿El texto custom se puede usar para generar? Tiene que tener texto y no ser el placeholder (ni el de
 * contrato ni el de release: da igual cuál quedó, ninguno es un documento; el bloque de firma solo
 * tampoco, falta el cuerpo).
 */
export const textoCustomUsable = (html?: string | null): boolean => {
  const texto = textoPlano(html);
  if (!texto) return false;
  return ![PLACEHOLDER_CONTRATO_CUSTOM, PLACEHOLDER_CONTRATO_ANTERIOR, PLACEHOLDER_RELEASE_CUSTOM].some((p) => texto === textoPlano(p));
};

/** El texto custom que tiene el trámite para un release, o `null`. */
export const textoCustomDeRelease = (
  contenidos: { releaseId?: unknown; content?: string | null }[] | null | undefined,
  releaseId: string,
): string | null => {
  const encontrado = (contenidos || []).find((c) => String(c?.releaseId ?? "") === String(releaseId));
  return encontrado?.content ?? null;
};
