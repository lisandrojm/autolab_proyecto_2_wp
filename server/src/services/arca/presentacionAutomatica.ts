import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Client } from "../../models/Client.js";
import { Company } from "../../models/Company.js";
import { Contrato } from "../../models/Contrato.js";
import { Convenio } from "../../models/Convenio.js";
import { ObraSocial } from "../../models/ObraSocial.js";
import { Info } from "../../models/Info.js";
import { RoleFrame } from "../../models/RoleFrame.js";
import { ArcaSucursal } from "../../models/ArcaSucursal.js";
import { getArcaDefaults } from "../../models/ArcaDefault.js";
import { listarCategoriasCompat } from "../../utils/categoriaCompat.js";
import { claveEstado } from "../../utils/estadoClave.js";
import { ESTADO_TYPE } from "../../utils/estadosImpositivosSistema.js";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { resolveAfip, resolveAfip85, problemasDeSucursalParaTxt, type AfipCatalogs } from "../../compartido/arca/afipCompleteness.js";
import { buildAltaRecord85 } from "../../compartido/arca/afipTxt85.js";
import { TEXTO_PROBLEMA_SUCURSAL } from "../../compartido/sucursalesDeEmpresa.js";
import { altaQueSePisa, altasPresentadasDe, textoAltaQueSePisa } from "./altasVigentes.js";
import { arrancarCorridaAltas, corridaAltasDe } from "./corridaAltas.js";
import { quienTiene } from "./candadoArca.js";
import { esRechazoDefinitivo } from "./rechazoDefinitivo.js";
import { ConfigAltasAutomaticas, CONFIG_POR_DEFECTO, entraEnLaCorrida, esDelDia, esperaAManana, hastaDeLaCorrida, motivoDeOmision, proximaCorridaPara, rechazadasAlFinal, yaTermino } from "./horarioAltasAutomaticas.js";

/**
 * PRESENTACIÓN AUTOMÁTICA DE LAS ALTAS EN ARCA: cada día, a la hora configurada (14:00 argentinas por
 * defecto), se presentan las altas tempranas que empiezan ese día —o en los próximos N días, si se
 * configuró anticipación— y después la cola de atrasadas; en modo frecuente, la cola corre además cada
 * N minutos. Ver `horarioAltasAutomaticas.ts`. Si nadie hace nada, cada alta sale sola.
 * Lo que no está completo no se presenta y queda con su motivo en «A.R.C.A Altas Automáticas».
 *
 * EL REGISTRO LO ARMA EL MISMO CÓDIGO QUE LA PANTALLA (`compartido/arca`), con los mismos catálogos que
 * carga Contratos (`useCatalogosArca`) y la misma fila que devuelve `contracts-overview`. Después pasa
 * por `arrancarCorridaAltas`, que lo vuelve a cotejar contra la base como a cualquier presentación manual.
 *
 * Sólo contratos creados en WeProdu (Solicitudes o «Agregar miembro»): los importados no se gestionan
 * desde Contratos y no se presentan solos.
 *
 * NADA QUEDA FUERA DE LA AUTOMÁTICA (pedido del 19/10/2026): terminados, atrasados de cualquier fecha y
 * rechazados (las veces que sea, o con un rechazo del padrón) siguen en la cola hasta que salgan. Un
 * contrato con `altaArcaPresentada.resultado === "fallida"` sigue siendo un pendiente y se retoma al final
 * de la próxima pasada; sólo el rechazo del padrón de hoy espera a mañana. `intentos` (rechazos en
 * automáticas) y `enviosArca` (todo envío a ARCA) se cuentan para mostrarlos.
 */


/**
 * Los catálogos de ARCA tal como los recibe la pantalla (pasados por JSON: ids como texto).
 * Cacheados un minuto: son diez consultas y los pide cada pantalla, cada corrida y cada «Forzar».
 */
