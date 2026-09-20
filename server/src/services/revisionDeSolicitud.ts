import { Types } from "mongoose";
import { Area } from "../models/Area.js";
import { Shift } from "../models/Shift.js";
import { Company } from "../models/Company.js";
import { Contrato } from "../models/Contrato.js";
import { Info } from "../models/Info.js";
import { Project } from "../models/Project.js";
import { RoleFrame } from "../models/RoleFrame.js";
import { User } from "../models/User.js";
import { resolverCategoriasCompatPorId } from "../utils/categoriaCompat.js";
import { claveEstado } from "../utils/estadoClave.js";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUÉ SE LE CAMBIÓ A UNA SOLICITUD AL APROBARLA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Quien aprueba abre el alta con lo que se pidió desde la app y, muchas veces, arregla algo antes de
 * guardar: la fecha de baja, el turno, el tipo de contrato. Hasta ahora esa corrección no se veía en
 * ningún lado —la solicitud quedaba «APROBADA» a secas—, así que quien la cargó seguía creyendo que
 * se contrató lo que había pedido y la próxima la cargaba igual.
 *
 * Esto compara lo PEDIDO (el `metadata` de la solicitud) contra lo APROBADO (el contrato que se
 * guardó) y devuelve una lista de diferencias en texto llano, lista para mostrar.
 *
 * DOS REGLAS QUE VALE LA PENA TENER PRESENTES:
 *
 *   · Sólo se comparan los campos que la app DEJA CARGAR. Un campo que quien pide no elige no es una
 *     corrección suya que aprender: es trabajo de quien aprueba, y listarlo sería ruido.
 *
 *   · Un campo que la solicitud dejó VACÍO no cuenta como cambio. No se le corrigió nada: no lo
 *     cargó. Si apareciera, media lista serían «(sin cargar) → algo» en cada aprobación.
 */

export interface CambioDeRevision {
  campo: string;
  pedido: string;
  aprobado: string;
}

/** Los días de la semana como los escribe la app (0 = domingo, igual que `Date.getDay()`). */
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const texto = (v: any): string => (v === null || v === undefined ? "" : String(v).trim());

/** "2026-09-19T00:00:00Z", "19/09/2026" y un Date terminan todos en "19/09/2026". */
const fecha = (v: any): string => {
  if (!v) return "";
  const crudo = v instanceof Date ? v.toISOString() : String(v).trim();
  if (!crudo || ["null", "undefined", "-"].includes(crudo.toLowerCase())) return "";
  const iso = crudo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = crudo.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmy) return `${dmy[1].padStart(2, "0")}/${dmy[2].padStart(2, "0")}/${dmy[3]}`;
  return crudo;
};

const numero = (v: any): string => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? String(n) : "";
};

const pesos = (v: any): string => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";
};

const id = (v: any): string => String(v && typeof v === "object" ? v._id || "" : v || "").trim();

/** "Cocina: Mañana, Tarde · Piso: Noche" — el área y sus turnos, en un renglón comparable. */
const textoAreasTurnos = (asignaciones: any[], areas: Map<string, string>, turnos: Map<string, string>): string =>
  (asignaciones || [])
    .map((a: any) => {
      const area = areas.get(id(a?.areaId)) || "";
      const suyos = (a?.shiftIds || []).map((s: any) => turnos.get(id(s)) || "").filter(Boolean);
      if (!area && suyos.length === 0) return "";
      return suyos.length > 0 ? `${area || "Área"}: ${suyos.join(", ")}` : area;
    })
    .filter(Boolean)
    .join(" · ");

/**
 * Compara la solicitud con el contrato que se guardó al aprobarla.
 *
 * `meta` es el `metadata` de la solicitud tal como lo cargó la app; `contrato` es el contrato ya
 * enriquecido (con los `nombre_*` resueltos) que se acaba de guardar.
 */
