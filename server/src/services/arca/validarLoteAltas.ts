import { Types } from "mongoose";
import UserProject from "../../models/UserProject.js";
import { Project } from "../../models/Project.js";
import { User } from "../../models/User.js";
import { Company } from "../../models/Company.js";
import { Convenio } from "../../models/Convenio.js";
import { ObraSocial } from "../../models/ObraSocial.js";
import { Info } from "../../models/Info.js";
import { ArcaSucursal } from "../../models/ArcaSucursal.js";
import { ArcaTipoServicio } from "../../models/ArcaTipoServicio.js";
import { ArcaModalidadContratacion } from "../../models/ArcaModalidadContratacion.js";
import { ArcaModalidadLiquidacion } from "../../models/ArcaModalidadLiquidacion.js";
import { getArcaDefaults } from "../../models/ArcaDefault.js";
import { listarCategoriasCompat } from "../../utils/categoriaCompat.js";
import { claveEstado } from "../../utils/estadoClave.js";
import { ESTADO_TYPE } from "../../utils/estadosImpositivosSistema.js";
import { unirRegistros } from "../../compartido/layoutAltaArca.js";
import { CatalogosCotejo, Diferencia, EsperadoAlta, ModoAltas, cotejarRegistro, cuilDeRegistro, problemasDeForma } from "./cotejoAltas.js";

/**
 * EL LOTE LO DECIDE EL SERVIDOR.
 *
 * El cliente manda `{ userProjectId, contractIndex, registro }` por contrato. Acá se comprueba que
 * cada registro sea EXACTAMENTE el de ese contrato —posición por posición contra la base, ver
 * `cotejoAltas.ts`— y que el lote sea presentable: una sola empleadora (la de la pestaña), contratos
 * en el estado de Alta temprana, sin CUILs repetidos, y no más de 9 si es Altas Masivas.
 *
 * Si UNA línea no coincide se rechaza el lote ENTERO. Mandar «los que estén bien» haría que el
 * resultado en ARCA dependa de un filtrado que nadie vio.
 */

export interface ItemLoteAltas {
  userProjectId: string;
  contractIndex: number;
  registro: string;
}

export interface LoteAltasValidado {
  modo: ModoAltas;
  empresa: { _id: string; cuit: string; razonSocial: string };
  items: Array<{ userProjectId: string; contractIndex: number; cuil: string; nombre: string; registro: string }>;
  /** El texto tal cual va a ARCA: LF, LF final en el archivo; sin LF final en el pegado. */
  texto: string;
}

export class LoteAltasError extends Error {
  constructor(
    message: string,
    public status = 400,
    public detalle: Array<string | Diferencia> = [],
  ) {
    super(message);
  }
}

const digitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const pad = (v: unknown, largo: number) => digitos(v).slice(-largo).padStart(largo, "0");

