import { ContractOverviewRow } from "../../api/users";
import { CategoriaSatItem } from "../../api/categoriasSat";
import { ContratoItem } from "../../api/contratos";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { InfoItem } from "../../api/info";
import { ArcaSucursal } from "../../api/arcaSucursales";

/**
 * Chequeo de completitud de datos para la generación del TXT de Alta masiva de ARCA.
 * Resuelve cada campo requerido contra los catálogos y marca si está presente o falta.
 * Reutilizable por la vista de completitud (Fase 1b) y por el generador del TXT (Fase 2).
 */
export interface AfipCatalogs {
  categorias: CategoriaSatItem[]; // retribución (sueldoBruto) + categoría profesional (codigoAfip)
  tipos: ContratoItem[]; // códigos ARCA por Tipo de Contrato
  obrasSociales: SimpleCatalogItem[]; // código RNOS
  sedes: InfoItem[]; // catálogo de Sedes (lugar de trabajo; NO tiene relación con ARCA)
  /** Empresas empleadoras: obra social por defecto y qué sucursales tienen asignadas. */
  empresas?: Array<{ _id: string; obraSocialId?: number | null; sucursalIds?: string[] }>;
  /** Catálogo de Sucursales de ARCA: de acá salen el código de sucursal y las actividades. */
  sucursales?: ArcaSucursal[];
}

/**
 * Cómo se resolvió la actividad del domicilio de desempeño. Sirve para explicar en el checklist qué
 * falta y dónde cargarlo, en vez de mostrar un genérico "falta la actividad".
 */
export type ActividadOrigen =
  /** La sucursal tiene una sola actividad: el contrato la hereda. */
  | "unica"
  /** La sucursal tiene varias actividades y el contrato eligió una. */
  | "elegida"
  /** Todavía no se sabe la empleadora, así que no se sabe qué sucursales se pueden elegir. */
  | "sin_empresa"
  /** El contrato todavía no eligió sucursal. */
  | "sin_sucursal"
  /** La sucursal elegida no está asignada a la empresa del contrato (o ya no existe). */
  | "sucursal_invalida"
  /** La sucursal no tiene ninguna actividad cargada. */
  | "sin_actividades"
  /** La sucursal tiene varias actividades y el contrato todavía no eligió cuál declara. */
  | "ambigua";

export interface AfipFieldCheck {
  key: string;
  label: string;
  /** Valor resuelto para mostrar; "" si falta. */
  value: string;
  ok: boolean;
}

export interface AfipRowResult {
  checks: AfipFieldCheck[];
  faltantes: number;
  completo: boolean;
}

const soloDigitos = (s?: string | number | null): string => String(s ?? "").replace(/\D/g, "");

/** Valores ARCA resueltos de un contrato (crudos, para construir el registro del TXT). */
export interface AfipValues {
  cuil: string;
  fechaInicio: string; // tal cual está guardada (se normaliza al armar el TXT)
  fechaFin: string;
  retribucion: number; // sueldo bruto de la categoría
  categoriaProf: string; // código ARCA de la categoría
  modalidadContrato: string;
  tipoServicio: string;
  actividad: string;
  modalidadLiq: string;
  rnos: string;
  /** El RNOS no es de la persona: sale de una obra social por defecto. */
  rnosPorDefecto: boolean;
  /** De dónde salió el RNOS, para poder aclararlo en la vista de completitud. */
  rnosOrigen: "persona" | "empresa" | "global" | "ninguno";
  sucursal: string;
  /** Cómo se resolvió la actividad (o por qué no se pudo). */
  actividadOrigen: ActividadOrigen;
  /** Actividades declaradas para esa sucursal (para poder elegir en la UI). */
  actividadesDisponibles: ArcaSucursal["actividades"];
  /** Domicilio de la sucursal del contrato, para los mensajes del checklist. */
  nombreSucursal: string;
  /** Sucursales que el contrato puede elegir: las asignadas a su empresa empleadora. */
  sucursalesDisponibles: ArcaSucursal[];
}

