import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { ConstanciaArca, IConstanciaArca } from "../../models/ConstanciaArca.js";
import {
  carpetaMasAvanzada,
  categoriaDe,
  claveConstancia,
  elegirParaCorrida,
  estadoPorCarpeta,
  siguienteEstado,
  trasUnFallo,
  yaTieneConstancia,
  type CarpetaDelDocumento,
  type CategoriaConstancia,
  type EstadoConstancia,
  type Fallo,
  type FueraDeLaCorrida,
  type Intento,
} from "./cicloConstancia.js";
import { borradoEl, copyEntry, getTenantDropboxConfig, listFolder, ubicarArchivo } from "../dropboxService.js";
import { resolverCarpetaPorProposito } from "../../utils/estadoCarpetas.js";

/**
 * LAS CONSTANCIAS DE ARCA EN LA BASE (`constancias_arca`): de dónde salen, quién las pide, qué pasó en
 * cada intento y dónde está hoy cada documento. Las reglas son de `cicloConstancia.ts` (puro); esto
 * es lo que lee y escribe.
 *
 *   · `sincronizarConstancias`: una fila por cada alta presentada (idempotente: la clave es persona +
 *     empleadora + fecha de alta). La llaman la descarga antes de elegir y el script de migración.
 *   · `colaDeDescarga`: qué se pide en esta corrida y qué queda afuera (y por qué).
 *   · `anotarDescarga` / `anotarFallo`: el resultado de cada persona.
 *   · `actualizarUbicaciones`: dónde está hoy cada documento (Outbox, Pendbox, firmados…) y el estado
 *     que eso significa; archiva el firmado en «Alta temprana de Arca/Firmadas». Corre con el escaneo
 *     de carpetas (polling y webhook de Dropbox) y después de cada descarga.
 *   · `constanciasDeLaPantalla`: lo que leen las pantallas. SOLO LEE: si una presentada todavía no
 *     tiene fila (antes de la migración), se deduce del contrato sin escribir nada.
 */

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const fechaIso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? "")) ? String(v).slice(0, 10) : "");
const codigoDe = (nombre: unknown) => /ID-\d{6,}/.exec(String(nombre ?? ""))?.[0] || "";

/** La subcarpeta de «Alta temprana de Arca» donde se archiva la constancia firmada (la raíz la lee el escaneo de estados). */
export const SUBCARPETA_FIRMADAS = "Firmadas";

/** Lo que una presentación ya tiene dicho en el contrato, como fila de `constancias_arca` (sin `_id`). */
export interface FilaConstancia {
  clave: string;
  cuil: string;
  nombre: string;
  userId: string;
  userProjectId: string;
  contractIndex: number;
  empresaId: string;
  empresaCuit: string;
  empresaRazonSocial: string;
  fechaAlta: string;
  fechaBaja: string;
  presentadaEl: Date | null;
  logId: string | null;
  estado: EstadoConstancia;
  tipoConstancia: "alta" | "baja" | null;
  mismoDia: boolean;
  documento: IConstanciaArca["documento"];
}

/**
 * El estado que dice el contrato, para una presentación que todavía no tiene fila. Puro.
 *
 * Con la constancia validada: descargada si fue al Outbox; archivada si fue a «No firmar». Dónde está
 * HOY lo dice después `actualizarUbicaciones`; esto es sólo el punto de partida.
 */
