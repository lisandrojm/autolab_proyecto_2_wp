import { Types } from "mongoose";
import { CentroCosto, sincronizarCamposDerivados } from "../models/CentroCosto.js";
import { Company } from "../models/Company.js";
import { tangoApi, TangoApi } from "./tangoApi.js";
import { leerRegistroAuxiliares } from "./centrosCostoTango.js";
/*
  TRAER LOS CENTROS DE COSTO DE TANGO, DE LAS TRES EMPRESAS.

  Los centros de costo son un tipo de AUXILIAR de Tango, y viven en el proceso 1656, registro 1, de
  cada empresa. Cada empresa tiene su propio Tango: se le pregunta a cada una con su `tangoId`.

  TRES DECISIONES QUE EXPLICAN CÓMO ESTÁ ESCRITO:

  1. CADA EMPRESA VA POR SU CUENTA. Si una no contesta, o contesta otro tipo de auxiliar, las otras
     dos se sincronizan igual y se informa cuál falló. Una caída de un Tango no puede dejar sin
     catálogo a toda la plataforma.

  2. NO SE BORRA NADA QUE NO SE HAYA PODIDO REEMPLAZAR. Lo de una empresa se reemplaza SÓLO si su
     consulta trajo centros: el modo «borro y escribo lo que vino» deja el catálogo vacío el día que
     Tango devuelve una lista vacía por un problema suyo. Los que dejaron de estar en Tango se
     marcan como inhabilitados en vez de borrarse, porque puede haber proyectos apuntándoles.

  3. LOS CENTROS QUE NO SON DE NINGUNA EMPRESA NO SE TOCAN. Son los que cargó alguien a mano o los
     que entraron por el archivo: la sincronización administra lo suyo y no pisa lo ajeno.
*/
/** Dónde vive el catálogo de centros de costo en Tango. Es igual en las tres empresas. */
export const PROCESO_CENTROS_COSTO = 1656;
export const REGISTRO_CENTROS_COSTO = 1;
/**
 * Sincroniza una empresa.
 *
 * Exportada aparte para poder correr una sola —cuando una falló y las demás ya están— sin repetir
 * las tres consultas.
 */