export async function cambiosAlAprobar(meta: any, contrato: any, proyecto: { _id: any; name?: string }): Promise<CambioDeRevision[]> {
  if (!meta) return [];

  /*
    Todo lo que la solicitud guarda por id se resuelve ACÁ, de una, para poder compararlo contra los
    nombres que el contrato ya trae resueltos. Un `findById` por campo serían diez idas a la base.
  */
  const idsAreas = new Set<string>();
  const idsTurnos = new Set<string>();
  for (const a of meta.areaShiftAssignments || []) {
    if (id(a?.areaId)) idsAreas.add(id(a.areaId));
    for (const s of a?.shiftIds || []) if (id(s)) idsTurnos.add(id(s));
  }
  for (const a of contrato?.areaShiftAssignments || []) {
    if (id(a?.areaId)) idsAreas.add(id(a.areaId));
    for (const s of a?.shiftIds || []) if (id(s)) idsTurnos.add(id(s));
  }

  const idsRolesEmpresa: string[] = (meta.roles_frame || meta.rolesFrameIds || (meta.roleFrameId ? [meta.roleFrameId] : [])).map(id).filter(Boolean);
  const idsProyectos: string[] = (meta.projectIds || []).map(id).filter(Boolean);

  const soloValidos = (ids: Iterable<string>) => [...ids].filter((x) => Types.ObjectId.isValid(x));

  const [areasDocs, turnosDocs, rolesDocs, proyectosDocs, empresaPedida, contratoPedido, categoriaPedida, estadosDocs, reemplazadoPedido] = await Promise.all([
    Area.find({ _id: { $in: soloValidos(idsAreas) } }).select("name").lean(),
    Shift.find({ _id: { $in: soloValidos(idsTurnos) } }).select("name").lean(),
    RoleFrame.find({ _id: { $in: soloValidos(idsRolesEmpresa) } }).select("name").lean(),
    Project.find({ _id: { $in: soloValidos(idsProyectos) } }).select("name").lean(),
    Types.ObjectId.isValid(id(meta.empresaContratoId)) ? Company.findById(id(meta.empresaContratoId)).select("razonSocial").lean() : null,
    Types.ObjectId.isValid(id(meta.contratoId)) ? Contrato.findById(id(meta.contratoId)).select("name").lean() : null,
    Types.ObjectId.isValid(id(meta.categoriaSatId)) ? buscarCategoriaPorId(id(meta.categoriaSatId)) : null,
    /*
      El catálogo ENTERO de estados, no el primero que matchee el trámite.

      La app no elige un estado: elige un TRÁMITE (`alta_temprana_afip` / `constancia_cuit`). El
      contrato, en cambio, guarda el nombre de un estado del ABM. Y un mismo trámite puede tener
      varios estados —«Pedido de ARCA» y «Pedido de AFIP» son el mismo— así que comparar nombres daría
      un cambio en casi toda aprobación. Se comparan los TRÁMITES, con los nombres sólo para mostrar.
    */
    Info.find({ type: "estado-empleado" }).select("name data.tipoImpositivo").lean(),
    Types.ObjectId.isValid(id(meta.replacedUserId)) ? User.findById(id(meta.replacedUserId)).select("firstName lastName metadata.fullName").lean() : null,
  ]);

  const areas = new Map((areasDocs as any[]).map((a) => [String(a._id), a.name as string]));
  const turnos = new Map((turnosDocs as any[]).map((t) => [String(t._id), t.name as string]));
  const nombreDePersona = (u: any) => (u ? (u.metadata?.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim() || "") : "");

  /*
    A quién reemplaza: la solicitud lo guarda como usuario (`replacedUserId`) y el contrato como el id
    de FRAME (`empleado_id_reemplezado`). Se comparan por NOMBRE, que es lo único que significa lo
    mismo de los dos lados —y lo único que quien pidió el alta puede reconocer—.
  */
  let reemplazadoAprobado: any = null;
  if (contrato?.empleado_id_reemplezado) {
    reemplazadoAprobado = await User.findOne({ "metadata.id": Number(contrato.empleado_id_reemplezado) }).select("firstName lastName metadata.fullName").lean();
  }

  /*
    EL TRÁMITE, DE LOS DOS LADOS.

    Del lado pedido sale directo (`meta.tipoImpositivo`); del aprobado hay que ir del nombre del
    estado que guardó el contrato al trámite de ese estado, por su clave canónica —el contrato puede
    tener guardado un alias viejo del nombre—.
  */
  const estados = estadosDocs as any[];
  const tramitePedido = texto(meta.tipoImpositivo);
  const estadoDelContrato = estados.find((e) => claveEstado(e.name) === claveEstado(texto(contrato?.nombre_estado_empleado)));
  const tramiteAprobado = texto(estadoDelContrato?.data?.tipoImpositivo);
  const nombreDelTramitePedido = texto(estados.find((e) => e.data?.tipoImpositivo === tramitePedido)?.name);

  const horarioPedido = texto(meta.schedule).replace(/\s*-\s*/, " - ");
  const horarioAprobado = contrato?.hora_inicio || contrato?.hora_fin ? `${texto(contrato.hora_inicio)} - ${texto(contrato.hora_fin)}` : "";

  const diasPedidos = (meta.diasSemana || []).map((d: any) => DIAS[Number(d)] || "").filter(Boolean).join(", ");
  const diasAprobados = (contrato?.dias_semana || []).map((d: any) => DIAS[Number(d)] || "").filter(Boolean).join(", ");

  /*
    ELEGIR UNA DE LAS PEDIDAS NO ES CAMBIARLA.

    La solicitud puede declarar varios proyectos y varios roles empresa; el contrato tiene UNO de
    cada cosa —se aprueba para un proyecto, con un rol—. Comparando la lista contra el elegido, toda
    aprobación diría «Rol empresa: Editor, Camarógrafo → Camarógrafo», que no es una corrección que
    nadie tenga que aprender. Sólo cuenta cuando lo aprobado NO estaba entre lo pedido.
  */
  const eligioDeLaLista = (pedidos: string[], aprobado: string) => pedidos.length > 0 && pedidos.some((x) => x === aprobado);
  const proyectosPedidos = (proyectosDocs as any[]).map((p) => texto(p.name)).filter(Boolean);
  const rolesPedidos = (rolesDocs as any[]).map((r) => texto(r.name)).filter(Boolean);
  const proyectoAprobado = texto(proyecto?.name);
  const rolAprobado = texto(contrato?.nombre_rol_frame);

  const comparaciones: CambioDeRevision[] = [
    { campo: "Proyecto", pedido: eligioDeLaLista(proyectosPedidos, proyectoAprobado) ? proyectoAprobado : proyectosPedidos.join(", "), aprobado: proyectoAprobado },
    { campo: "Rol empresa", pedido: eligioDeLaLista(rolesPedidos, rolAprobado) ? rolAprobado : rolesPedidos.join(", "), aprobado: rolAprobado },
    { campo: "Tipo de contrato", pedido: texto((contratoPedido as any)?.name) || texto(meta.nombre_contrato), aprobado: texto(contrato?.nombre_contrato) },
    // El trámite, mostrado con los nombres de los estados: es lo que se lee en las dos pantallas.
    { campo: "Trámite impositivo", pedido: tramitePedido === tramiteAprobado ? texto(contrato?.nombre_estado_empleado) : nombreDelTramitePedido, aprobado: texto(contrato?.nombre_estado_empleado) },
    { campo: "Fecha de alta", pedido: fecha(meta.startDate), aprobado: fecha(contrato?.fecha_alta_contrato) },
    { campo: "Fecha de baja", pedido: fecha(meta.dueDate), aprobado: fecha(contrato?.fecha_baja_contrato) },
    { campo: "Área y turno", pedido: textoAreasTurnos(meta.areaShiftAssignments, areas, turnos), aprobado: textoAreasTurnos(contrato?.areaShiftAssignments, areas, turnos) },
    { campo: "Horario", pedido: horarioPedido, aprobado: horarioAprobado },
    { campo: "Días por semana", pedido: numero(meta.diasPorSemana), aprobado: numero(contrato?.dias_por_semana) },
    { campo: "Días de la semana", pedido: diasPedidos, aprobado: diasAprobados },
    { campo: "Jornadas", pedido: numero(meta.workdaysCount), aprobado: numero(contrato?.cantidad_jornadas_laborales) },
    { campo: "Valor por jornada", pedido: pesos(meta.dailyRate), aprobado: pesos(contrato?.sueldo_jornada) },
    { campo: "Categoría", pedido: texto((categoriaPedida as any)?.name), aprobado: texto(contrato?.nombre_categoria_sat) },
    { campo: "Empresa del contrato", pedido: texto((empresaPedida as any)?.razonSocial), aprobado: texto(contrato?.nombre_empresa_contrato) },
    { campo: "Reemplaza a", pedido: nombreDePersona(reemplazadoPedido), aprobado: nombreDePersona(reemplazadoAprobado) },
  ];

  /*
    Se descarta lo que no cambió y lo que la solicitud no había cargado (ver la segunda regla de
    arriba). «Sin categoría» y «Sin sede» son los rellenos que pone el propio guardado cuando no se
    eligió nada: tratarlos como un valor haría aparecer cambios que nadie hizo.
  */
  const vacio = (v: string) => !v || /^sin (categoria|categoría|sede|tipo|área|area|turno|rol frame)$/i.test(v);
  return comparaciones.filter((c) => !vacio(c.pedido) && c.pedido !== c.aprobado);
}

/** La categoría de la solicitud por su `_id`, para poder compararla por nombre con la del contrato. */
async function buscarCategoriaPorId(idCategoria: string) {
  // `resolverCategoriasCompatPorId` mira el catálogo nuevo y, para lo que no esté, el viejo.
  const [cat] = await resolverCategoriasCompatPorId([idCategoria]);
  return cat || null;
}
