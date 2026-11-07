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
export declare const PLACEHOLDER_CONTRATO_CUSTOM = "<p>{{firma}}</p><p>&nbsp;</p><p>&nbsp;</p><p>Aclaraci\u00F3n: {{nombre}} {{apellido}}</p><p>DNI: {{dni}}</p>";
export declare const PLACEHOLDER_RELEASE_CUSTOM = "<p>Release custom</p>";
/**
 * ¿El texto custom se puede usar para generar? Tiene que tener texto y no ser el placeholder (ni el de
 * contrato ni el de release: da igual cuál quedó, ninguno es un documento; el bloque de firma solo
 * tampoco, falta el cuerpo).
 */
export declare const textoCustomUsable: (html?: string | null) => boolean;
/** El texto custom que tiene el trámite para un release, o `null`. */
export declare const textoCustomDeRelease: (contenidos: {
    releaseId?: unknown;
    content?: string | null;
}[] | null | undefined, releaseId: string) => string | null;
