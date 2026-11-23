/**
 * LAS RELACIONES DE ARCA SOBRE LAS QUE SE PUEDE OPERAR, VISTAS DESDE ARCA (22/11/2026).
 *
 * Gestión › Bajas ARCA (`listaBajasArca.ts`) parte de la RELACIÓN (una fila del espejo de Relaciones Laborales), y
 * una relación puede tener un contrato en WeProdu, varios o ninguno:
 *
 *   · `contrato`      un solo contrato con esa persona, empleadora y fecha de alta: el panel abre con él.
 *   · `elegir`        varios: hay que elegir cuál antes de abrir.
 *   · `sin_contrato`  ninguno (las altas viejas hechas a mano): el panel abre «sin contrato». La operación no
 *                     se puede guardar en ningún contrato; la marca que impide mandarla dos veces va al registro
 *                     de operaciones (`registroOperaciones.ts`).
 *   · `null`          no hay nada que operar (y `motivo` dice por qué).
 *
 * LA DECISIÓN ES LA DE SIEMPRE: `compartido/arca/relacionParaOperar.ts`, la misma que usa el panel, contrato por
 * contrato. Acá sólo se arma con qué llamarla. Un contrato de Servicios con la misma fecha
 * de alta no cuenta como contrato de la relación: Servicios no tiene relación en ARCA.
 *
 * LIVIANA A PROPÓSITO (la base está lejos): de los contratos sólo viajan los que empiezan en la fecha de inicio de
 * alguna de las relaciones pedidas, con los campos que la regla mira.
 */
import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { RelacionLaboralArca } from "../../models/RelacionLaboralArca.js";
import { fechaISO, hoyArgentina } from "../../utils/contratoVigencia.js";
import { fechaISOExpr } from "../../utils/contratosQueRigen.js";
import { lectorDeTramites } from "../superposicion.js";
import { operacionReciente, relacionParaOperar, sinRelacionEnArca, type RelacionParaOperar } from "../../compartido/arca/relacionParaOperar.js";
import { claveDeRelacion, marcasDeRegistro, SIN_MARCAS, type MarcasDeRegistro } from "./registroOperaciones.js";

const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const iso = (d: unknown) => (d ? new Date(d as any).toISOString().slice(0, 10) : "");
const conGuiones = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;
const menosDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Las personas de esos CUIL. El CUIL está guardado de varias formas (11 dígitos, con guiones y, en 17 fichas al
 * 22/11/2026, con otros separadores): para pocas personas se busca con un patrón que ignora los separadores; para
 * muchas se traen las fichas con CUIL (tres campos) y se compara por los dígitos. Una persona que no se encontrara
 * haría pasar por «sin contrato» una relación que sí lo tiene.
 */
async function usuariosDeCuils(tid: Types.ObjectId, cuils: string[]): Promise<any[]> {
  if (!cuils.length) return [];
  if (cuils.length <= 3) {
    const patron = (c: string) => new RegExp("^\\D*" + c.split("").join("\\D*") + "\\D*$");
    return User.find({ tenantId: tid, $or: cuils.flatMap((c) => [{ "metadata.cuit": { $in: [c, conGuiones(c)] } }, { "metadata.cuit": patron(c) }]) }).select("firstName lastName metadata.cuit").lean();
  }
  const buscados = new Set(cuils);
  const todos: any[] = await User.find({ tenantId: tid, "metadata.cuit": { $exists: true, $nin: ["", null] } }).select("firstName lastName metadata.cuit").lean();
  return todos.filter((u) => buscados.has(dig(u.metadata?.cuit)));
}

/** Hasta cuántos días atrás una relación cerrada cuenta como «cerrada hace poco» (`estadoDeRelacion`). */
export const DIAS_CERRADA_RECIENTE = 30;

export type EstadoDeRelacion = "abierta" | "fin_futuro" | "cerrada_reciente" | "cerrada";
export type ModoDeOperar = "contrato" | "elegir" | "sin_contrato";

export interface ContratoDeRelacion {
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  proyecto: string;
  contrato: string;
  alta: string;
  baja: string;
  /** La decisión de la regla compartida para ESTE contrato. */
  relacionArca: RelacionParaOperar;
  /** La baja presentada desde WeProdu en este contrato (`bajaArcaPresentada`), si hay. */
  bajaPresentada: { resultado: string; clase: string; fecha: string } | null;
  /** El motivo de baja cargado en el contrato (código de ARCA) y la fecha de telegrama (sólo con renuncia). */
  motivoBaja?: string;
  fechaTelegrama?: string;
}