export function filaDesdeContrato(o: { up: any; idx: number; c: any; user: any; empresa: { _id: unknown; cuit: string; razonSocial: string } }): FilaConstancia | null {
  const cuil = digitos(o.user?.metadata?.cuit);
  const fechaAlta = fechaIso(o.c.fecha_alta_contrato);
  if (cuil.length !== 11 || !fechaAlta) return null;
  const fechaBaja = fechaIso(o.c.fecha_baja_contrato);
  const k = o.c.altaConstancia;
  const archivadaEn = String(k?.archivadaEn || "");
  const noFirmar = /\/No firmar\//i.test(archivadaEn);
  const tipo: "alta" | "baja" | null = k?.validadaEl ? (k.tipo === "baja" ? "baja" : "alta") : null;
  return {
    clave: claveConstancia({ cuil, empresaCuit: o.empresa.cuit, fechaAlta }),
    cuil,
    nombre: `${o.user?.firstName || ""} ${o.user?.lastName || ""}`.trim(),
    userId: String(o.up.userId),
    userProjectId: String(o.up._id),
    contractIndex: o.idx,
    empresaId: String(o.empresa._id),
    empresaCuit: digitos(o.empresa.cuit),
    empresaRazonSocial: o.empresa.razonSocial,
    fechaAlta,
    fechaBaja,
    presentadaEl: o.c.altaArcaPresentada?.fecha ? new Date(o.c.altaArcaPresentada.fecha) : null,
    logId: o.c.altaArcaPresentada?.logId ? String(o.c.altaArcaPresentada.logId) : null,
    estado: !k?.validadaEl ? "presentada" : noFirmar ? (tipo === "baja" ? "baja_mismo_dia_ok" : "archivada") : "constancia_descargada",
    tipoConstancia: tipo,
    mismoDia: tipo === "baja" && !!fechaBaja && fechaBaja === fechaAlta,
    documento: k?.validadaEl
      ? { codigo: codigoDe(k.enviadaComo || archivadaEn), nombre: String(k.enviadaComo || ""), path: archivadaEn || undefined, dropboxId: k.dropboxId || undefined, carpeta: !archivadaEn ? null : noFirmar ? "no_firmar" : "outbox", vaAFirma: k.vaAFirma !== false, firmadaEl: null, archivadaEn: null, ubicadoEl: null, noUbicadoDesde: null }
      : null,
  };
}

/** Las altas presentadas del tenant (o de una empleadora), como filas. SOLO LEE. */
export async function filasPresentadas(tenantObjectId: any, o: { empresaId?: string } = {}): Promise<FilaConstancia[]> {
  const [empresas, proyectos] = await Promise.all([Company.find({}).select("razonSocial cuit").lean(), Project.find({ tenantId: tenantObjectId }).select("_id").lean()]);
  const empresaPorId = new Map((empresas as any[]).filter((e) => digitos(e.cuit).length === 11).map((e) => [String(e._id), { _id: e._id, cuit: digitos(e.cuit), razonSocial: String(e.razonSocial || "") }]));
  const match: Record<string, unknown> = { "altaArcaPresentada.resultado": "presentada" };
  if (o.empresaId && Types.ObjectId.isValid(o.empresaId)) match.empresaContratoId = { $in: [new Types.ObjectId(o.empresaId), o.empresaId] };
  const ups: any[] = await UserProject.find({ projectId: { $in: proyectos.map((p: any) => p._id) }, contracts: { $elemMatch: match } })
    .select("userId contracts.empresaContratoId contracts.altaArcaPresentada contracts.altaConstancia contracts.fecha_alta_contrato contracts.fecha_baja_contrato")
    .lean();
  const usuarios: any[] = await User.find({ _id: { $in: ups.map((u) => u.userId) }, tenantId: tenantObjectId }).select("firstName lastName metadata.cuit").lean();
  const porId = new Map(usuarios.map((u) => [String(u._id), u]));
  const out: FilaConstancia[] = [];
  for (const up of ups) {
    (up.contracts || []).forEach((c: any, idx: number) => {
      const empresa = empresaPorId.get(String(c.empresaContratoId || ""));
      if (!empresa || c.altaArcaPresentada?.resultado !== "presentada") return;
      if (o.empresaId && String(empresa._id) !== o.empresaId) return;
      const f = filaDesdeContrato({ up, idx, c, user: porId.get(String(up.userId)), empresa });
      if (f) out.push(f);
    });
  }
  return out;
}

/**
 * UNA FILA POR CADA ALTA PRESENTADA, sin duplicar nunca (upsert por clave). Lo que ya existe no se pisa
 * —sus intentos y su estado son la historia—, salvo para reconocer una constancia que entró por otro
 * lado (subida a mano en Contratos): eso la saca de pendiente o de revisión.
 */