export async function validarLoteAltas(o: { tenantObjectId: any; modo: ModoAltas; empresaId: string; items: ItemLoteAltas[]; forzar?: boolean }): Promise<LoteAltasValidado> {
  const { tenantObjectId, modo, empresaId } = o;
  if (modo !== "carga_masiva" && modo !== "altas_masivas") throw new LoteAltasError("Modo de alta desconocido.");
  if (!Array.isArray(o.items)) throw new LoteAltasError("Falta la lista de contratos.");
  const items = o.items.map((i) => ({ userProjectId: String(i?.userProjectId || ""), contractIndex: Number(i?.contractIndex), registro: String(i?.registro ?? "") }));

  const forma = problemasDeForma(
    modo,
    items.map((i) => i.registro),
  );
  if (forma.length > 0) throw new LoteAltasError("El lote no tiene la forma de un registro de alta.", 400, forma);

  if (!Types.ObjectId.isValid(empresaId)) throw new LoteAltasError("La corrida arranca desde la pestaña de UNA empleadora: elegí una en «Empresa Contrato».");
  const empresa: any = await Company.findById(empresaId).select("cuit razonSocial sucursalIds sucursalActividades obrasSocialesIds obraSocialDefaultId obraSocialId defaultsArca").lean();
  if (!empresa) throw new LoteAltasError("La empleadora no existe.", 404);
  const empresaCuit = digitos(empresa.cuit);
  if (empresaCuit.length !== 11) throw new LoteAltasError("La empleadora no tiene CUIT cargado: sin eso no se puede elegir en ARCA.");

  // CUILs repetidos: dos altas de la misma persona en el mismo lote es un error del armado, y ARCA
  // rechaza la segunda (o peor, la acepta como otra relación).
  const cuils = items.map((i) => cuilDeRegistro(modo, i.registro));
  const repetidos = cuils.filter((c, i) => cuils.indexOf(c) !== i);
  if (repetidos.length > 0) throw new LoteAltasError("El lote repite personas.", 400, [`CUIL repetido: ${[...new Set(repetidos)].join(", ")}`]);

  // ── Contratos, con el tenant comprobado por el proyecto ─────────────────────────────────────────
  const ids = items.map((i) => i.userProjectId);
  if (ids.some((id) => !Types.ObjectId.isValid(id)) || items.some((i) => !Number.isInteger(i.contractIndex) || i.contractIndex < 0)) throw new LoteAltasError("Hay contratos mal identificados en el lote.");
  const ups: any[] = await UserProject.find({ _id: { $in: ids } })
    .select("projectId userId contracts")
    .lean();
  const upPorId = new Map(ups.map((u) => [String(u._id), u]));
  const proyectosDelTenant = new Set(
    (
      await Project.find({ _id: { $in: ups.map((u) => u.projectId) }, tenantId: tenantObjectId })
        .select("_id")
        .lean()
    ).map((p: any) => String(p._id)),
  );
  const usuarios: any[] = await User.find({ _id: { $in: ups.map((u) => u.userId) } })
    .select("firstName lastName metadata.cuit")
    .lean();
  const userPorId = new Map(usuarios.map((u) => [String(u._id), u]));

  // ── Lo que hace falta para resolver lo esperado ─────────────────────────────────────────────────
  const [categorias, convenios, obrasSociales, estados, defaultsGlobales, sucursales, modalidadesC, modalidadesL, tipos] = await Promise.all([
    listarCategoriasCompat(),
    Convenio.find().select("externalId obraSocialDefaultId").lean(),
    ObraSocial.find().select("externalId data.id").lean(),
    Info.find({ type: ESTADO_TYPE }).select("name data").lean(),
    getArcaDefaults(),
    ArcaSucursal.find({ _id: { $in: (empresa.sucursalIds || []).map(String) } })
      .select("codigo")
      .lean(),
    ArcaModalidadContratacion.find().select("externalId").lean(),
    ArcaModalidadLiquidacion.find().select("externalId").lean(),
    ArcaTipoServicio.find().select("externalId").lean(),
  ]);
  const clavesAltaTemprana = new Set(
    (estados as any[]).filter((e) => e?.data?.esImpositivo && e?.data?.tipoImpositivo === "alta_temprana_afip").map((e) => claveEstado(String(e.name || ""))),
  );
  const rnosPorDataId = (id: unknown) => {
    if (id === null || id === undefined || id === "") return "";
    const os: any = (obrasSociales as any[]).find((x) => Number(x?.data?.id) === Number(id));
    return digitos(os?.externalId);
  };
  const actividadesPorSucursal = new Map<string, Set<string>>();
  for (const s of sucursales as any[]) {
    const declaradas = (empresa.sucursalActividades || []).find((x: any) => String(x.sucursalId) === String(s._id))?.actividades || [];
    // Con el mismo relleno que el registro: el código guardado puede venir sin los ceros.
    actividadesPorSucursal.set(
      pad(s.codigo, 5),
      new Set(declaradas.map((a: any) => digitos(a.codigo)).filter(Boolean).map((a: string) => pad(a, 6))),
    );
  }
  const cat: CatalogosCotejo = {
    modalidadesContrato: new Set((modalidadesC as any[]).filter((m) => digitos(m.externalId)).map((m) => pad(m.externalId, 3))),
    modalidadesLiquidacion: new Set((modalidadesL as any[]).filter((m) => digitos(m.externalId)).map((m) => pad(m.externalId, 1))),
    tiposServicio: new Set((tipos as any[]).filter((m) => digitos(m.externalId)).map((m) => pad(m.externalId, 3))),
    sucursales: actividadesPorSucursal,
  };
  const dg: any = defaultsGlobales || {};
  const de: any = empresa.defaultsArca || {};

  const errores: Array<string | Diferencia> = [];
  const salida: LoteAltasValidado["items"] = [];

  items.forEach((it, n) => {
    const up = upPorId.get(it.userProjectId);
    const nro = `Registro ${n + 1}`;
    if (!up || !proyectosDelTenant.has(String(up.projectId))) {
      errores.push(`${nro}: el contrato no existe en esta cuenta.`);
      return;
    }
    const c: any = (up.contracts || [])[it.contractIndex];
    const u = userPorId.get(String(up.userId));
    const nombre = `${u?.firstName || ""} ${u?.lastName || ""}`.trim() || "(sin nombre)";
    const etiqueta = `${nombre} (contrato ${it.contractIndex + 1})`;
    if (!c) {
      errores.push(`${etiqueta}: el contrato ya no existe.`);
      return;
    }
    if (String(c.empresaContratoId || "") !== String(empresaId)) {
      errores.push(`${etiqueta}: su Empresa Contrato no es ${empresa.razonSocial}. Un lote es de UNA empleadora.`);
      return;
    }
    if (!clavesAltaTemprana.has(claveEstado(String(c.nombre_estado_empleado || "")))) {
      errores.push(`${etiqueta}: no está en el estado de Alta temprana de ARCA (está en «${c.nombre_estado_empleado || "sin estado"}»).`);
      return;
    }
    if (!o.forzar && c.altaArcaPresentada && c.altaArcaPresentada.resultado !== "fallida") {
      errores.push(`${etiqueta}: ya se presentó en ARCA (${c.altaArcaPresentada.via === "altas_masivas" ? "Altas Masivas" : "Carga Masiva"}, ${new Date(c.altaArcaPresentada.fecha).toLocaleDateString("es-AR")}). No se presenta dos veces.`);
      return;
    }

    const categoria: any = categorias.find((x: any) => Number(x?.data?.id) === Number(c.categoria_sat_id));
    const convenioCodigo = String(categoria?.data?.convenio || "").trim();

    // La misma cascada de obra social que `resolveAfipValues`: validada en ARCA, o la del convenio
    // si ARCA respondió que no figura. Sin validar NO hay obra social, y el lote no sale.
    let rnos = "";
    let rnosMotivo = "";
    if (c.obraSocialId !== null && c.obraSocialId !== undefined && c.obraSocialId !== "") rnos = rnosPorDataId(c.obraSocialId);
    else if (c.obraSocialNoFigura) {
      if (convenioCodigo === "9999/99") rnos = rnosPorDataId(empresa.obraSocialDefaultId ?? empresa.obraSocialId);
      else rnos = rnosPorDataId((convenios as any[]).find((x) => String(x.externalId || "").trim() === convenioCodigo)?.obraSocialDefaultId);
      if (!rnos) rnosMotivo = "la obra social del convenio (no está cargada)";
    } else rnosMotivo = "una obra social validada en ARCA (está sin validar)";

    const esperado: EsperadoAlta = {
      etiqueta,
      cuil: digitos(u?.metadata?.cuit),
      fechaInicio: String(c.fecha_alta_contrato || ""),
      fechaFin: String(c.fecha_baja_contrato || ""),
      categoria: String(categoria?.data?.codigoArca || categoria?.data?.codigoAfip || ""),
      convenio: convenioCodigo,
      retribucion: Number(categoria?.data?.sueldoBruto || 0),
      rnos,
      rnosMotivo,
      puesto: digitos(categoria?.data?.puestoDesempenado || de.puestoDesempenado || dg.puestoDesempenado || ""),
      situacionRevista: digitos(de.situacionRevista || dg.situacionRevista || "01"),
    };
    const dif = cotejarRegistro(modo, it.registro, esperado, cat);
    if (dif.length > 0) {
      errores.push(...dif);
      return;
    }
    salida.push({ userProjectId: it.userProjectId, contractIndex: it.contractIndex, cuil: esperado.cuil, nombre, registro: it.registro });
  });

  if (errores.length > 0) throw new LoteAltasError(`Hay ${errores.length} problema(s) en el lote: no se mandó nada a ARCA.`, 400, errores);

  const registros = salida.map((s) => s.registro);
  return {
    modo,
    empresa: { _id: String(empresa._id), cuit: empresaCuit, razonSocial: String(empresa.razonSocial || "") },
    items: salida,
    // El archivo de Carga Masiva cierra con LF; el pegado no (una línea vacía al final puede leerse
    // como un registro más). Ver `buildAltasMasivasTexto` en el frontend.
    texto: modo === "carga_masiva" ? unirRegistros(registros) : registros.join("\n"),
  };
}
