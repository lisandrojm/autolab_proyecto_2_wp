/** Lo que hace falta de una plantilla para reconocerla. */
export interface PlantillaReconocible {
  name?: string;
  data?: { id?: number | string | null; nombre?: string } | null;
}

const nombrePlantilla = (cf: PlantillaReconocible): string => (cf.data?.nombre || cf.name || "").trim().toLowerCase();

/** `mas_largo` empieza con `mas_corto` y el corte cae en un límite de palabra (no en medio de un token). */
const esPrefijoConLimite = (masLargo: string, masCorto: string): boolean => {
  if (!masCorto || !masLargo.startsWith(masCorto)) return false;
  const siguiente = masLargo.charAt(masCorto.length);
  return siguiente === "" || !/[a-z0-9]/i.test(siguiente);
};

/**
 * Busca la plantilla de contrato (ContratoFrame) que corresponde al contrato.
 *
 * 1. Nombre exacto (la clave confiable: el wizard guarda el nombre exacto de la contratos-frame).
 * 2. ID Externo, solo con ids válidos (> 0). El 0 es un sentinel de "sin id" y matchearía cualquier
 *    contratos-frame con data.id 0 → descargaría un contrato equivocado.
 * 3. Fallback difuso por prefijo con límite de palabra, para nombres importados con un sufijo extra
 *    en cualquiera de los dos lados (p. ej. "Jornada 2030 SRL" → Plantilla "Jornada", o "Eventual
 *    Crew Reelshort" → Plantilla "Eventual Crew Reelshort - STMP - MSLIHB"). Solo matchea si hay UN
 *    candidato, o si todos los candidatos están anidados unos en otros (ahí gana el más específico,
 *    el de nombre más largo). Si hay candidatos genuinamente ambiguos (no anidados entre sí), no
 *    matchea nada: mejor mostrar "Contrato inexistente" que generar el PDF equivocado.
 */
export function plantillaDelContrato<T extends PlantillaReconocible>(contract: { nombre_contrato?: string | null; tipo_contrato_id?: unknown }, contratoFrames: T[]): T | null {
  const name = (contract.nombre_contrato || "").trim().toLowerCase();
  if (name) {
    const byName = contratoFrames.find((cf) => nombrePlantilla(cf) === name);
    if (byName) return byName;
  }

  const tid = Number(contract.tipo_contrato_id);
  if (Number.isFinite(tid) && tid > 0) {
    const byId = contratoFrames.find((cf) => cf.data?.id != null && Number(cf.data.id) === tid);
    if (byId) return byId;
  }

  if (name) {
    const candidatas = contratoFrames.filter((cf) => {
      const cfName = nombrePlantilla(cf);
      return !!cfName && (esPrefijoConLimite(name, cfName) || esPrefijoConLimite(cfName, name));
    });
    if (candidatas.length === 1) return candidatas[0];
    if (candidatas.length > 1) {
      const porLargo = [...candidatas].sort((a, b) => nombrePlantilla(b).length - nombrePlantilla(a).length);
      const masLargo = nombrePlantilla(porLargo[0]);
      const todasAnidadas = porLargo.every((cf) => {
        const n = nombrePlantilla(cf);
        return n === masLargo || esPrefijoConLimite(masLargo, n);
      });
      if (todasAnidadas) return porLargo[0];
    }
  }

  return null;
}