export async function sincronizarEmpresa(empresa) {
    const base = { empresaId: String(empresa._id), empresa: empresa.razonSocial || "(sin nombre)", tangoId: empresa.tangoId, ok: false, creados: 0, actualizados: 0, inhabilitados: 0, total: 0, errores: [] };
    if (!empresa.tangoId) {
        return { ...base, errores: ["No tiene cargado el ID de Tango: no se le puede pedir el catálogo."] };
    }
    let sobre;
    try {
        sobre = await tangoApi.getRegistro(PROCESO_CENTROS_COSTO, REGISTRO_CENTROS_COSTO, empresa.tangoId);
    }
    catch (e) {
        return { ...base, errores: [`No se pudo consultar Tango: ${e?.response?.status ? `HTTP ${e.response.status}` : e?.message || "error de red"}.`] };
    }
    const leido = leerRegistroAuxiliares(sobre);
    const tipo = leido.tipo.codigo || leido.tipo.descripcion ? `${leido.tipo.codigo}${leido.tipo.descripcion ? ` — ${leido.tipo.descripcion}` : ""}` : undefined;
    if (!leido.ok)
        return { ...base, tipo, errores: leido.errores };
    const empresaId = new Types.ObjectId(String(empresa._id));
    const ahora = new Date();
    /*
      Upsert por (empresa, idAuxiliar). Los derivados se calculan acá porque `bulkWrite` no pasa por los
      hooks del documento, y sin ellos el catálogo quedaría sin `name`/`data.id`, que es lo que leen la
      resolución del proyecto y el código anterior al cambio.
    */
    const ops = leido.items.map((i) => {
        const doc = sincronizarCamposDerivados({ ...i });
        return {
            updateOne: {
                filter: { empresaId, idAuxiliar: i.idAuxiliar },
                update: {
                    $set: {
                        empresaId,
                        empresaNombre: empresa.razonSocial || "",
                        origen: "tango",
                        sincronizadoEl: ahora,
                        idAuxiliar: doc.idAuxiliar,
                        codAuxiliar: doc.codAuxiliar,
                        descAuxiliar: doc.descAuxiliar,
                        habilitado: doc.habilitado,
                        name: doc.name,
                        externalId: doc.externalId,
                        data: doc.data,
                    },
                },
                upsert: true,
            },
        };
    });
    const r = await CentroCosto.bulkWrite(ops, { ordered: false });
    /*
      LOS QUE YA NO ESTÁN EN TANGO se marcan inhabilitados, no se borran: puede haber proyectos
      apuntándoles, y borrarlos dejaría esos proyectos mostrando «ID: 863» sin forma de saber qué era.
      Inhabilitado ya significa exactamente eso: existe, no se ofrece más para elegir.
    */
    const idsQueVinieron = leido.items.map((i) => i.idAuxiliar);
    const bajas = await CentroCosto.updateMany({ empresaId, idAuxiliar: { $nin: idsQueVinieron }, habilitado: { $ne: "N" } }, { $set: { habilitado: "N", sincronizadoEl: ahora } });
    return {
        ...base,
        ok: true,
        tipo,
        creados: r.upsertedCount || 0,
        actualizados: r.modifiedCount || 0,
        inhabilitados: bajas.modifiedCount || 0,
        total: leido.items.length,
        // Los auxiliares rotos que se omitieron: la sincronización salió bien igual, pero hay que verlos.
        errores: leido.errores,
    };
}
/**
 * Sincroniza TODAS las empresas que tengan `tangoId`.
 *
 * `syncIndexes` al principio: los únicos de este catálogo pasaron de ser globales a ser por empresa
 * (ver el modelo), y el índice viejo sigue vivo en la base hasta que alguien lo reemplace. Sin esto,
 * la segunda empresa choca contra el `idAuxiliar` de la primera y no entra ni un registro suyo.
 */
export async function sincronizarCentrosCostoDesdeTango() {
    if (!TangoApi.configurada())
        throw new Error("Falta configurar TANGO_API_URL: sin eso no se puede consultar Tango.");
    try {
        await CentroCosto.syncIndexes();
    }
    catch (e) {
        console.warn("[CENTROS-COSTO-SYNC] No se pudieron actualizar los índices:", e?.message || e);
    }
    const empresas = await Company.find({ tangoId: { $exists: true, $nin: [null, ""] } })
        .select("razonSocial tangoId")
        .lean();
    const resultados = [];
    for (const e of empresas) {
        const r = await sincronizarEmpresa(e);
        resultados.push(r);
        console.log(`[CENTROS-COSTO-SYNC] ${r.empresa}: ${r.ok ? `${r.total} centros (${r.creados} nuevos, ${r.actualizados} actualizados, ${r.inhabilitados} dados de baja)` : `FALLÓ · ${r.errores[0] || "sin detalle"}`}`);
    }
    const totalCatalogo = await CentroCosto.countDocuments({});
    return { ok: resultados.some((r) => r.ok), empresas: resultados, totalCatalogo, sincronizadoEl: new Date() };
}
/** Cuándo se sincronizó por última vez y cuántos centros tiene cada empresa. Para mostrarlo. */
export async function estadoSincronizacion() {
    const [ultimo, total, porEmpresa] = await Promise.all([
        CentroCosto.findOne({ sincronizadoEl: { $ne: null } }).sort({ sincronizadoEl: -1 }).select("sincronizadoEl").lean(),
        CentroCosto.countDocuments({}),
        CentroCosto.aggregate([{ $group: { _id: "$empresaNombre", total: { $sum: 1 } } }, { $sort: { total: -1 } }]),
    ]);
    return {
        sincronizadoEl: ultimo?.sincronizadoEl || null,
        total,
        porEmpresa: porEmpresa.map((g) => ({ empresa: g._id || "Sin empresa", total: g.total })),
    };
}