export async function sincronizarConstancias(tenantObjectId: any, o: { empresaId?: string } = {}): Promise<{ filas: number; nuevas: number; actualizadas: number }> {
  const filas = await filasPresentadas(tenantObjectId, o);
  if (filas.length === 0) return { filas: 0, nuevas: 0, actualizadas: 0 };
  const ahora = new Date();
  const tenantId = new Types.ObjectId(String(tenantObjectId));
  const ops: any[] = [];
  for (const f of filas) {
    const base = { ...f, userId: new Types.ObjectId(f.userId), userProjectId: new Types.ObjectId(f.userProjectId), empresaId: new Types.ObjectId(f.empresaId), logId: f.logId && Types.ObjectId.isValid(f.logId) ? new Types.ObjectId(f.logId) : null };
    const { nombre, fechaBaja, empresaRazonSocial, ...soloAlCrear } = base;
    ops.push({
      updateOne: {
        filter: { tenantId, clave: f.clave },
        update: { $setOnInsert: { ...soloAlCrear, tenantId, intentos: [], historial: [{ estado: f.estado, fecha: ahora, motivo: "Alta presentada" }] }, $set: { nombre, fechaBaja, empresaRazonSocial } },
        upsert: true,
      },
    });
    if (yaTieneConstancia(f.estado)) {
      ops.push({
        updateOne: {
          filter: { tenantId, clave: f.clave, estado: { $in: ["presentada", "constancia_pendiente", "requiere_revision"] } },
          update: { $set: { estado: f.estado, documento: f.documento, tipoConstancia: f.tipoConstancia, mismoDia: f.mismoDia, proximoIntentoEl: null, motivoRevision: null }, $push: { historial: { estado: f.estado, fecha: ahora, motivo: "La constancia ya estaba en el contrato" } } },
        },
      });
    }
  }
  const r = await ConstanciaArca.bulkWrite(ops, { ordered: false });
  return { filas: filas.length, nuevas: r.upsertedCount || 0, actualizadas: r.modifiedCount || 0 };
}

export interface ElegidaParaDescargar {
  userProjectId: string;
  contractIndex: number;
  clave: string;
  /** El reintento a mano de una que estaba en revisión o esperando: no gasta intentos automáticos. */
  manual: boolean;
}

/**
 * QUÉ SE PIDE EN ESTA CORRIDA DE UNA EMPLEADORA. La automática respeta el cupo (nuevas primero), las
 * esperas y la revisión; la forzada (`soloItems`) pide lo que se eligió aunque esté esperando o en
 * revisión. En las dos, lo que ya tiene su constancia no se pide nunca.
 */
export async function colaDeDescarga(tenantObjectId: any, empresaId: string, o: { ahora: Date; tope?: number; soloItems?: Array<{ userProjectId: string; contractIndex: number }> }): Promise<{ elegidas: ElegidaParaDescargar[]; fuera: FueraDeLaCorrida; total: number }> {
  await sincronizarConstancias(tenantObjectId, { empresaId });
  const docs: any[] = await ConstanciaArca.find({ tenantId: tenantObjectId, empresaId: new Types.ObjectId(empresaId) }).select("clave estado proximoIntentoEl fechaAlta userProjectId contractIndex").lean();
  const sinConstancia = docs.filter((d) => !yaTieneConstancia(d.estado));
  if (o.soloItems) {
    const pedidas = sinConstancia.filter((d) => o.soloItems!.some((i) => i.userProjectId === String(d.userProjectId) && Number(i.contractIndex) === d.contractIndex));
    return { elegidas: pedidas.map((d) => ({ userProjectId: String(d.userProjectId), contractIndex: d.contractIndex, clave: d.clave, manual: true })), fuera: { nuevasPorTope: 0, reintentosPorTope: 0, esperandoReintento: 0, enRevision: 0 }, total: sinConstancia.length };
  }
  const { elegidas, fuera } = elegirParaCorrida(sinConstancia, { ahora: o.ahora, tope: o.tope ?? 0 });
  return { elegidas: elegidas.map((d) => ({ userProjectId: String(d.userProjectId), contractIndex: d.contractIndex, clave: d.clave, manual: false })), fuera, total: sinConstancia.length };
}

