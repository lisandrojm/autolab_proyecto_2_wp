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

export interface ResultadoEmpresa {
  empresaId: string;
  empresa: string;
  tangoId?: string;
  ok: boolean;
  /** Cómo llama Tango a este tipo de auxiliar en esta empresa («CC — CENTRO DE COSTOS»). */
  tipo?: string;
  creados: number;
  actualizados: number;
  /** Los que ya no están en Tango y quedaron marcados como inhabilitados. */
  inhabilitados: number;
  total: number;
  errores: string[];
}

export interface ResultadoSync {
  ok: boolean;
  empresas: ResultadoEmpresa[];
  /** Cuántos centros quedaron en el catálogo, en total. */
  totalCatalogo: number;
  sincronizadoEl: Date;
}

/**
 * Por qué no se pudo hablar con Tango, en palabras de quien tiene que ir a arreglarlo.
 *
 * «timeout of 30000ms exceeded» no dice qué hacer. Lo que casi siempre pasó es que el túnel se cayó:
 * el 19/9/2026 el cliente de frp del lado de Tango se desconectó, el puerto quedó sin nadie atrás y
 * cada consulta esperaba los 30 s enteros. Así se dice, con la dirección que hay que revisar.
 */
function explicarFallaTango(e: any, empresa: { tangoApiUrl?: string }): string {
  const donde = TangoApi.baseDe(empresa);
  if (e?.response?.status) return `Tango contestó HTTP ${e.response.status} (${donde}).`;
  if (e?.code === "ECONNABORTED" || e?.code === "ETIMEDOUT" || /timeout/i.test(String(e?.message || ""))) {
    return `Tango no respondió a tiempo (${donde}): el túnel a Tango puede estar caído. Hay que revisar el cliente de frp en el servidor de Tango.`;
  }
  if (e?.code === "ECONNREFUSED") return `Nadie atiende en ${donde}: el túnel a Tango no está levantado.`;
  return `No se pudo consultar Tango (${donde}): ${String(e?.message || "error de red").replace(/\.+$/, "")}.`;
}

/**
 * Sincroniza una empresa.
 *
 * Exportada aparte para poder correr una sola —cuando una falló y las demás ya están— sin repetir
 * las tres consultas.
 */