export interface RelacionOperable {
  clave: string;
  empleadoraCuit: string;
  empleadora: string;
  cuil: string;
  persona: string;
  /** La persona en WeProdu, si está. */
  userId: string | null;
  inicio: string;
  fin: string;
  situacionBaja: string;
  modalidadContrato: string;
  estado: EstadoDeRelacion;
  /** Los contratos de WeProdu de esa relación (misma persona, empleadora y fecha de alta; sin anulados ni Servicios). */
  contratos: ContratoDeRelacion[];
  modo: ModoDeOperar | null;
  puede: boolean;
  /** Por qué no se opera ("" si se puede). */
  motivo: string;
  /** Modo `contrato` con el contrato ya terminado en WeProdu: cuántos días pasaron desde su fin. */
  diasDesdeFinContrato: number | null;
  /** La baja de esta relación en el registro de operaciones (lo que hay cuando no tiene contrato donde marcarla). */
  bajaEnRegistro: { resultado: string; fecha: string } | null;
}

/** El estado de una relación por su fecha de fin. Pura. */
export function estadoDeRelacion(fin: string, hoy: string): EstadoDeRelacion {
  if (!fin) return "abierta";
  if (fin >= hoy) return "fin_futuro";
  return fin >= menosDias(hoy, DIAS_CERRADA_RECIENTE) ? "cerrada_reciente" : "cerrada";
}

export interface ContratoCandidato {
  userProjectId: string;
  contratoKey: string | null;
  posicion: number;
  proyecto: string;
  contrato: string;
  alta: string;
  baja: string;
  estadoContrato: string;
  tramite: string | null;
  altaArcaPresentada: { resultado?: string; via?: string } | null;
  marcas: Array<{ resultado?: string; fecha?: unknown } | null | undefined>;
  /** La marca de la baja (`bajaArcaPresentada`), con su clase: para saber si quedó sin confirmar. */
  marcaBaja?: { resultado?: string; clase?: string; fecha?: unknown } | null;
  motivoBaja?: string;
  fechaTelegrama?: string;
}

/**
 * CÓMO SE OPERA UNA RELACIÓN, dados los contratos de WeProdu que empiezan ese día con esa empleadora. Pura: es la
 * parte que se prueba (`relacionesOperables.test.ts`).
 */
export function modoDeOperar(
  rel: { empleadoraCuit: string; cuil: string; inicio: string; fin: string },
  contratos: ContratoCandidato[],
  registro: MarcasDeRegistro,
  hoy: string,
): Pick<RelacionOperable, "contratos" | "modo" | "puede" | "motivo" | "diasDesdeFinContrato"> {
  const marcasRegistro = [registro.baja, registro.modificacion, registro.anulacion];
  // Servicios no tiene relación en ARCA: un Servicios que empieza el mismo día no es el contrato de esta relación.
  const suyos = contratos.filter((c) => c.estadoContrato !== "ANULADO" && !sinRelacionEnArca(c.tramite));
  const vistos: ContratoDeRelacion[] = suyos.map((c) => ({
    userProjectId: c.userProjectId,
    contratoKey: c.contratoKey,
    posicion: c.posicion,
    proyecto: c.proyecto,
    contrato: c.contrato,
    alta: c.alta,
    baja: c.baja,
    motivoBaja: String(c.motivoBaja || ""),
    fechaTelegrama: String(c.fechaTelegrama || ""),
    bajaPresentada: c.marcaBaja?.resultado ? { resultado: String(c.marcaBaja.resultado), clase: String(c.marcaBaja.clase || ""), fecha: c.marcaBaja.fecha ? new Date(c.marcaBaja.fecha as any).toISOString() : "" } : null,
    relacionArca: relacionParaOperar({
      tramite: c.tramite,
      estadoContrato: c.estadoContrato,
      cuil: rel.cuil,
      empresaCuit: rel.empleadoraCuit,
      alta: c.alta,
      altaArcaPresentada: c.altaArcaPresentada,
      enEspejo: true,
      hoy,
      fin: rel.fin,
      operacionReciente: operacionReciente([...c.marcas, ...marcasRegistro], hoy),
    }),
  }));
  const operables = vistos.filter((c) => c.relacionArca.puede);
  if (operables.length === 1) {
    const c = operables[0];
    return { contratos: vistos, modo: "contrato", puede: true, motivo: "", diasDesdeFinContrato: c.baja && c.baja < hoy ? diasEntre(c.baja, hoy) : null };
  }
  if (operables.length > 1) return { contratos: vistos, modo: "elegir", puede: true, motivo: "", diasDesdeFinContrato: null };
  if (vistos.length > 0) return { contratos: vistos, modo: null, puede: false, motivo: vistos[0].relacionArca.motivo, diasDesdeFinContrato: null };
  // Ningún contrato: se decide con la misma regla, sin mirar el trámite (no hay tipo de contrato que mirar).
  const r = relacionParaOperar({
    cuil: rel.cuil,
    empresaCuit: rel.empleadoraCuit,
    alta: rel.inicio,
    altaArcaPresentada: registro.altaAnulada ? { resultado: "anulada" } : null,
    enEspejo: true,
    hoy,
    fin: rel.fin,
    operacionReciente: operacionReciente(marcasRegistro, hoy),
  });
  return { contratos: [], modo: r.puede ? "sin_contrato" : null, puede: r.puede, motivo: r.motivo, diasDesdeFinContrato: null };
}