/** Resuelve los valores ARCA de un contrato contra los catálogos (sin validar). */
export function resolveAfipValues(row: ContractOverviewRow, cat: AfipCatalogs): AfipValues {
  const categoria = row.categoria_sat_id != null ? cat.categorias.find((c) => c.data?.id === row.categoria_sat_id) : undefined;
  const tipo = cat.tipos.find((t) => t.name === row.nombre_contrato);
  // Cascada de obra social: la de la persona manda; si no tiene, la de la empresa del contrato; y
  // si esa tampoco, la global del catálogo. Sin ninguna, el contrato queda sin código RNOS y no
  // puede entrar en el TXT de alta masiva.
  const porDataId = (id?: number | null) => (id == null ? undefined : cat.obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const obraSocialPropia = porDataId(row.osId);
  const empresa = row.empresaContratoId ? cat.empresas?.find((e) => e._id === row.empresaContratoId) : undefined;
  const obraSocialEmpresa = porDataId(empresa?.obraSocialId);
  const obraSocialGlobal = cat.obrasSociales.find((o) => (o.data as { porDefecto?: boolean } | undefined)?.porDefecto);
  const obraSocial = obraSocialPropia || obraSocialEmpresa || obraSocialGlobal;

  // Sucursal y actividad salen del catálogo de Sucursales de ARCA, filtrado por las que tiene
  // asignadas la empresa empleadora. Nada de esto cuelga de la Sede: son entidades distintas.
  const sucursalesEmpresa = (cat.sucursales || []).filter((s) => (empresa?.sucursalIds || []).map(String).includes(s._id));
  const sucursal = row.sucursalArcaId ? sucursalesEmpresa.find((s) => s._id === row.sucursalArcaId) : undefined;
  const actividades = sucursal?.actividades?.filter((a) => !!a.codigo) || [];
  const elegida = row.actividadArca ? actividades.find((a) => a.codigo === row.actividadArca) : undefined;

  let actividad = "";
  let actividadOrigen: ActividadOrigen;
  if (!row.empresaContratoId) {
    actividadOrigen = "sin_empresa";
  } else if (!row.sucursalArcaId) {
    actividadOrigen = "sin_sucursal";
  } else if (!sucursal) {
    // Apunta a una sucursal que la empresa no tiene asignada (o que se borró del catálogo).
    actividadOrigen = "sucursal_invalida";
  } else if (actividades.length === 0) {
    actividadOrigen = "sin_actividades";
  } else if (actividades.length === 1) {
    actividad = actividades[0].codigo;
    actividadOrigen = "unica";
  } else if (elegida) {
    actividad = elegida.codigo;
    actividadOrigen = "elegida";
  } else {
    // Varias actividades y ninguna elegida: se deja vacío a propósito. Antes se tomaba la del Tipo
    // de Contrato, que daba un código plausible pero de otro domicilio — un alta válida para ARCA
    // pero mal declarada. Mejor que falte y lo frene el checklist.
    actividadOrigen = "ambigua";
  }

  return {
    cuil: soloDigitos(row.cuit),
    fechaInicio: row.fecha_alta_contrato || "",
    fechaFin: row.fecha_baja_contrato || "",
    retribucion: categoria?.data?.sueldoBruto || 0,
    categoriaProf: categoria?.data?.codigoAfip ? String(categoria.data.codigoAfip) : "",
    modalidadContrato: tipo?.data?.afipModalidadContrato || "",
    tipoServicio: tipo?.data?.afipTipoServicio || "",
    actividad,
    actividadOrigen,
    actividadesDisponibles: actividades,
    nombreSucursal: sucursal ? `${sucursal.codigo} — ${sucursal.domicilio}` : "",
    sucursalesDisponibles: sucursalesEmpresa,
    modalidadLiq: tipo?.data?.afipModalidadLiquidacion || "",
    // El "ID Externo" de la Obra Social siempre fue el código RNOS (ver ObrasSocialesPage.tsx).
    rnos: soloDigitos(obraSocial?.externalId),
    rnosPorDefecto: !obraSocialPropia && !!obraSocial,
    rnosOrigen: obraSocialPropia ? "persona" : obraSocialEmpresa ? "empresa" : obraSocialGlobal ? "global" : "ninguno",
    sucursal: sucursal?.codigo ? String(sucursal.codigo) : "",
  };
}

/**
 * Etiqueta del check de actividad. Como la actividad ahora sale de la registración de la sede en el
 * padrón de la empresa, "falta la actividad" puede significar cinco cosas distintas y cada una se
 * arregla en un lugar distinto. El mensaje dice cuál es y dónde.
 */
const etiquetaActividad = (v: AfipValues): string => {
  const suc = v.nombreSucursal ? `"${v.nombreSucursal}"` : "la sucursal";
  switch (v.actividadOrigen) {
    case "sin_empresa":
      return "Actividad del domicilio (elegí primero la Empresa del Contrato)";
    case "sin_sucursal":
      return "Actividad del domicilio (elegí primero la Sucursal de ARCA)";
    case "sucursal_invalida":
      return "Actividad del domicilio (la sucursal del contrato no está asignada a su empresa — revisala en Configuración → Empresas)";
    case "sin_actividades":
      return `Actividad del domicilio (${suc} no tiene actividades cargadas — cargalas en ARCA → Sucursales)`;
    case "ambigua":
      return `Actividad del domicilio (${suc} tiene ${v.actividadesDisponibles.length} actividades: elegí cuál declara este contrato)`;
    case "elegida":
      return "Actividad del domicilio (elegida en el contrato)";
    default:
      return "Actividad del domicilio";
  }
};

/** Resuelve y valida los datos ARCA de un contrato (fila del overview cross-proyecto). */
export function resolveAfip(row: ContractOverviewRow, cat: AfipCatalogs): AfipRowResult {
  const v = resolveAfipValues(row, cat);
  const checks: AfipFieldCheck[] = [
    { key: "cuil", label: "CUIL (11 díg.)", value: v.cuil, ok: v.cuil.length === 11 },
    { key: "fechaInicio", label: "Fecha de inicio", value: v.fechaInicio, ok: !!v.fechaInicio },
    { key: "retribucion", label: "Retribución (sueldo bruto de la categoría)", value: v.retribucion ? String(v.retribucion) : "", ok: v.retribucion > 0 },
    { key: "categoriaProf", label: "Categoría profesional (cód. ARCA)", value: v.categoriaProf, ok: !!v.categoriaProf },
    { key: "modalidadContrato", label: "Modalidad de contrato", value: v.modalidadContrato, ok: !!v.modalidadContrato },
    { key: "tipoServicio", label: "Tipo de servicio", value: v.tipoServicio, ok: !!v.tipoServicio },
    { key: "actividad", label: etiquetaActividad(v), value: v.actividad, ok: !!v.actividad },
    { key: "modalidadLiq", label: "Modalidad de liquidación", value: v.modalidadLiq, ok: !!v.modalidadLiq },
    { key: "rnos", label: v.rnosOrigen === "empresa" ? "Código RNOS (por defecto de la empresa)" : v.rnosOrigen === "global" ? "Código RNOS (por defecto global)" : "Código RNOS (obra social)", value: v.rnos, ok: !!v.rnos },
    { key: "sucursal", label: v.sucursal ? "Sucursal de ARCA (domicilio de desempeño)" : v.actividadOrigen === "sin_empresa" ? "Sucursal de ARCA (elegí primero la Empresa del Contrato)" : v.actividadOrigen === "sucursal_invalida" ? "Sucursal de ARCA (la elegida no está asignada a la empresa)" : "Sucursal de ARCA (elegila en la columna «Sucursal»)", value: v.sucursal, ok: !!v.sucursal },
  ];
  // No es un campo del registro ARCA (el TXT no lleva el CUIT de la empleadora), pero se exige igual:
  // un mismo TXT se sube a la sesión de UNA sola empresa en ARCA, así que hace falta saber a cuál
  // corresponde cada contrato antes de poder incluirlo.
  checks.push({ key: "empresa", label: "Empresa del Contrato", value: row.nombre_empresa_contrato || "", ok: !!row.empresaContratoId });

  const faltantes = checks.filter((c) => !c.ok).length;
  return { checks, faltantes, completo: faltantes === 0 };
}