export async function sincronizarEmpresa(empresa: { _id?: Types.ObjectId | string | null; razonSocial?: string; tangoId?: string; tangoToken?: string; tangoApiUrl?: string }): Promise<ResultadoEmpresa> {
  const base: ResultadoEmpresa = { empresaId: empresa._id ? String(empresa._id) : "", empresa: empresa.razonSocial || "(sin nombre)", tangoId: empresa.tangoId, ok: false, creados: 0, actualizados: 0, inhabilitados: 0, total: 0, errores: [] };
  if (!empresa.tangoId) {
    return { ...base, errores: ["No tiene cargado el ID de Tango: no se le puede pedir el catálogo."] };
  }

  let sobre;
  try {
    sobre = await tangoApi.getRegistro(PROCESO_CENTROS_COSTO, REGISTRO_CENTROS_COSTO, empresa.tangoId, empresa.tangoToken, empresa.tangoApiUrl);
  } catch (e: any) {
    return { ...base, errores: [explicarFallaTango(e, empresa)] };
  }

  const leido = leerRegistroAuxiliares(sobre);
  const tipo = leido.tipo.codigo || leido.tipo.descripcion ? `${leido.tipo.codigo}${leido.tipo.descripcion ? ` — ${leido.tipo.descripcion}` : ""}` : undefined;
  if (!leido.ok) return { ...base, tipo, errores: leido.errores };

  /*
    `empresaId` es opcional: las empresas de Tango que no son empleadoras de la plataforma no tienen
    ficha acá (ver `empresaTangoId` en el modelo). La identidad del catálogo es el id de TANGO.
  */
  const empresaId = empresa._id ? new Types.ObjectId(String(empresa._id)) : undefined;
  const empresaTangoId = Number(empresa.tangoId);
  const ahora = new Date();

  /*
    Upsert por (empresa, idAuxiliar). Los derivados se calculan acá porque `bulkWrite` no pasa por los
    hooks del documento, y sin ellos el catálogo quedaría sin `name`/`data.id`, que es lo que leen la
    resolución del proyecto y el código anterior al cambio.
  */
  const ops = leido.items.map((i) => {
    const doc = sincronizarCamposDerivados({ ...i }) as any;
    return {
      updateOne: {
        filter: { empresaTangoId, idAuxiliar: i.idAuxiliar },
        update: {
          $set: {
            ...(empresaId ? { empresaId } : {}),
            empresaTangoId,
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

  const r: any = await CentroCosto.bulkWrite(ops as any, { ordered: false });

  /*
    LOS QUE YA NO ESTÁN EN TANGO se marcan inhabilitados, no se borran: puede haber proyectos
    apuntándoles, y borrarlos dejaría esos proyectos mostrando «ID: 863» sin forma de saber qué era.
    Inhabilitado ya significa exactamente eso: existe, no se ofrece más para elegir.
  */
  const idsQueVinieron = leido.items.map((i) => i.idAuxiliar);
  const bajas = await CentroCosto.updateMany({ empresaTangoId, idAuxiliar: { $nin: idsQueVinieron }, habilitado: { $ne: "N" } }, { $set: { habilitado: "N", sincronizadoEl: ahora } });

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
export async function sincronizarCentrosCostoDesdeTango(): Promise<ResultadoSync> {
  if (!TangoApi.configurada()) throw new Error("Falta configurar TANGO_API_URL: sin eso no se puede consultar Tango.");

  try {
    await CentroCosto.syncIndexes();
  } catch (e: any) {
    console.warn("[CENTROS-COSTO-SYNC] No se pudieron actualizar los índices:", e?.message || e);
  }

  const empleadoras: any[] = await Company.find({ tangoId: { $exists: true, $nin: [null, ""] } })
    .select("razonSocial tangoId tangoToken tangoApiUrl")
    .lean();

  /*
    EMPRESAS DE TANGO QUE NO SON EMPLEADORAS DE LA PLATAFORMA (`TANGO_EMPRESAS_EXTRA`).

    FZERO CORP —la entidad de Estados Unidos— es el caso: su catálogo se usa, pero darla de alta como
    empresa acá la pondría a elegir como empleadora en cada contrato, y sin CUIT. Se listan sus ids de
    Tango, separados por coma, y el NOMBRE se le pregunta a Tango (proceso 1050): copiarlo a mano
    garantiza que algún día digan cosas distintas.
  */
  const idsExtra = String(process.env.TANGO_EMPRESAS_EXTRA || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .filter((id) => !empleadoras.some((e) => String(e.tangoId) === id)); // ya entra como empleadora

  /*
    EN PARALELO, NO UNA DETRÁS DE OTRA.

    Iban en fila, y con Tango caído cada consulta esperaba su timeout (30 s): tres empleadoras, el
    nombre de la extra y la extra sumaban dos minutos y medio. El navegador corta a los 60 s, así que
    la pantalla decía «probá de nuevo» sin llegar nunca a mostrar QUÉ empresa falló ni por qué.

    Cada empresa escribe sólo lo suyo (su `empresaTangoId`), así que no se pisan. La extra necesita el
    nombre ANTES de sincronizar —se guarda en cada centro—: se averigua mientras corren las empleadoras.
  */
  const [deEmpleadoras, extras] = await Promise.all([
    Promise.all(empleadoras.map((e) => sincronizarEmpresa(e))),
    Promise.all(idsExtra.map(async (id) => ({ _id: null, razonSocial: (await tangoApi.getNombreEmpresa(id)) || `Empresa de Tango ${id}`, tangoId: id }))),
  ]);
  const deExtras = await Promise.all(extras.map((e) => sincronizarEmpresa(e)));

  const resultados: ResultadoEmpresa[] = [...deEmpleadoras, ...deExtras];
  for (const r of resultados) {
    console.log(`[CENTROS-COSTO-SYNC] ${r.empresa}: ${r.ok ? `${r.total} centros (${r.creados} nuevos, ${r.actualizados} actualizados, ${r.inhabilitados} dados de baja)` : `FALLÓ · ${r.errores[0] || "sin detalle"}`}`);
  }

  const totalCatalogo = await CentroCosto.countDocuments({});
  return { ok: resultados.some((r) => r.ok), empresas: resultados, totalCatalogo, sincronizadoEl: new Date() };
}

/**
 * PROBAR LA CONEXIÓN, SIN TOCAR EL CATÁLOGO.
 *
 * Existe porque el Tango de cada empresa se alcanza por un túnel que termina en el VPS: desde una
 * máquina de desarrollo no se llega, así que la única forma de saber si la URL y el token están bien
 * es preguntárselo AL SERVER. Devuelve, por empresa, qué contestó Tango —el estado HTTP, o el tipo de
 * auxiliar que trajo— y cuántos centros vendrían, sin escribir una sola fila.
 */
export async function probarTango(): Promise<Array<{ empresa: string; tangoId?: string; base: string; ok: boolean; tipo?: string; centros?: number; detalle: string }>> {
  const empleadoras: any[] = await Company.find({}).select("razonSocial tangoId tangoToken tangoApiUrl").lean();
  const idsExtra = String(process.env.TANGO_EMPRESAS_EXTRA || "").split(",").map((x) => x.trim()).filter(Boolean);
  const empresas: any[] = [
    ...empleadoras,
    // Las que no son empleadoras (ver `sincronizarCentrosCostoDesdeTango`): también hay que poder probarlas.
    ...idsExtra.filter((id) => !empleadoras.some((e) => String(e.tangoId) === id)).map((id) => ({ razonSocial: `Empresa de Tango ${id}`, tangoId: id })),
  ];
  const salida = [];
  for (const e of empresas) {
    const base = TangoApi.baseDe(e);
    if (!e.tangoId) {
      salida.push({ empresa: e.razonSocial, tangoId: undefined, base, ok: false, detalle: "No tiene cargado el ID de Tango." });
      continue;
    }
    if (!base) {
      salida.push({ empresa: e.razonSocial, tangoId: e.tangoId, base, ok: false, detalle: "Falta TANGO_API_URL (y la empresa no tiene una propia)." });
      continue;
    }
    try {
      const sobre = await tangoApi.getRegistro(PROCESO_CENTROS_COSTO, REGISTRO_CENTROS_COSTO, e.tangoId, e.tangoToken, e.tangoApiUrl);
      const leido = leerRegistroAuxiliares(sobre);
      salida.push({
        empresa: e.razonSocial,
        tangoId: e.tangoId,
        base,
        ok: leido.ok,
        tipo: leido.tipo.codigo || leido.tipo.descripcion ? `${leido.tipo.codigo} — ${leido.tipo.descripcion}` : undefined,
        centros: leido.items.length,
        detalle: leido.ok ? `Respondió con ${leido.items.length} centros de costo.` : leido.errores[0] || "No se pudo leer la respuesta.",
      });
    } catch (err: any) {
      salida.push({
        empresa: e.razonSocial,
        tangoId: e.tangoId,
        base,
        ok: false,
        detalle: err?.response?.status ? `HTTP ${err.response.status} de Tango.` : `No se pudo conectar: ${err?.code || err?.message || "error de red"}.`,
      });
    }
  }
  return salida;
}

/** Cuándo se sincronizó por última vez y cuántos centros tiene cada empresa. Para mostrarlo. */
export async function estadoSincronizacion(): Promise<{ sincronizadoEl: Date | null; total: number; porEmpresa: Array<{ empresa: string; total: number }> }> {
  const [ultimo, total, porEmpresa] = await Promise.all([
    CentroCosto.findOne({ sincronizadoEl: { $ne: null } }).sort({ sincronizadoEl: -1 }).select("sincronizadoEl").lean(),
    CentroCosto.countDocuments({}),
    CentroCosto.aggregate([{ $group: { _id: "$empresaNombre", total: { $sum: 1 } } }, { $sort: { total: -1 } }]),
  ]);
  return {
    sincronizadoEl: (ultimo as any)?.sincronizadoEl || null,
    total,
    porEmpresa: (porEmpresa as any[]).map((g) => ({ empresa: g._id || "Sin empresa", total: g.total })),
  };
}
