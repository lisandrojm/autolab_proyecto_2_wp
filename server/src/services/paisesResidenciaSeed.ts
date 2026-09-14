import { Info } from "../models/Info.js";
import { PaisResidencia } from "../models/PaisResidencia.js";
import { SemillaAplicada } from "../models/SemillaAplicada.js";

const CLAVE = "paises-residencia-desde-frame";

/**
 * LA PRIMERA CARGA DEL ABM DE PAÍSES DE RESIDENCIA, UNA SOLA VEZ.
 *
 * Copia los países de FRAME (`Info` con `type: "pais"`) CON SU MISMO `data.id`. Ese es el punto: los
 * domicilios ya guardados tienen `metadata.paisId` apuntando a esos ids, así que al mudar el país del
 * domicilio a este catálogo siguen resolviendo a su nombre sin migrar ningún usuario.
 *
 * Después de la primera vez NO vuelve a tocar nada: el catálogo es de quien lo administra desde el
 * ABM, y un reinicio no puede reponer un país que alguien borró. Por eso se anota en
 * `SemillaAplicada` en vez de preguntar si la colección está vacía.
 *
 * La marca se toma ANTES de copiar y con `upsert`: si el server corre en más de una instancia, sólo la
 * que la crea hace la copia. Si la copia falla, se suelta la marca para reintentar en el próximo arranque.
 */
export async function sembrarPaisesResidenciaUnaVez(): Promise<void> {
  const marca = await SemillaAplicada.updateOne({ clave: CLAVE }, { $setOnInsert: { clave: CLAVE, aplicadaEl: new Date() } }, { upsert: true });
  if (marca.upsertedCount === 0) return; // ya se aplicó, acá o en otra instancia

  try {
    // Si alguien ya cargó países a mano antes de que existiera esta carga, no se mezcla nada.
    if ((await PaisResidencia.countDocuments()) > 0) {
      await SemillaAplicada.updateOne({ clave: CLAVE }, { $set: { detalle: "El catálogo ya tenía países: no se copió nada." } });
      return;
    }

    /*
      Uno por id: los países de FRAME pueden estar repetidos entre tenants con el mismo `data.id`, y acá
      el id es la identidad —es lo que guarda cada persona—, así que dos filas con el mismo harían
      ambiguo a qué país apunta.
    */
    const paises: any[] = await Info.find({ type: "pais" }).sort({ name: 1 }).lean();
    const porId = new Map<number, { externalId: string; name: string; activo: boolean; data: { id: number; nombre: string } }>();
    for (const p of paises) {
      const id = Number(p?.data?.id);
      if (p?.data?.id == null || Number.isNaN(id) || !p?.name || porId.has(id)) continue;
      porId.set(id, { externalId: String(id), name: p.name, activo: true, data: { id, nombre: p.name } });
    }
    const filas = [...porId.values()];

    if (filas.length > 0) await PaisResidencia.insertMany(filas, { ordered: false });
    await SemillaAplicada.updateOne({ clave: CLAVE }, { $set: { detalle: `Se copiaron ${filas.length} países del catálogo de FRAME.` } });
    console.log(`🌎 Países de residencia: se copiaron ${filas.length} países del catálogo de FRAME (una sola vez)`);
  } catch (error) {
    await SemillaAplicada.deleteOne({ clave: CLAVE });
    throw error;
  }
}
