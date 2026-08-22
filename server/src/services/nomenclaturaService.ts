import NomenclaturaArchivo from "../models/NomenclaturaArchivo.js";
import { Company } from "../models/Company.js";
import { PATRON_POR_DEFECTO, TipoNomenclatura, renderNomenclatura, recortarNombre } from "../utils/nomenclatura.js";
import { datosNombreArchivo } from "../utils/employeeDocData.js";

/**
 * Razón social y CUIT de la empleadora, para el final del nombre.
 *
 * El CUIT sale ETIQUETADO (`CUIT-EMPRESA-30710295839`) y no como once dígitos sueltos. Dos motivos, y el
 * segundo importa: al lado del `CUIL-…` de la persona, dos números de once dígitos sin rótulo son
 * indistinguibles para quien mira la carpeta; y el respaldo que usa `extraerIdentidadDeArchivo` para
 * los archivos viejos busca justamente un CUIT suelto de once dígitos, así que dejarlo pelado sería
 * poner una trampa para el día que alguien saque `{{identidad}}` del patrón.
 */
export function empresaAValores(c: any): { empresa: string; empresaCuit: string } {
  const cuit = String(c?.cuit || "").replace(/\D/g, "");
  return { empresa: String(c?.razonSocial || ""), empresaCuit: cuit ? `CUIT-EMPRESA-${cuit}` : "" };
}

export async function datosEmpresa(empresaId: unknown, nombreCache?: string): Promise<{ empresa: string; empresaCuit: string }> {
  if (!empresaId) return { empresa: nombreCache || "", empresaCuit: "" };
  try {
    const c: any = await Company.findById(String(empresaId)).select("razonSocial cuit").lean();
    const v = empresaAValores(c);
    return { empresa: v.empresa || nombreCache || "", empresaCuit: v.empresaCuit };
  } catch {
    // Sin la empresa el nombre pierde un campo, no se rompe: el resto de los datos sigue estando.
    return { empresa: nombreCache || "", empresaCuit: "" };
  }
}

/**
 * El nombre de un archivo, según lo que el tenant configuró.
 *
 * Si no configuró nada rige `PATRON_POR_DEFECTO`. Los archivos ya generados NO se renombran nunca:
 * este patrón solo decide cómo se van a llamar los próximos.
 *
 * Ante CUALQUIER problema —la base no responde, el patrón guardado quedó raro, el render sale
 * vacío— cae al default en vez de fallar. Un documento tiene que poder generarse siempre: quedarse
 * sin contrato porque alguien escribió mal una configuración de nombres sería un intercambio pésimo.
 *
 * El resultado entra siempre en `MAX_NOMBRE`: si no entra, se recorta lo descriptivo sin tocar los
 * bloques que los parsers de vuelta necesitan (ver `recortarNombre`). `reservar` es lo que el que
 * llama va a pegar después y todavía no está en el string — como mínimo la extensión.
 */
export async function nombreArchivo(
  tenantId: unknown,
  tipo: TipoNomenclatura,
  datos: Record<string, unknown>,
  reservar = 4,
): Promise<string> {
  const porDefecto = renderNomenclatura(PATRON_POR_DEFECTO[tipo], datos);
  try {
    const fila = await NomenclaturaArchivo.findOne({ tenantId: tenantId as any, tipo }).select("patron").lean();
    if (!fila?.patron) return recortarNombre(porDefecto, reservar);
    const nombre = renderNomenclatura(fila.patron, datos);
    return recortarNombre(nombre || porDefecto, reservar);
  } catch (e) {
    console.warn("[NOMENCLATURA] No pude leer el patrón configurado; uso el de por defecto:", (e as any)?.message || e);
    return recortarNombre(porDefecto, reservar);
  }
}

/** Atajo para los documentos de un contrato: arma los datos y aplica el patrón. */
export async function nombreArchivoDocumento(opts: {
  tenantId: unknown;
  tipo: TipoNomenclatura;
  user: any;
  up: any;
  contract: any;
  docName?: string;
  extra?: string;
  /**
   * La empleadora YA resuelta, cuando quien llama la tiene.
   *
   * Hace falta porque no siempre sale del mismo lado: los documentos de ARCA usan la del contrato
   * (`empresaContratoId`), pero un Release usa la de `releaseEmpresas` del proyecto y un Contrato la
   * de `contratoEmpresas` — o la que se eligió al descargar. Deducirla desde acá miraba el campo
   * equivocado y el nombre salía sin empresa, que es exactamente lo que pasaba.
   */
  empresa?: any;
}): Promise<string> {
  const { tenantId, tipo, empresa, ...resto } = opts;
  const valoresEmpresa = empresa ? empresaAValores(empresa) : await datosEmpresa(resto.contract?.empresaContratoId, resto.contract?.nombre_empresa_contrato);
  return nombreArchivo(tenantId, tipo, { ...datosNombreArchivo({ tipo, ...resto }), ...valoresEmpresa });
}