/** La constancia se bajó y quedó subida (o cargada en el contrato). */
export async function anotarDescarga(tenantObjectId: any, clave: string, r: { tipo: "alta" | "baja"; mismoDia: boolean; vaAFirma: boolean; archivadaEn?: string; nombre?: string; dropboxId?: string; manual?: boolean }): Promise<void> {
  const noFirmar = !!r.archivadaEn && /\/No firmar\//i.test(r.archivadaEn);
  const estado: EstadoConstancia = !noFirmar ? "constancia_descargada" : r.tipo === "baja" ? "baja_mismo_dia_ok" : "archivada";
  const ahora = new Date();
  await ConstanciaArca.updateOne(
    { tenantId: tenantObjectId, clave },
    {
      $set: {
        estado,
        tipoConstancia: r.tipo,
        mismoDia: r.mismoDia,
        proximoIntentoEl: null,
        motivoRevision: null,
        documento: { codigo: codigoDe(r.nombre || r.archivadaEn), nombre: r.nombre || "", path: r.archivadaEn || undefined, dropboxId: r.dropboxId, carpeta: r.archivadaEn ? (noFirmar ? "no_firmar" : "outbox") : null, vaAFirma: r.vaAFirma, firmadaEl: null, archivadaEn: null, ubicadoEl: r.archivadaEn ? ahora : null, noUbicadoDesde: null },
      },
      $push: {
        intentos: { fecha: ahora, resultado: "descargada", detalle: r.tipo === "baja" ? (r.mismoDia ? "Constancia de la relación (alta y baja el mismo día)." : "Constancia de la relación ya terminada (de baja).") : undefined, manual: !!r.manual },
        historial: { estado, fecha: ahora, motivo: r.tipo === "baja" ? "Constancia de baja aceptada: la relación ya terminó" : "Constancia bajada de ARCA" },
      },
    },
  );
}

/** Un intento que no trajo la constancia: cuenta, espera o pasa a revisión (ver `trasUnFallo`). */
export async function anotarFallo(tenantObjectId: any, clave: string, fallo: Fallo, o: { manual?: boolean } = {}): Promise<{ estado: EstadoConstancia; motivoRevision?: string }> {
  const doc: any = await ConstanciaArca.findOne({ tenantId: tenantObjectId, clave }).select("intentos estado").lean();
  if (!doc || yaTieneConstancia(doc.estado)) return { estado: doc?.estado || "presentada" };
  const ahora = new Date();
  const r = trasUnFallo((doc.intentos || []) as Intento[], fallo, ahora, o);
  await ConstanciaArca.updateOne(
    { tenantId: tenantObjectId, clave },
    {
      $set: { estado: r.estado, proximoIntentoEl: r.proximoIntentoEl, motivoRevision: r.motivoRevision ?? null },
      $push: {
        intentos: { fecha: ahora, resultado: fallo.resultado, detalle: fallo.detalle, manual: !!o.manual },
        ...(r.estado !== doc.estado ? { historial: { estado: r.estado, fecha: ahora, motivo: r.motivoRevision } } : {}),
      },
    },
  );
  return r;
}

type TenantDropboxConfig = NonNullable<ReturnType<typeof getTenantDropboxConfig>>;

/**
 * DÓNDE ESTÁ HOY CADA CONSTANCIA, y el estado que eso dice. Lista una vez cada carpeta del circuito y
 * busca el código de cada documento; la carpeta más avanzada donde aparece manda. La firmada se
 * archiva (copia) en «Alta temprana de Arca/Firmadas». Lo que no aparece en ninguna se sigue por su
 * path o su id de Dropbox: si se movió a otra carpeta, se anota; si se borró, pasa a revisión
 * («documento no ubicado») con la fecha en que se borró.
 */
