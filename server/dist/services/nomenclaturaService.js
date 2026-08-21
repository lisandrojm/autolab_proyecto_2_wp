import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { PATRON_POR_DEFECTO, renderNomenclatura } from "../utils/nomenclatura.js";
import { datosNombreArchivo } from "../utils/employeeDocData.js";
/**
 * El nombre de un archivo, según lo que el tenant configuró.
 *
 * Si no configuró nada rige `PATRON_POR_DEFECTO`, que reproduce exactamente el nombre que la
 * plataforma generaba antes: por eso esto se puede soltar sin migrar nada.
 *
 * Ante CUALQUIER problema —la base no responde, el patrón guardado quedó raro, el render sale
 * vacío— cae al default en vez de fallar. Un documento tiene que poder generarse siempre: quedarse
 * sin contrato porque alguien escribió mal una configuración de nombres sería un intercambio pésimo.
 */
export async function nombreArchivo(tenantId, tipo, datos) {
    const porDefecto = renderNomenclatura(PATRON_POR_DEFECTO[tipo], datos);
    try {
        const fila = await NomenclaturaArchivo.findOne({ tenantId: tenantId, tipo }).select("patron").lean();
        if (!fila?.patron)
            return porDefecto;
        const nombre = renderNomenclatura(fila.patron, datos);
        return nombre || porDefecto;
    }
    catch (e) {
        console.warn("[NOMENCLATURA] No pude leer el patrón configurado; uso el de por defecto:", e?.message || e);
        return porDefecto;
    }
}
/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export async function nombreArchivoDocumento(opts) {
    const { tenantId, tipo, ...resto } = opts;
    return nombreArchivo(tenantId, tipo, datosNombreArchivo({ tipo, ...resto }));
}
