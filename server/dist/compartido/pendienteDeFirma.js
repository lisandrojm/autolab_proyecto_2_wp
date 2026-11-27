/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUÉ LE FALTA A UN CONTRATO PARA IR A LA FIRMA, y si se puede generar sin preguntar nada
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Es la regla de la bandeja Generar Documentos (paso 3): qué plantilla de contrato le toca, si el
 * contrato se firma, qué releases van, si el alta de ARCA se suma, con qué empresa se genera y qué
 * no se puede generar sin una decisión de una persona (el proyecto tiene varias empresas y la fila
 * no eligió, un contrato custom sin texto, una plantilla vacía).
 *
 * Vivía en el frontend (`ContractBulkTabs.tsx`, 19/10/2026). Pasó a `compartido` el 27/11/2026 para
 * que la GENERACIÓN AUTOMÁTICA del server (`services/automatizacionesContratacion`) decida exactamente
 * lo mismo que los botones de la pantalla: una sola regla, dos consumidores. Es PURA: sin React, sin
 * Mongoose, con tipos estructurales que cumplen tanto las filas del listado como los documentos de la
 * base.
 */
import { plantillaDelContrato } from "./plantillaDelContrato.js";
import { textoCustomDeRelease, textoCustomUsable } from "./textoCustom.js";
const id = (x) => (x && typeof x === "object" && "_id" in x ? String(x._id ?? "") : x == null ? "" : String(x));
const tipoDePlantilla = (p) => (p && p.contratoId && typeof p.contratoId === "object" ? p.contratoId.data || {} : null);
// ── Los releases de un tipo de contrato (se asignan desde el release, 16/10/2026) ──
/** ¿Este release está asignado EXPLÍCITAMENTE a este tipo de contrato (`Release.contratoIds`)? */
export const releaseEsDelTipo = (release, tipoId) => !!tipoId && Array.isArray(release.contratoIds) && release.contratoIds.map((x) => id(x)).includes(String(tipoId));
/** Un release sin contratos asignados: sólo lo llevan los tipos que no eligieron ninguno. */
export const releaseSinContratos = (release) => !Array.isArray(release.contratoIds) || release.contratoIds.length === 0;
/**
 * LOS RELEASES QUE LE TOCAN A UN TIPO DE CONTRATO:
 *  - si el tipo tiene releases ASIGNADOS, sólo esos («que aparezca sólo el que se eligió»);
 *  - si no tiene ninguno, los que no están asignados a ningún contrato, que es como estaban todos antes
 *    de poder asignarlos: así los tipos que nadie configuró siguen igual.
 * Sin tipo conocido, todos los que vienen. `universo`: si el tipo tiene asignados se decide con TODOS
 * los releases, no con la lista ya filtrada (un asignado que no va a firma igual hace que el tipo deje
 * de llevar los generales).
 */
export const releasesDelTipo = (releases, tipo, universo) => {
    const tipoId = tipo?._id ? id(tipo._id) : "";
    if (!tipoId)
        return releases;
    const tieneAsignados = (universo ?? releases).some((r) => releaseEsDelTipo(r, tipoId));
    return releases.filter((r) => (tieneAsignados ? releaseEsDelTipo(r, tipoId) : releaseSinContratos(r)));
};
// ── Los checks del tipo de contrato y del tipo de release ──
/** «Se envía a firmar» del Tipo de Contrato de la plantilla. Sin el dato populado, sí (como antes de existir el campo). */
export const contratoRequiereFirma = (template) => tipoDePlantilla(template)?.requiereFirma !== false;
/** «Se envía a firmar el release» del Tipo de Contrato. Sin el dato, sí. */
export const contratoRequiereFirmaRelease = (template) => tipoDePlantilla(template)?.requiereFirmaRelease !== false;
/** «Se envía a firmar el alta de ARCA» del Tipo de Contrato. Sin el dato, sí. */
export const contratoRequiereFirmaAlta = (template) => tipoDePlantilla(template)?.requiereFirmaAlta !== false;
/** Mismo criterio, para el Tipo de Release (`release.releaseTipoId`). */
export const releaseRequiereFirma = (release) => {
    const tipo = release.releaseTipoId;
    return tipo && typeof tipo === "object" ? tipo.requiereFirma !== false : true;
};
/**
 * La plantilla se puede generar si tiene contenido REAL redactado. El editor devuelve "<p></p>" cuando
 * está vacío, así que se mira el texto sin etiquetas. Una CUSTOM no tiene contenido propio (sólo el
 * placeholder): el texto es del trámite, y eso lo mira `pendienteDeFirma`.
 */
export const plantillaTieneContenido = (cf) => !!cf?.esCustom || (!!cf?.content && cf.content.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0);
/** La plantilla de contrato que le corresponde al contrato (ver `plantillaDelContrato`). */
export const plantillaDe = (contrato, plantillas) => plantillaDelContrato(contrato, plantillas);
/**
 * EL TIPO DE CONTRATO DE LA FILA, para saber qué releases le tocan: el que guarda el contrato
 * (`tipoContratoId` en la fila, `contrato_id` en la base) y, si no lo guarda, el principal de su plantilla.
 */