let catalogosEnCache: { en: number; p: Promise<AfipCatalogs> } | null = null;
export async function catalogosArca(): Promise<AfipCatalogs> {
  if (catalogosEnCache && Date.now() - catalogosEnCache.en < 60_000) return catalogosEnCache.p;
  const p = leerCatalogosArca();
  catalogosEnCache = { en: Date.now(), p };
  p.catch(() => (catalogosEnCache = null));
  return p;
}
async function leerCatalogosArca(): Promise<AfipCatalogs> {
  const [defaults, categorias, tipos, obrasSociales, sedes, empresas, sucursales, convenios, roleFrames, estados] = await Promise.all([
    getArcaDefaults(),
    listarCategoriasCompat(),
    Contrato.find().sort({ orden: 1, name: 1 }).lean(),
    // Sólo lo que mira el generador: convenios enteros eran 841 KB y 8 s por pedido.
    ObraSocial.find().select("externalId name data.id").sort({ name: 1 }).lean(),
    Info.find({ type: "sede" }).lean(),
    Company.find().sort({ razonSocial: 1 }).lean(),
    ArcaSucursal.find().sort({ codigo: 1 }).lean(),
    Convenio.find().select("externalId name obraSocialDefaultId puestoDesempenadoDefault").sort({ name: 1 }).lean(),
    RoleFrame.find().select("name data.rol.id data.puestoDesempenado").sort({ name: 1 }).lean(),
    Info.find({ type: ESTADO_TYPE }).sort({ "data.orden": 1, name: 1 }).lean(),
  ]);
  const json = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));
  return {
    categorias: json(categorias),
    tipos: json(tipos),
    obrasSociales: json(obrasSociales),
    sedes: json(sedes),
    // Igual que GET /companies: los dos nombres de la obra social por defecto.
    empresas: json((empresas as any[]).map((c) => ({ ...c, obraSocialId: c.obraSocialDefaultId ?? c.obraSocialId ?? null, obraSocialDefaultId: c.obraSocialDefaultId ?? c.obraSocialId ?? null }))),
    sucursales: json(sucursales),
    convenios: json(convenios),
    estados: json(estados),
    defaultsArcaGlobales: json((defaults as any)?.toObject ? (defaults as any).toObject() : defaults),
    roleFrames: json(roleFrames),
  } as AfipCatalogs;
}

export interface CandidatoAlta {
  userProjectId: string;
  contractIndex: number;
  userId: string;
  nombre: string;
  cuil: string;
  proyecto: string;
  cliente: string;
  tipoContrato: string;
  fechaAlta: string;
  fechaBaja: string;
  empresa: { _id: string; razonSocial: string } | null;
  /** La próxima corrida automática que lo presenta, ISO. */
  momento: string;
  /** Se puede presentar tal como está. */
  presentable: boolean;
  /** La baja ya pasó. Informativo: igual entra en la automática. */
  terminado: boolean;
  /**
   * ARCA ya lo rechazó con un motivo del padrón («ya posee una relación laboral activa»): el texto de ese
   * rechazo, para que alguien lo revise. Informativo: sigue en la cola. Ver `rechazoDefinitivo.ts`.
   */
  rechazoDefinitivo: string;
  /** Cuántas veces la automática ya la presentó y ARCA la rechazó. */
  intentos: number;
  /** ISO del primero de esos rechazos; vacío si no hubo. */
  primerIntentoEl: string;
  /** ISO del último rechazo; vacío si no está rechazada. Va al final de la próxima pasada (la del padrón, mañana). */
  rechazadaEl: string;
  /** Cuántas veces se mandó a ARCA, automática o forzada, con cualquier resultado. */
  envios: number;
  /** Por qué no, si no se puede. */
  motivo: string;
  /** El registro de 85, si está completo. */
  registro: string | null;
}

/**
 * Las altas tempranas pendientes de presentar del tenant, con su registro armado o el motivo por el
 * que no se puede. `desde`/`hasta` acotan por fecha de alta; `soloContrato` busca uno puntual.
 */