export async function actualizarUbicaciones(tenantId: string, cfg: TenantDropboxConfig, o: { log?: (l: string) => void } = {}): Promise<{ revisadas: number; cambiadas: number; archivadas: number; noUbicadas: number }> {
  const log = o.log || (() => {});
  const docs: any[] = await ConstanciaArca.find({ tenantId: new Types.ObjectId(tenantId), "documento.codigo": { $nin: [null, ""] }, estado: { $in: ["constancia_descargada", "enviada_a_firmar", "firmada", "requiere_revision", "archivada"] } })
    .select("clave estado documento tipoConstancia")
    .lean();
  const r = { revisadas: docs.length, cambiadas: 0, archivadas: 0, noUbicadas: 0 };
  if (docs.length === 0) return r;
  const [outbox, pendbox, firmados, altaTemprana] = await Promise.all(["outbox", "pendbox", "firmados", "alta_temprana"].map((p) => resolverCarpetaPorProposito(p as any)));
  const carpetas: Array<{ carpeta: CarpetaDelDocumento; path: string }> = [];
  if (outbox) carpetas.push({ carpeta: "outbox", path: outbox });
  if (pendbox) carpetas.push({ carpeta: "pendbox", path: pendbox });
  if (firmados) carpetas.push({ carpeta: "firmados", path: firmados });
  if (altaTemprana) {
    carpetas.push({ carpeta: "alta_firmadas", path: `${altaTemprana.replace(/\/$/, "")}/${SUBCARPETA_FIRMADAS}` });
    carpetas.push({ carpeta: "no_firmar", path: `${altaTemprana.replace(/\/$/, "")}/No firmar` });
  }
  // Código → dónde aparece. Una carpeta que no existe todavía («Firmadas» antes del primer archivo) es una carpeta vacía.
  const porCodigo = new Map<string, Array<{ carpeta: CarpetaDelDocumento; name: string; path: string; id?: string }>>();
  for (const c of carpetas) {
    let entradas: any[] = [];
    try {
      entradas = (await listFolder(tenantId, cfg, c.path, true)).entries || [];
    } catch (e: any) {
      if (!/not_found/.test(String(e?.response?.data?.error_summary || e?.message || ""))) throw e;
    }
    for (const e of entradas) {
      if (e.tag !== "file") continue;
      const cod = codigoDe(e.name);
      if (!cod) continue;
      const lista = porCodigo.get(cod) || [];
      lista.push({ carpeta: c.carpeta, name: e.name, path: e.path, id: e.id });
      porCodigo.set(cod, lista);
    }
  }
  const ahora = new Date();
  for (const d of docs) {
    const doc = d.documento || {};
    const donde = porCodigo.get(doc.codigo) || [];
    let carpeta = carpetaMasAvanzada(donde.map((x) => x.carpeta));
    let archivo = donde.find((x) => x.carpeta === carpeta);
    const set: Record<string, unknown> = {};
    let motivo = "";
    // Firmada y todavía sin archivar: copia en «Alta temprana de Arca/Firmadas» con el mismo nombre (el patrón de siempre).
    if (carpeta === "firmados" && archivo && altaTemprana) {
      const destino = `${altaTemprana.replace(/\/$/, "")}/${SUBCARPETA_FIRMADAS}/${archivo.name}`;
      try {
        const copia = await copyEntry(tenantId, cfg, archivo.path, destino);
        set["documento.firmadaEl"] = doc.firmadaEl || ahora;
        set["documento.archivadaEn"] = copia.path;
        r.archivadas++;
        log(`[constancias] ${doc.codigo}: firmada, archivada en ${copia.path}`);
        carpeta = "alta_firmadas";
        archivo = { carpeta, name: copia.name, path: copia.path, id: copia.id };
      } catch (e: any) {
        log(`[constancias] ${doc.codigo}: firmada, pero no se pudo archivar (${e?.message || e}); se reintenta en la próxima pasada`);
      }
    }
    if (carpeta && archivo) {
      if (carpeta === "firmados" || carpeta === "alta_firmadas") set["documento.firmadaEl"] = set["documento.firmadaEl"] || doc.firmadaEl || ahora;
      set["documento.carpeta"] = carpeta;
      set["documento.path"] = archivo.path;
      set["documento.nombre"] = archivo.name;
      if (archivo.id && carpeta === "outbox") set["documento.dropboxId"] = archivo.id;
      set["documento.ubicadoEl"] = ahora;
      set["documento.noUbicadoDesde"] = null;
      const nuevo = siguienteEstado(d.estado, estadoPorCarpeta(carpeta, { esDeBaja: d.tipoConstancia === "baja" }));
      if (nuevo !== d.estado) {
        set.estado = nuevo;
        set.motivoRevision = null;
        motivo = `El documento está en ${ETIQUETA_CARPETA[carpeta]}`;
      }
    } else if (d.estado !== "archivada") {
      // No está en ninguna carpeta del circuito: se lo sigue por su id o su path.
      const ref = doc.dropboxId || doc.path;
      const aca = ref ? await ubicarArchivo(tenantId, cfg, ref, { borrados: true }).catch(() => null) : null;
      if (aca && !aca.borrado) {
        set["documento.path"] = aca.path;
        set["documento.ubicadoEl"] = ahora;
        set["documento.noUbicadoDesde"] = null;
      } else if (!doc.noUbicadoDesde || d.estado !== "requiere_revision") {
        const cuando = doc.path ? await borradoEl(tenantId, cfg, doc.path) : null;
        const lugar = doc.path ? doc.path.replace(/\/[^/]+$/, "") : "su carpeta";
        motivo = `Documento no ubicado: ${cuando ? `se borró de ${lugar} el ${new Date(cuando).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })} y` : ""} no está en Outbox, Pendbox, Requested signatures ni «Alta temprana de Arca». No se envió a firmar.`;
        set.estado = siguienteEstado(d.estado, "requiere_revision");
        set.motivoRevision = motivo;
        set["documento.noUbicadoDesde"] = ahora;
        r.noUbicadas++;
      }
    }
    if (Object.keys(set).length === 0) continue;
    if (set.estado && set.estado !== d.estado) r.cambiadas++;
    await ConstanciaArca.updateOne({ _id: d._id }, { $set: set, ...(set.estado && set.estado !== d.estado ? { $push: { historial: { estado: set.estado, fecha: ahora, motivo } } } : {}) });
  }
  return r;
}