export const tipoDeLaFila = (contrato, template) => {
    const propio = id(contrato.tipoContratoId) || id(contrato.contrato_id);
    if (propio)
        return { _id: propio };
    const principal = template?.contratoId ? id(template.contratoId) : "";
    return principal ? { _id: principal } : null;
};
/**
 * LOS RELEASES QUE VAN A FIRMA PARA ESTA FILA: los que su tipo de release manda a firmar (ya vienen
 * filtrados en `releasesQueFirman`) y sólo si el Tipo de Contrato también lo pide. Un release custom
 * entra sólo en el trámite que tiene su texto escrito.
 */
export const releasesDeLaFila = (template, releasesQueFirman, contrato, todosLosReleases) => contratoRequiereFirmaRelease(template) ? releasesDelTipo(releasesQueFirman, tipoDeLaFila(contrato, template), todosLosReleases).filter((r) => !r.esCustom || textoCustomUsable(textoCustomDeRelease(contrato.contenidoCustomReleases, id(r._id)))) : [];
/** El alta de ARCA va a firma: trámite de alta temprana, documento cargado y el tipo lo pide. */
export const altaVaAFirma = (contrato, template, tipo) => tipo === "alta_temprana_afip" && !!contrato.altaDocumentoUrl && contratoRequiereFirmaAlta(template);
export const contratoGenerado = (c) => !!c.firmaGeneradoAt;
export const releasesGenerados = (c, releasesAplicables) => {
    if (releasesAplicables.length === 0)
        return true;
    if (!c.firmaReleasesGeneradoAt)
        return false;
    // Un release custom entra al grupo cuando se le escribe el texto: si se sumó después de generar, el grupo ya no es el que se tiene que enviar.
    const conPdf = new Set((c.firmaReleases || []).map((f) => id(f.releaseId)));
    return releasesAplicables.filter((a) => a.esCustom).every((a) => conPdf.has(id(a._id)));
};
/** Con qué empresa generar: la guardada o, si el proyecto ofrece una sola, ésa. Con varias y ninguna elegida, falta una decisión. */
export const empresaParaGenerar = (guardada, opciones) => {
    const g = id(guardada);
    if (g)
        return { id: g, falta: false };
    const lista = opciones || [];
    if (lista.length <= 1)
        return { id: lista[0]?.id, falta: false };
    return { falta: true };
};
/**
 * LO QUE LE FALTA A UNA FILA PARA PODER ENVIARSE, y si se puede generar sin preguntar nada.
 *
 * `releasesQueFirman`: los releases activos cuyo tipo de release manda a firmar. `todosLosReleases`:
 * los activos, con o sin firma (para decidir si el tipo tiene asignados; ver `releasesDelTipo`).
 */
export function pendienteDeFirma(contrato, plantillas, releasesQueFirman, tipo, todosLosReleases) {
    const template = plantillaDe(contrato, plantillas);
    const contratoAplica = contratoRequiereFirma(template);
    const releasesAplicables = releasesDeLaFila(template, releasesQueFirman, contrato, todosLosReleases);
    const alta = altaVaAFirma(contrato, template, tipo);
    const algoAplica = contratoAplica || releasesAplicables.length > 0 || alta;
    const faltaContrato = contratoAplica && !contratoGenerado(contrato);
    const faltaRelease = releasesAplicables.length > 0 && !releasesGenerados(contrato, releasesAplicables);
    const empC = empresaParaGenerar(contrato.empresaContratoId, contrato.contratoEmpresas);
    const empR = empresaParaGenerar(contrato.empresaReleaseId, contrato.releaseEmpresas);
    let motivoContrato = "";
    if (faltaContrato) {
        if (!template)
            motivoContrato = "No tiene plantilla de contrato";
        else if (template.esCustom && !textoCustomUsable(contrato.contenidoCustomContrato))
            motivoContrato = "Contrato custom sin texto escrito";
        else if (!template.esCustom && !plantillaTieneContenido(template))
            motivoContrato = "La plantilla del contrato no tiene contenido";
        else if (empC.falta)
            motivoContrato = "Falta elegir la empresa del contrato";
    }
    const motivoRelease = faltaRelease && empR.falta ? "Falta elegir la empresa del release" : "";
    const motivo = [motivoContrato, motivoRelease].filter(Boolean).join(" · ");
    const enviable = !contrato.firmaEnviadaAt && algoAplica && !faltaContrato && !faltaRelease;
    return {
        algoAplica,
        template,
        contratoAplica,
        releasesAplicables,
        faltaContrato,
        faltaRelease,
        empresaContrato: empC.id,
        empresaRelease: empR.id,
        motivoContrato,
        motivoRelease,
        motivo,
        enviable,
        envio: { incluirContrato: contratoAplica, incluirReleases: releasesAplicables.length > 0, incluirAlta: alta },
    };
}
