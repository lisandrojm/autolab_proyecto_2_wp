import { ContractOverviewRow } from "../../api/users";
import { CategoriaSatItem } from "../../api/categoriasSat";
import { ContratoItem } from "../../api/contratos";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { InfoItem } from "../../api/info";

/**
 * Chequeo de completitud de datos para la generación del TXT de Alta masiva de AFIP.
 * Resuelve cada campo requerido contra los catálogos y marca si está presente o falta.
 * Reutilizable por la vista de completitud (Fase 1b) y por el generador del TXT (Fase 2).
 */
export interface AfipCatalogs {
  categorias: CategoriaSatItem[]; // retribución (sueldoBruto) + categoría profesional (codigoAfip)
  tipos: ContratoItem[]; // códigos AFIP por Tipo de Contrato
  obrasSociales: SimpleCatalogItem[]; // código RNOS
  sedes: InfoItem[]; // código de sucursal
  /** Empresas, para su obra social por defecto propia. Opcional: sin esto se cae directo a la global. */
  empresas?: Array<{ _id: string; obraSocialId?: number | null }>;
}

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

/** Valores AFIP resueltos de un contrato (crudos, para construir el registro del TXT). */
export interface AfipValues {
  cuil: string;
  fechaInicio: string; // tal cual está guardada (se normaliza al armar el TXT)
  fechaFin: string;
  retribucion: number; // sueldo bruto de la categoría
  categoriaProf: string; // código AFIP de la categoría
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
}

/** Resuelve los valores AFIP de un contrato contra los catálogos (sin validar). */
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
  const sede = row.sede_id != null ? cat.sedes.find((s) => Number(s.data?.id) === row.sede_id) : undefined;

  return {
    cuil: soloDigitos(row.cuit),
    fechaInicio: row.fecha_alta_contrato || "",
    fechaFin: row.fecha_baja_contrato || "",
    retribucion: categoria?.data?.sueldoBruto || 0,
    categoriaProf: categoria?.data?.codigoAfip ? String(categoria.data.codigoAfip) : "",
    modalidadContrato: tipo?.data?.afipModalidadContrato || "",
    tipoServicio: tipo?.data?.afipTipoServicio || "",
    actividad: tipo?.data?.afipActividad || "",
    modalidadLiq: tipo?.data?.afipModalidadLiquidacion || "",
    // El "ID Externo" de la Obra Social siempre fue el código RNOS (ver ObrasSocialesPage.tsx).
    rnos: soloDigitos(obraSocial?.externalId),
    rnosPorDefecto: !obraSocialPropia && !!obraSocial,
    rnosOrigen: obraSocialPropia ? "persona" : obraSocialEmpresa ? "empresa" : obraSocialGlobal ? "global" : "ninguno",
    sucursal: sede?.data?.codigoSucursal ? String(sede.data.codigoSucursal) : "",
  };
}

/** Resuelve y valida los datos AFIP de un contrato (fila del overview cross-proyecto). */
export function resolveAfip(row: ContractOverviewRow, cat: AfipCatalogs): AfipRowResult {
  const v = resolveAfipValues(row, cat);
  const checks: AfipFieldCheck[] = [
    { key: "cuil", label: "CUIL (11 díg.)", value: v.cuil, ok: v.cuil.length === 11 },
    { key: "fechaInicio", label: "Fecha de inicio", value: v.fechaInicio, ok: !!v.fechaInicio },
    { key: "retribucion", label: "Retribución (sueldo bruto de la categoría)", value: v.retribucion ? String(v.retribucion) : "", ok: v.retribucion > 0 },
    { key: "categoriaProf", label: "Categoría profesional (cód. AFIP)", value: v.categoriaProf, ok: !!v.categoriaProf },
    { key: "modalidadContrato", label: "Modalidad de contrato", value: v.modalidadContrato, ok: !!v.modalidadContrato },
    { key: "tipoServicio", label: "Tipo de servicio", value: v.tipoServicio, ok: !!v.tipoServicio },
    { key: "actividad", label: "Actividad del domicilio", value: v.actividad, ok: !!v.actividad },
    { key: "modalidadLiq", label: "Modalidad de liquidación", value: v.modalidadLiq, ok: !!v.modalidadLiq },
    { key: "rnos", label: v.rnosOrigen === "empresa" ? "Código RNOS (por defecto de la empresa)" : v.rnosOrigen === "global" ? "Código RNOS (por defecto global)" : "Código RNOS (obra social)", value: v.rnos, ok: !!v.rnos },
    { key: "sucursal", label: "Código de sucursal (sede)", value: v.sucursal, ok: !!v.sucursal },
  ];
  // No es un campo del registro AFIP (el TXT no lleva el CUIT de la empleadora), pero se exige igual:
  // un mismo TXT se sube a la sesión de UNA sola empresa en ARCA, así que hace falta saber a cuál
  // corresponde cada contrato antes de poder incluirlo.
  checks.push({ key: "empresa", label: "Empresa del Contrato", value: row.nombre_empresa_contrato || "", ok: !!row.empresaContratoId });

  const faltantes = checks.filter((c) => !c.ok).length;
  return { checks, faltantes, completo: faltantes === 0 };
}