export const ETIQUETA_CARPETA: Record<CarpetaDelDocumento, string> = {
  outbox: "Outbox",
  pendbox: "Pendbox",
  firmados: "Requested signatures",
  alta_firmadas: "Alta temprana de Arca / Firmadas",
  no_firmar: "Alta temprana de Arca / No firmar",
};

/** Lo que ven las pantallas de cada constancia. */
export interface ConstanciaEnPantalla {
  clave: string;
  cuil: string;
  nombre: string;
  userProjectId: string;
  contractIndex: number;
  empresaId: string;
  empresaRazonSocial: string;
  fechaAlta: string;
  fechaBaja: string;
  presentadaEl: string | null;
  estado: EstadoConstancia;
  categoria: CategoriaConstancia;
  mismoDia: boolean;
  tipoConstancia: "alta" | "baja" | null;
  intentos: Array<{ fecha: string; resultado: string; detalle?: string; manual?: boolean }>;
  proximoIntentoEl: string | null;
  motivoRevision: string | null;
  documento: { codigo: string; nombre: string; path: string; carpeta: string | null; etiquetaCarpeta: string; firmada: boolean } | null;
  /** Sin fila en `constancias_arca` todavía: deducida del contrato (antes de la migración). */
  deducida?: boolean;
}

const aPantalla = (d: any, deducida = false): ConstanciaEnPantalla => ({
  clave: d.clave,
  cuil: d.cuil,
  nombre: d.nombre,
  userProjectId: String(d.userProjectId),
  contractIndex: d.contractIndex,
  empresaId: String(d.empresaId || ""),
  empresaRazonSocial: d.empresaRazonSocial || "",
  fechaAlta: d.fechaAlta,
  fechaBaja: d.fechaBaja || "",
  presentadaEl: d.presentadaEl ? new Date(d.presentadaEl).toISOString() : null,
  estado: d.estado,
  categoria: categoriaDe(d.estado, { firmada: !!d.documento?.firmadaEl }),
  mismoDia: !!d.mismoDia,
  tipoConstancia: d.tipoConstancia || null,
  intentos: (d.intentos || []).map((i: any) => ({ fecha: new Date(i.fecha).toISOString(), resultado: i.resultado, detalle: i.detalle, manual: !!i.manual })),
  proximoIntentoEl: d.proximoIntentoEl ? new Date(d.proximoIntentoEl).toISOString() : null,
  motivoRevision: d.motivoRevision || null,
  documento: d.documento?.codigo || d.documento?.path
    ? { codigo: d.documento.codigo || "", nombre: d.documento.nombre || "", path: d.documento.path || "", carpeta: d.documento.carpeta || null, etiquetaCarpeta: d.documento.carpeta ? ETIQUETA_CARPETA[d.documento.carpeta as CarpetaDelDocumento] || d.documento.carpeta : "", firmada: !!d.documento.firmadaEl }
    : null,
  ...(deducida ? { deducida: true } : {}),
});

/** Las constancias para las pantallas: las de la colección y, para las presentadas sin fila, lo que dice el contrato. SOLO LEE. */
export async function constanciasDeLaPantalla(tenantObjectId: any, o: { empresaId?: string } = {}): Promise<ConstanciaEnPantalla[]> {
  const filtro: Record<string, unknown> = { tenantId: tenantObjectId };
  if (o.empresaId && Types.ObjectId.isValid(o.empresaId)) filtro.empresaId = new Types.ObjectId(o.empresaId);
  const [docs, filas] = await Promise.all([ConstanciaArca.find(filtro).select("-historial").lean(), filasPresentadas(tenantObjectId, o)]);
  const conFila = new Set(docs.map((d: any) => d.clave));
  return [...docs.map((d) => aPantalla(d)), ...filas.filter((f) => !conFila.has(f.clave)).map((f) => aPantalla({ ...f, intentos: [], proximoIntentoEl: null, motivoRevision: null }, true))];
}