export async function candidatosDeAlta(
  tenantObjectId: Types.ObjectId,
  opts: { desde?: string; hasta?: string; soloContrato?: { userProjectId: string; contractIndex: number }; cfg?: ConfigAltasAutomaticas; ultimaCola?: string } = {},
): Promise<CandidatoAlta[]> {
  const cfg = opts.cfg || CONFIG_POR_DEFECTO;
  const ahora = new Date();
  const hoy = hoyArgentina();
  const proyectos: any[] = await Project.find({ tenantId: tenantObjectId }).select("_id name clientId").lean();
  if (proyectos.length === 0) return [];
  const proyectoPorId = new Map(proyectos.map((p) => [String(p._id), p]));

  const estados: any[] = await Info.find({ type: ESTADO_TYPE }).select("name data").lean();
  const clavesAltaTemprana = new Set(
    estados.filter((e) => e?.data?.esImpositivo && e?.data?.tipoImpositivo === "alta_temprana_afip").map((e) => claveEstado(String(e.name || ""))),
  );

  const match: any = { projectId: { $in: proyectos.map((p) => p._id) } };
  if (opts.soloContrato) {
    if (!Types.ObjectId.isValid(opts.soloContrato.userProjectId)) return [];
    match._id = new Types.ObjectId(opts.soloContrato.userProjectId);
  } else {
    // Que tenga algún contrato del sistema; el filtro fino va abajo, contrato por contrato. Con
    // $elemMatch y no con «contracts.solicitudId: {$ne: null}»: sobre un array, $ne exige que NINGÚN
    // contrato sea nulo, y quien tiene uno importado sin solicitud quedaba afuera.
    match.$or = [{ contracts: { $elemMatch: { solicitudId: { $exists: true, $ne: null } } } }, { "contracts.origen": "agregar_miembro" }];
  }
  /*
    FILTRADO Y PROYECTADO EN MONGO. Traía todos los contratos ENTEROS de cada persona del tenant y
    filtraba acá: con cientos de personas y decenas de contratos cada una, eran megabytes por pedido y
    la pantalla cortaba a los 60 s (ver memoria «Latencia = bytes desde Atlas»). Ahora viajan sólo los
    contratos del sistema cuya alta cae en la ventana, con los campos que mira el generador.
  */
  const t0 = Date.now();
  const CAMPOS = [
    "fecha_alta_contrato", "fecha_baja_contrato", "nombre_contrato", "nombre_estado_empleado", "altaArcaPresentada", "empresaContratoId", "nombre_empresa_contrato",
    "puestoDesempenado", "categoria_sat_id", "rol_frame_id", "sede_id", "tipo_contrato_id", "sucursalArcaId", "actividadArca",
    "obraSocialId", "obraSocialOrigen", "obraSocialConstatadaEn", "obraSocialConstatadaEl", "obraSocialNoFigura", "solicitudId", "origen", "enviosArca",
  ];
  // La fecha de alta como "YYYY-MM-DD" aunque esté guardada ISO (los formatos viejos no son del sistema).
  const altaISO = { $cond: [{ $eq: [{ $type: "$$e.c.fecha_alta_contrato" }, "string"] }, { $substrCP: ["$$e.c.fecha_alta_contrato", 0, 10] }, ""] };
  const cond = opts.soloContrato
    ? { $eq: ["$$e.i", opts.soloContrato.contractIndex] }
    : {
        $and: [
          { $or: [{ $gt: ["$$e.c.solicitudId", null] }, { $eq: ["$$e.c.origen", "agregar_miembro"] }] },
          // Sin piso de fecha, lo ya presentado se descarta acá y no viaja: sólo sin presentar o rechazadas.
          { $or: [{ $eq: [{ $ifNull: ["$$e.c.altaArcaPresentada", null] }, null] }, { $eq: ["$$e.c.altaArcaPresentada.resultado", "fallida"] }] },
          ...(opts.desde ? [{ $gte: [altaISO, opts.desde] }] : []),
          ...(opts.hasta ? [{ $lte: [altaISO, opts.hasta] }] : []),
        ],
      };
  const filas: any[] = await UserProject.aggregate([
    { $match: match },
    {
      $project: {
        userId: 1,
        projectId: 1,
        c: {
          $filter: {
            input: {
              $map: {
                input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] },
                as: "i",
                in: { i: "$$i", c: { $let: { vars: { x: { $arrayElemAt: ["$contracts", "$$i"] } }, in: Object.fromEntries(CAMPOS.map((k) => [k, `$$x.${k}`])) } } },
              },
            },
            as: "e",
            cond,
          },
        },
      },
    },
    { $match: { "c.0": { $exists: true } } },
    { $unwind: "$c" },
  ]);
  const msFilas = Date.now() - t0;

  const elegidos: Array<{ up: any; i: number; c: any }> = [];
  for (const f of filas) {
    const c = f.c?.c;
    const i = Number(f.c?.i);
    if (!c) continue;
    if (opts.soloContrato) {
      if (i !== opts.soloContrato.contractIndex) continue;
    } else {
      if (!c.solicitudId && c.origen !== "agregar_miembro") continue;
      const alta = fechaISO(c.fecha_alta_contrato);
      if (!alta || (opts.desde && alta < opts.desde) || (opts.hasta && alta > opts.hasta)) continue;
      // Lo ya presentado (o que pudo haber entrado) no es un pendiente.
      if (c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida") continue;
    }
    if (!clavesAltaTemprana.has(claveEstado(String(c.nombre_estado_empleado || "")))) continue;
    elegidos.push({ up: f, i, c });
  }
  if (elegidos.length === 0) return [];

  const userIds = [...new Set(elegidos.map((e) => String(e.up.userId)))];
  const usuarios: any[] = await User.find({ _id: { $in: userIds }, tenantId: tenantObjectId }).select("firstName lastName email metadata.cuit metadata.sinCuit").lean();
  const userPorId = new Map(usuarios.map((u) => [String(u._id), u]));
  const idsClientes = [...new Set(proyectos.map((p) => String(p.clientId || "")).filter((id) => Types.ObjectId.isValid(id)))];
  const clientes: any[] = await Client.find({ _id: { $in: idsClientes } }).select("name").lean();
  const clientePorId = new Map(clientes.map((c) => [String(c._id), c.name || ""]));
  const presentadas = await altasPresentadasDe(
    proyectos.map((p) => p._id),
    userIds,
    tenantObjectId,
  );
  const cat = await catalogosArca();
  const empresaPorId = new Map(((cat.empresas || []) as any[]).map((e) => [String(e._id), e]));

  const out: CandidatoAlta[] = [];
  for (const { up, i, c } of elegidos) {
    const u = userPorId.get(String(up.userId));
    if (!u) continue; // de otro tenant o borrado
    const proyecto = proyectoPorId.get(String(up.projectId));
    const nombre = `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || "(sin nombre)";
    const fechaAlta = fechaISO(c.fecha_alta_contrato);
    const fechaBaja = fechaISO(c.fecha_baja_contrato);
    const empresaId = c.empresaContratoId ? String(c.empresaContratoId) : "";
    const empresa = empresaPorId.get(empresaId);
    // La misma fila que arma contracts-overview, con los campos que mira el generador.
    const row: any = {
      _id: String(up._id),
      userId: String(up.userId),
      userName: nombre,
      projectId: String(up.projectId),
      projectName: proyecto?.name || "",
      contractIndex: i,
      nombre_contrato: c.nombre_contrato || "",
      nombre_estado_empleado: c.nombre_estado_empleado || "",
      fecha_alta_contrato: c.fecha_alta_contrato || "",
      fecha_baja_contrato: c.fecha_baja_contrato || "",
      altaArcaPresentada: c.altaArcaPresentada || null,
      empresaContratoId: empresaId,
      nombre_empresa_contrato: c.nombre_empresa_contrato || "",
      puestoDesempenado: c.puestoDesempenado || "",
      categoria_sat_id: c.categoria_sat_id ?? null,
      rol_frame_id: c.rol_frame_id ?? null,
      sede_id: c.sede_id ?? null,
      tipo_contrato_id: c.tipo_contrato_id ?? null,
      sucursalArcaId: c.sucursalArcaId ? String(c.sucursalArcaId) : "",
      actividadArca: c.actividadArca || "",
      osId: c.obraSocialId ?? null,
      obraSocialOrigen: c.obraSocialOrigen || "",
      obraSocialConstatadaEn: c.obraSocialConstatadaEn || "",
      obraSocialConstatadaEl: c.obraSocialConstatadaEl || "",
      obraSocialNoFigura: !!c.obraSocialNoFigura,
      cuit: u.metadata?.cuit || "",
      sinCuit: u.metadata?.sinCuit === true,
    };

    let motivo = "";
    let registro: string | null = null;
    // Terminado, rechazado por el padrón o rechazado varias veces: todo informativo, todos siguen en la cola.
    const terminado = yaTermino(fechaBaja, hoy);
    const fallida = c.altaArcaPresentada?.resultado === "fallida";
    const rechazoDefinitivo = fallida && esRechazoDefinitivo(c.altaArcaPresentada?.motivo) ? String(c.altaArcaPresentada.motivo) : "";
    const intentos = fallida ? Number(c.altaArcaPresentada?.intentos || 0) : 0;
    const primerIntentoEl = intentos > 0 && c.altaArcaPresentada?.primerIntentoEl ? new Date(c.altaArcaPresentada.primerIntentoEl).toISOString() : "";
    const rechazadaEl = fallida && c.altaArcaPresentada?.fecha && !Number.isNaN(new Date(c.altaArcaPresentada.fecha).getTime()) ? new Date(c.altaArcaPresentada.fecha).toISOString() : "";
    if (c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida") motivo = "Ya se presentó en ARCA.";
    else if (row.sinCuit) motivo = "No tiene CUIT/CUIL: va por el circuito «Sin CUIT», no por ARCA.";
    else if (!empresaId || !empresa) motivo = "Falta elegir la Empresa Contrato.";
    else {
      const base = resolveAfip(row, cat);
      const r85 = resolveAfip85(row, cat, base);
      const suc = problemasDeSucursalParaTxt([row], cat);
      if (!r85.completo) {
        const faltan = r85.checks.filter((k) => k.estado === "falta" || k.estado === "error" || k.estado === "bloqueado").map((k) => k.label);
        motivo = faltan.length > 0 ? `Faltan datos de ARCA: ${[...new Set(faltan)].join(", ")}.` : "Faltan datos de ARCA (ver «Datos ARCA» en Contratos).";
      } else if (suc.length > 0) motivo = `Sucursal o actividad: ${TEXTO_PROBLEMA_SUCURSAL[suc[0].problema]}.`;
      else {
        try {
          registro = buildAltaRecord85(row, cat);
        } catch (e: any) {
          motivo = `No se pudo armar el registro: ${e?.message || e}`;
        }
        if (!registro && !motivo) motivo = "No se pudo armar el registro de Altas Masivas.";
      }
      if (!motivo) {
        const pisa = altaQueSePisa({ userId: String(up.userId), userProjectId: String(up._id), contractIndex: i, empresaId, alta: fechaAlta, baja: fechaBaja }, presentadas);
        if (pisa) motivo = `${textoAltaQueSePisa(pisa).replace(/^ya/, "Ya")}.`;
      }
    }

    out.push({
      userProjectId: String(up._id),
      contractIndex: i,
      userId: String(up.userId),
      nombre,
      cuil: String(u.metadata?.cuit || "").replace(/\D/g, ""),
      proyecto: proyecto?.name || "",
      cliente: clientePorId.get(String(proyecto?.clientId || "")) || "",
      tipoContrato: c.nombre_contrato || "",
      fechaAlta,
      fechaBaja,
      empresa: empresa ? { _id: String(empresa._id), razonSocial: String(empresa.razonSocial || "") } : null,
      momento: proximaCorridaPara(fechaAlta, cfg, ahora, hoy, { ultimaCola: opts.ultimaCola, esperaAManana: esperaAManana({ rechazadaEl, rechazoDefinitivo }, hoy) })?.toISOString() || "",
      presentable: !motivo && !!registro,
      terminado,
      rechazoDefinitivo,
      intentos,
      primerIntentoEl,
      rechazadaEl,
      envios: Number(c.enviosArca || 0),
      motivo,
      registro: motivo ? null : registro,
    });
  }
  out.sort((a, b) => a.fechaAlta.localeCompare(b.fechaAlta) || a.nombre.localeCompare(b.nombre, "es"));
  if (Date.now() - t0 > 2000) console.log(`[altas-automaticas] candidatos: ${out.length} en ${Date.now() - t0} ms (contratos ${msFilas} ms)`);
  return out;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Espera a que se cumpla la condición, mirando cada 5 s. false si se venció el plazo. */
async function esperarQue(cond: () => boolean, plazoMs: number): Promise<boolean> {
  const fin = Date.now() + plazoMs;
  while (!cond()) {
    if (Date.now() > fin) return false;
    await esperar(5000);
  }
  return true;
}

export interface ResultadoEmpresa {
  empresa: string;
  enviados: number;
  enSeco?: boolean;
  error?: string;
}

/**
 * Presenta los candidatos, una corrida por empleadora (en ARCA se entra con el CUIT de cada una), en
 * fila: cada corrida espera a que termine la anterior. Si hay otra corrida de ARCA en curso (una
 * validación de obras sociales, una presentación manual), espera a que se libere.
 */
export async function presentarCandidatos(o: {
  tenantId: string;
  tenantObjectId: Types.ObjectId;
  usuarioId?: string;
  candidatos: CandidatoAlta[];
  automatica: boolean;
  /** Avisa cuando la primera corrida arrancó (o falló al arrancar): el forzado en masa responde recién ahí, para que la pantalla ya la vea. */
  onArranque?: (r: { arranco: boolean; error?: string }) => void;
  /** Se va completando corrida por corrida (el forzado en masa lo expone a la pantalla). */
  acumular?: (r: ResultadoEmpresa) => void;
  /** Se suma al nombre de cada corrida en el resumen («atrasadas»). */
  rotulo?: string;
  /** Se mira antes de cada lote: true = no arrancar más corridas (la cola le deja el paso a la corrida del día). */
  debeCortar?: () => boolean;
}): Promise<ResultadoEmpresa[]> {
  const grupos = new Map<string, CandidatoAlta[]>();
  for (const c of o.candidatos) {
    if (!c.presentable || !c.registro || !c.empresa) continue;
    const g = grupos.get(c.empresa._id) || [];
    g.push(c);
    grupos.set(c.empresa._id, g);
  }
  const resultados: ResultadoEmpresa[] = [];
  let avisado = false;
  const avisar = (r: { arranco: boolean; error?: string }) => {
    if (avisado) return;
    avisado = true;
    o.onArranque?.(r);
  };
  const sumar = (r: ResultadoEmpresa) => {
    resultados.push(r);
    o.acumular?.(r);
  };
  for (const [empresaId, items] of grupos) {
    const razonSocial = items[0].empresa?.razonSocial || empresaId;
    /*
      UNA PERSONA POR CORRIDA. Un lote con el mismo CUIL dos veces (dos contratos de la misma persona con
      la misma empleadora) lo rechaza `validarLoteAltas` entero («El lote repite personas»), y así se caía
      la corrida automática completa de esa empleadora. Se parte en VUELTAS: la primera lleva un contrato
      por persona, la segunda el siguiente de quienes tenían dos, y así; cada vuelta es una corrida.
    */
    const vueltas: CandidatoAlta[][] = [];
    for (const c of items) {
      let v = vueltas.find((x) => !x.some((y) => y.cuil === c.cuil));
      if (!v) {
        v = [];
        vueltas.push(v);
      }
      v.push(c);
    }
    for (const [n, lote] of vueltas.entries()) {
      if (o.debeCortar?.()) {
        avisar({ arranco: false, error: "Se cortó para dejarle el paso a la corrida del día." });
        return resultados;
      }
      const etiqueta = `${vueltas.length > 1 ? `${razonSocial} (vuelta ${n + 1} de ${vueltas.length})` : razonSocial}${o.rotulo ? ` · ${o.rotulo}` : ""}`;
      const libre = await esperarQue(() => !quienTiene(o.tenantId), 30 * 60_000);
      if (!libre) {
        const r = { empresa: etiqueta, enviados: 0, error: "Había otra corrida de ARCA en curso y no terminó en 30 minutos." };
        sumar(r);
        avisar({ arranco: false, error: r.error });
        continue;
      }
      try {
        const r = await arrancarCorridaAltas({
          tenantId: o.tenantId,
          tenantObjectId: o.tenantObjectId,
          usuarioId: o.usuarioId,
          modo: "altas_masivas",
          empresaId,
          items: lote.map((c) => ({ userProjectId: c.userProjectId, contractIndex: c.contractIndex, registro: c.registro as string })),
          automatica: o.automatica,
        });
        avisar({ arranco: true });
        await esperarQue(() => {
          const c = corridaAltasDe(o.tenantId);
          return !c || c.terminada;
        }, 90 * 60_000);
        sumar({ empresa: etiqueta, enviados: r.total, enSeco: r.enSeco });
      } catch (e: any) {
        const detalle = Array.isArray(e?.detalle) && e.detalle.length > 0 ? ` ${e.detalle.map((d: any) => (typeof d === "string" ? d : `${d.etiqueta}: ${d.campo}`)).join(" · ")}` : "";
        const r = { empresa: etiqueta, enviados: 0, error: `${e?.message || e}${detalle}` };
        sumar(r);
        avisar({ arranco: false, error: r.error });
      }
    }
  }
  avisar({ arranco: false, error: "No había nada para presentar." });
  return resultados;
}

/** El forzado en masa de un tenant («Forzar presentación de N»): qué se pidió, qué corrida va y cómo terminó cada una. */
export interface ForzadoAltasEnCurso {
  arrancadoEl: Date;
  total: number;
  empresas: string[];
  resultados: ResultadoEmpresa[];
  omitidas: Array<{ nombre: string; motivo: string }>;
  terminado: boolean;
}
const forzados = new Map<string, ForzadoAltasEnCurso>();
export const forzadoAltasDe = (tenantId: string): ForzadoAltasEnCurso | undefined => forzados.get(tenantId);
export function registrarForzadoAltas(tenantId: string, f: ForzadoAltasEnCurso): ForzadoAltasEnCurso {
  forzados.set(tenantId, f);
  return f;
}

/**
 * Una corrida automática de UN tenant. Devuelve el resumen que se guarda.
 *   · "dia": la de la hora fija. PRIMERO las altas de su día (fecha de alta de hoy en adelante, hasta la
 *     anticipación), en corridas propias; DESPUÉS, en otras corridas, la cola de atrasadas. Así una falla
 *     de la cola no atrasa las del día.
 *   · "cola": modo frecuente, entre corrida y corrida del día: sólo lo que ya tuvo su turno. Corta entre
 *     lotes si llega la hora del día (`debeCortar`).
 */
export async function correrPresentacionAutomatica(
  tenantId: string,
  tenantObjectId: Types.ObjectId,
  cfg: ConfigAltasAutomaticas,
  tipo: "dia" | "cola",
  o: { debeCortar?: () => boolean } = {},
) {
  const hoy = hoyArgentina();
  const candidatos = await candidatosDeAlta(tenantObjectId, { hasta: hastaDeLaCorrida(hoy, cfg, tipo), cfg });
  const entran = rechazadasAlFinal(candidatos.filter((c) => entraEnLaCorrida(c, hoy)));
  const empresas: ResultadoEmpresa[] = [];
  if (tipo === "dia") {
    const delDia = entran.filter((c) => esDelDia(c.fechaAlta, hoy));
    const atrasadas = entran.filter((c) => !esDelDia(c.fechaAlta, hoy));
    empresas.push(...(await presentarCandidatos({ tenantId, tenantObjectId, candidatos: delDia, automatica: true })));
    empresas.push(...(await presentarCandidatos({ tenantId, tenantObjectId, candidatos: atrasadas, automatica: true, rotulo: "atrasadas" })));
  } else {
    empresas.push(...(await presentarCandidatos({ tenantId, tenantObjectId, candidatos: entran, automatica: true, debeCortar: o.debeCortar })));
  }
  const omitidos: Array<{ nombre: string; cuil: string; empresa: string; motivo: string }> = [];
  for (const c of candidatos) {
    const motivo = motivoDeOmision(c, hoy);
    if (motivo) omitidos.push({ nombre: c.nombre, cuil: c.cuil, empresa: c.empresa?.razonSocial || "", motivo });
  }
  return { fecha: new Date().toISOString(), dia: hoy, tipo, empresas, omitidos };
}