export interface FiltroRelaciones {
  /** Todas las relaciones de una persona (Antigüedad ARCA). */
  cuil?: string;
  /** UNA relación (el panel, en modo «sin contrato»). */
  relacion?: { empleadoraCuit: string; cuil: string; fechaInicio: string };
  // Sin ninguno de los dos: las VIVAS de todas las personas (abiertas, o con fin de hoy en adelante): Bajas ARCA.
}

export async function relacionesOperables(tenantId: Types.ObjectId | string, filtro: FiltroRelaciones = {}): Promise<{ hoy: string; relaciones: RelacionOperable[] }> {
  const tid = new Types.ObjectId(String(tenantId));
  const hoy = hoyArgentina();
  const q: any = { tenantId: tid };
  if (filtro.relacion) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(filtro.relacion.fechaInicio)) return { hoy, relaciones: [] };
    Object.assign(q, { empleadoraCuit: dig(filtro.relacion.empleadoraCuit), cuil: dig(filtro.relacion.cuil), fechaInicio: new Date(`${filtro.relacion.fechaInicio}T00:00:00.000Z`) });
  } else if (filtro.cuil) q.cuil = dig(filtro.cuil);
  else q.$or = [{ fechaFin: null }, { fechaFin: { $gte: new Date(`${hoy}T00:00:00.000Z`) } }];
  const rels: any[] = await RelacionLaboralArca.find(q).select("-_id empleadoraCuit cuil apellidoNombre fechaInicio fechaFin situacionBaja modalidadContrato").lean();
  if (!rels.length) return { hoy, relaciones: [] };

  const cuils = [...new Set(rels.map((r) => String(r.cuil)))];
  const inicios = [...new Set(rels.map((r) => iso(r.fechaInicio)))];
  const [usuarios, empresas, tramiteDe, registro]: [any[], any[], Awaited<ReturnType<typeof lectorDeTramites>>, Map<string, MarcasDeRegistro>] = await Promise.all([
    usuariosDeCuils(tid, cuils),
    Company.find({}).select("cuit razonSocial").lean(),
    lectorDeTramites(),
    marcasDeRegistro(tid, rels.map((r) => claveDeRelacion(String(r.empleadoraCuit), String(r.cuil), iso(r.fechaInicio)))),
  ]);
  const usuarioPorCuil = new Map<string, any>(usuarios.map((u) => [dig(u.metadata?.cuit), u]));
  const empresaPorId = new Map(empresas.map((e) => [String(e._id), { cuit: dig(e.cuit), nombre: String(e.razonSocial || "") }]));
  const nombreDeEmpresa = new Map(empresas.map((e) => [dig(e.cuit), String(e.razonSocial || "")]));

  // Los contratos de esas personas que empiezan en alguna de esas fechas (con su posición en el vínculo).
  const ids = usuarios.map((u) => u._id);
  const marca = (campo: string) => ({ resultado: `$$p.c.${campo}.resultado`, fecha: `$$p.c.${campo}.fecha` });
  const ups: any[] = ids.length
    ? await UserProject.aggregate([
        { $match: { userId: { $in: ids } } },
        { $project: { userId: 1, nombre_proyecto: 1, cs: { $map: { input: { $range: [0, { $size: { $ifNull: ["$contracts", []] } }] }, as: "i", in: { i: "$$i", c: { $arrayElemAt: ["$contracts", "$$i"] } } } } } },
        { $project: { userId: 1, nombre_proyecto: 1, cs: { $filter: { input: "$cs", as: "p", cond: { $in: [fechaISOExpr("$$p.c.fecha_alta_contrato"), inicios] } } } } },
        { $match: { "cs.0": { $exists: true } } },
        {
          $project: {
            userId: 1,
            nombre_proyecto: 1,
            cs: {
              $map: {
                input: "$cs",
                as: "p",
                in: {
                  i: "$$p.i",
                  contratoKey: "$$p.c.contratoKey",
                  estadoContrato: "$$p.c.estadoContrato",
                  alta: "$$p.c.fecha_alta_contrato",
                  baja: "$$p.c.fecha_baja_contrato",
                  empresa: "$$p.c.empresaContratoId",
                  nombre_contrato: "$$p.c.nombre_contrato",
                  tipo_contrato_id: "$$p.c.tipo_contrato_id",
                  contrato_id: "$$p.c.contrato_id",
                  motivoBaja: "$$p.c.motivoBajaArca",
                  fechaTelegrama: "$$p.c.fechaTelegramaBaja",
                  altaRes: "$$p.c.altaArcaPresentada.resultado",
                  altaVia: "$$p.c.altaArcaPresentada.via",
                  mBaja: { ...marca("bajaArcaPresentada"), clase: "$$p.c.bajaArcaPresentada.clase" },
                  mMod: marca("modificacionArcaPresentada"),
                  mAnu: marca("anulacionArcaPresentada"),
                },
              },
            },
          },
        },
      ])
    : [];
  const cuilDeUsuario = new Map(usuarios.map((u) => [String(u._id), dig(u.metadata?.cuit)]));
  const candidatos = new Map<string, ContratoCandidato[]>();
  for (const up of ups) {
    const cuil = cuilDeUsuario.get(String(up.userId)) || "";
    for (const c of up.cs || []) {
      const e = c.empresa ? empresaPorId.get(String(c.empresa)) : null;
      const alta = fechaISO(c.alta) || "";
      if (!e || e.cuit.length !== 11 || !alta) continue;
      const k = claveDeRelacion(e.cuit, cuil, alta);
      (candidatos.get(k) || candidatos.set(k, []).get(k)!).push({
        userProjectId: String(up._id),
        contratoKey: c.contratoKey ? String(c.contratoKey) : null,
        posicion: Number(c.i),
        proyecto: String(up.nombre_proyecto || ""),
        contrato: String(c.nombre_contrato || ""),
        alta,
        baja: fechaISO(c.baja) || "",
        estadoContrato: String(c.estadoContrato || ""),
        tramite: tramiteDe({ nombre_contrato: c.nombre_contrato, tipo_contrato_id: c.tipo_contrato_id, contrato_id: c.contrato_id }),
        altaArcaPresentada: c.altaRes ? { resultado: c.altaRes, via: c.altaVia } : null,
        marcas: [c.mBaja, c.mMod, c.mAnu],
        marcaBaja: c.mBaja || null,
        motivoBaja: String(c.motivoBaja || ""),
        fechaTelegrama: String(c.fechaTelegrama || ""),
      });
    }
  }

  const relaciones: RelacionOperable[] = rels.map((r) => {
    const empleadoraCuit = String(r.empleadoraCuit);
    const cuil = String(r.cuil);
    const inicio = iso(r.fechaInicio);
    const fin = iso(r.fechaFin);
    const clave = claveDeRelacion(empleadoraCuit, cuil, inicio);
    const u = usuarioPorCuil.get(cuil);
    const reg = registro.get(clave) || SIN_MARCAS;
    return {
      clave,
      empleadoraCuit,
      empleadora: nombreDeEmpresa.get(empleadoraCuit) || empleadoraCuit,
      cuil,
      persona: u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || String(r.apellidoNombre || "") : String(r.apellidoNombre || ""),
      userId: u ? String(u._id) : null,
      inicio,
      fin,
      situacionBaja: String(r.situacionBaja || ""),
      modalidadContrato: String(r.modalidadContrato || ""),
      estado: estadoDeRelacion(fin, hoy),
      ...modoDeOperar({ empleadoraCuit, cuil, inicio, fin }, candidatos.get(clave) || [], reg, hoy),
      bajaEnRegistro: reg.baja?.resultado ? { resultado: String(reg.baja.resultado), fecha: reg.baja.fecha ? new Date(reg.baja.fecha).toISOString() : "" } : null,
    };
  });
  return { hoy, relaciones };
}
