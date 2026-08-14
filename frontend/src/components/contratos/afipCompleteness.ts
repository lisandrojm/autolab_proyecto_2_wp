import { ContractOverviewRow } from "../../api/users";
import { CategoriaSatItem } from "../../api/categoriasSat";
import { ContratoItem } from "../../api/contratos";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { InfoItem } from "../../api/info";
import { ArcaSucursal } from "../../api/arcaSucursales";
import { cuitEsValido } from "../../utils/cuit";
import { fechaAfip } from "./afipTxt";

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

/**
 * De dónde sale el dato. Es la clave del rediseño: el operador no arregla campos del TXT, arregla
 * ORÍGENES. Un tipo de contrato sin códigos ARCA se ve como tres faltantes distintos, pero es una
 * sola cosa que ir a cargar, en un solo lugar.
 */
export type OrigenDato = "persona" | "contrato" | "tipo_contrato" | "categoria_sat" | "obra_social" | "empresa" | "sucursal";

/**
 * Estado de un campo:
 *  - `ok`         resuelto.
 *  - `falta`      no está cargado y se puede cargar ya.
 *  - `error`      está cargado pero mal (inconsistente). Es MÁS grave que `falta`: hoy pasa
 *                 desapercibido y llega mal a ARCA.
 *  - `bloqueado`  no se puede resolver todavía porque depende de otro origen sin resolver. No se
 *                 cuenta como problema propio: contarlo es lo que inflaba el "Faltan 6".
 */
export type EstadoCheck = "ok" | "falta" | "error" | "bloqueado";

export interface AfipFieldCheck {
  key: string;
  label: string;
  /** Valor resuelto para mostrar; "" si falta. */
  value: string;
  estado: EstadoCheck;
  origen: OrigenDato;
  /** Qué origen hay que resolver antes (solo si `estado === "bloqueado"`). */
  dependeDe?: OrigenDato;
  /** Detalle del problema, para `falta` / `error` / `bloqueado`. */
  detalle?: string;
  /** Compatibilidad con el consumo previo (`!ok` = hay algo que hacer). */
  ok: boolean;
}

/** Un origen con problemas: es la unidad en la que se le habla al operador. */
export interface GrupoFaltante {
  origen: OrigenDato;
  titulo: string;
  /** Qué hay que hacer, en una línea. */
  accion: string;
  /** A dónde ir a resolverlo. `enFila` = se resuelve en la misma grilla, no hay a dónde navegar. */
  link?: { to: string; label: string } | { enFila: string };
  checks: AfipFieldCheck[];
  /** Si está bloqueado, por cuál otro origen. */
  bloqueadoPor?: OrigenDato;
  /** true si el grupo tiene al menos un `error` (dato cargado mal, no faltante). */
  tieneErrores: boolean;
}

export interface AfipRowResult {
  checks: AfipFieldCheck[];
  /** Campos con algo pendiente (incluye bloqueados). Se mantiene por compatibilidad. */
  faltantes: number;
  completo: boolean;
  /** Orígenes con problemas, que es lo que hay que ir a resolver. */
  grupos: GrupoFaltante[];
  /** Cuántas configuraciones hay que tocar AHORA (excluye las bloqueadas por otra). */
  configuracionesPendientes: number;
  /** Cuántos campos están cargados MAL (no faltantes). */
  errores: number;
}

/**
 * Modalidades de contratación a plazo determinado: exigen fecha de fin en el alta.
 * (021 tiempo parcial determinado · 022 tiempo completo determinado · 012 trabajo eventual)
 */
export const MODALIDADES_PLAZO_DETERMINADO = ["021", "022", "012"];

/**
 * Modalidades por tiempo indeterminado: la fecha de fin tiene que ir EN BLANCO.
 * (008 tiempo completo indeterminado · 001 tiempo parcial indeterminado)
 *
 * Las modalidades que no están en ninguna de las dos listas no se chequean: sin saber la regla,
 * inventarla sería peor que no validar.
 */
export const MODALIDADES_TIEMPO_INDETERMINADO = ["008", "001"];

/** Tope de la retribución: el campo son 15 posiciones y se manda × 100 (centavos implícitos). */
const RETRIBUCION_MAXIMA = 999999999999999 / 100;

const soloDigitos = (s?: string | number | null): string => String(s ?? "").replace(/\D/g, "");

/** Valores ARCA resueltos de un contrato (crudos, para construir el registro del TXT). */
export interface AfipValues {
  cuil: string;
  /** El CUIL pasa prefijo + dígito verificador, no solo "tiene 11 dígitos". */
  cuilValido: boolean;
  /** La retribución es > 0 y entra en las 15 posiciones del campo. */
  retribucionOk: boolean;
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

  const cuil = soloDigitos(row.cuit);
  const retribucion = categoria?.data?.sueldoBruto || 0;

  return {
    cuil,
    cuilValido: cuitEsValido(cuil),
    retribucionOk: retribucion > 0 && retribucion <= RETRIBUCION_MAXIMA,
    fechaInicio: row.fecha_alta_contrato || "",
    fechaFin: row.fecha_baja_contrato || "",
    retribucion,
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

/** Metadatos de cada origen: cómo se llama y a dónde se va a resolverlo. */
const ORIGENES: Record<OrigenDato, { titulo: string; accion: string; link?: { to: string; label: string } | { enFila: string } }> = {
  persona: { titulo: "Datos de la persona", accion: "Corregí el CUIT/CUIL en la ficha de la persona.", link: { to: "/users", label: "Ir a Usuarios" } },
  contrato: { titulo: "Fechas del contrato", accion: "Revisá las fechas de alta y baja del contrato.", link: { enFila: "Se edita en el contrato del miembro" } },
  tipo_contrato: { titulo: "Códigos ARCA del Tipo de Contrato", accion: "Cargá los códigos ARCA de este tipo de contrato (modalidad, tipo de servicio y modalidad de liquidación).", link: { to: "/contratos", label: "Ir a Contratos" } },
  categoria_sat: { titulo: "Categoría SAT", accion: "Cargá el código ARCA y el sueldo bruto de la categoría.", link: { to: "/categorias-sat", label: "Ir a Categorías SAT" } },
  obra_social: { titulo: "Obra social", accion: "Asignale una obra social a la persona, o definí una por defecto en la empresa o en el catálogo.", link: { to: "/obras-sociales", label: "Ir a Obras Sociales" } },
  empresa: { titulo: "Empresa del Contrato", accion: "Elegí con qué empleadora se da de alta a esta persona.", link: { enFila: "Se elige en la columna «Empresa Contrato»" } },
  sucursal: { titulo: "Sucursal y actividad", accion: "Elegí el domicilio de desempeño con el que se declara el alta.", link: { enFila: "Se elige en las columnas «Sucursal» y «Actividad»" } },
};

/** Orden de presentación: primero lo que desbloquea a lo demás. */
const ORDEN_ORIGENES: OrigenDato[] = ["empresa", "tipo_contrato", "categoria_sat", "sucursal", "obra_social", "persona", "contrato"];

/**
 * Resuelve y valida los datos ARCA de un contrato.
 *
 * Dos cosas lo distinguen de un checklist de presencia:
 *
 *  1. Distingue FALTA (no está cargado) de ERROR (está cargado pero es inconsistente). El segundo es
 *     más grave: hoy pasa desapercibido y llega mal a ARCA.
 *  2. Marca como BLOQUEADO lo que no se puede resolver todavía porque depende de otro origen. Antes
 *     esos campos se contaban como faltantes propios, y un contrato con 2 cosas para configurar
 *     decía "Faltan 6".
 */
export function resolveAfip(row: ContractOverviewRow, cat: AfipCatalogs): AfipRowResult {
  const v = resolveAfipValues(row, cat);
  const hayEmpresa = !!row.empresaContratoId;

  const mk = (key: string, label: string, origen: OrigenDato, value: string, estado: EstadoCheck, detalle?: string, dependeDe?: OrigenDato): AfipFieldCheck => ({
    key,
    label,
    origen,
    value,
    estado,
    detalle,
    dependeDe,
    ok: estado === "ok",
  });

  /** Presencia simple: está o falta. */
  const presencia = (key: string, label: string, origen: OrigenDato, value: string, detalle?: string): AfipFieldCheck => mk(key, label, origen, value, value ? "ok" : "falta", value ? undefined : detalle);

  const checks: AfipFieldCheck[] = [];

  // --- Empresa: no es un campo del registro, pero define en qué archivo cae la persona y desbloquea
  // la sucursal. Va primera porque es la que más cosas destraba.
  checks.push(mk("empresa", "Empresa del Contrato", "empresa", row.nombre_empresa_contrato || "", hayEmpresa ? "ok" : "falta", hayEmpresa ? undefined : "Un TXT se sube a la sesión de UNA sola empresa."));

  // --- Persona
  checks.push(v.cuil.length === 0 ? mk("cuil", "CUIL", "persona", "", "falta", "La persona no tiene CUIT/CUIL cargado.") : v.cuilValido ? mk("cuil", "CUIL", "persona", v.cuil, "ok") : mk("cuil", "CUIL", "persona", v.cuil, "error", "No es un CUIT/CUIL válido: no pasa el dígito verificador o el prefijo."));

  // --- Fechas del contrato
  const inicioParseable = !!fechaAfip(v.fechaInicio);
  checks.push(!v.fechaInicio ? mk("fechaInicio", "Fecha de inicio", "contrato", "", "falta", "El contrato no tiene fecha de alta.") : inicioParseable ? mk("fechaInicio", "Fecha de inicio", "contrato", v.fechaInicio, "ok") : mk("fechaInicio", "Fecha de inicio", "contrato", v.fechaInicio, "error", "Formato de fecha inesperado: no se puede convertir a AAAA/MM/DD."));

  // Fecha de fin: condicional según la modalidad. Es el único campo donde el vacío puede ser tanto
  // el valor correcto como un faltante, según qué modalidad tenga el tipo de contrato.
  const finParseable = !!fechaAfip(v.fechaFin);
  const exigeFin = MODALIDADES_PLAZO_DETERMINADO.includes(v.modalidadContrato);
  const prohibeFin = MODALIDADES_TIEMPO_INDETERMINADO.includes(v.modalidadContrato);
  if (!v.modalidadContrato) {
    checks.push(mk("fechaFin", "Fecha de fin", "contrato", v.fechaFin, "bloqueado", "Depende de la modalidad de contrato: recién con ella se sabe si corresponde.", "tipo_contrato"));
  } else if (v.fechaFin && !finParseable) {
    checks.push(mk("fechaFin", "Fecha de fin", "contrato", v.fechaFin, "error", "Formato de fecha inesperado: no se puede convertir a AAAA/MM/DD."));
  } else if (exigeFin && !v.fechaFin) {
    checks.push(mk("fechaFin", "Fecha de fin", "contrato", "", "falta", `La modalidad ${v.modalidadContrato} es a plazo determinado: ARCA exige fecha de fin.`));
  } else if (prohibeFin && v.fechaFin) {
    checks.push(mk("fechaFin", "Fecha de fin", "contrato", v.fechaFin, "error", `La modalidad ${v.modalidadContrato} es por tiempo indeterminado: la fecha de fin tiene que ir en blanco.`));
  } else {
    checks.push(mk("fechaFin", "Fecha de fin", "contrato", v.fechaFin || "(en blanco, correcto)", "ok"));
  }

  // --- Categoría SAT
  checks.push(v.retribucion <= 0 ? mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", "", "falta", "La categoría no tiene sueldo bruto cargado.") : !v.retribucionOk ? mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", String(v.retribucion), "error", "El importe no entra en las 15 posiciones del campo.") : mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", String(v.retribucion), "ok"));
  checks.push(presencia("categoriaProf", "Categoría profesional (cód. ARCA)", "categoria_sat", v.categoriaProf, "La categoría no tiene cargado su código de ARCA."));

  // --- Tipo de Contrato: los tres códigos salen del mismo lugar, por eso comparten origen.
  checks.push(presencia("modalidadContrato", "Modalidad de contrato", "tipo_contrato", v.modalidadContrato, "El tipo de contrato no tiene cargado su código de modalidad."));
  checks.push(presencia("tipoServicio", "Tipo de servicio", "tipo_contrato", v.tipoServicio, "El tipo de contrato no tiene cargado su tipo de servicio."));
  checks.push(presencia("modalidadLiq", "Modalidad de liquidación", "tipo_contrato", v.modalidadLiq, "El tipo de contrato no tiene cargada su modalidad de liquidación."));

  // --- Obra social (cascada persona → empresa → global)
  const etiquetaRnos = v.rnosOrigen === "empresa" ? "Código RNOS (por defecto de la empresa)" : v.rnosOrigen === "global" ? "Código RNOS (por defecto global)" : "Código RNOS (obra social)";
  checks.push(presencia("rnos", etiquetaRnos, "obra_social", v.rnos, "Ni la persona, ni su empresa, ni el catálogo tienen una obra social definida."));

  // --- Sucursal y actividad. Toda esta rama depende de la empresa: sin ella no se sabe qué
  // sucursales son elegibles, así que se marca bloqueada en vez de faltante.
  if (!hayEmpresa) {
    checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", "", "bloqueado", "Las sucursales elegibles son las de la empresa empleadora.", "empresa"));
    checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "bloqueado", "Las actividades son las declaradas para la sucursal.", "empresa"));
  } else {
    switch (v.actividadOrigen) {
      case "sin_sucursal":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", "", "falta", v.sucursalesDisponibles.length === 0 ? "La empresa no tiene sucursales asignadas: asignáselas en Configuración → Empresas." : "Elegí el domicilio de desempeño en la columna «Sucursal»."));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "bloqueado", "Las actividades son las declaradas para la sucursal.", "sucursal"));
        break;
      case "sucursal_invalida":
        // Cargado pero inconsistente: apunta a una sucursal que no es de esta empresa.
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, "error", "La sucursal del contrato no está asignada a su empresa empleadora (o se borró del catálogo)."));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "bloqueado", "Depende de una sucursal válida.", "sucursal"));
        break;
      case "sin_actividades":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, "ok"));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "falta", `La sucursal ${v.nombreSucursal} no tiene actividades cargadas: cargalas en ARCA → Sucursales.`));
        break;
      case "ambigua":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, "ok"));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "falta", `${v.nombreSucursal} tiene ${v.actividadesDisponibles.length} actividades declaradas: elegí con cuál se declara este contrato.`));
        break;
      case "unica":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, "ok"));
        // Una sola actividad declarada: se resuelve sola, no se le pide nada al operador.
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", v.actividad, "ok", "Única actividad declarada para esta sucursal."));
        break;
      case "elegida":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, "ok"));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", v.actividad, "ok", "Elegida en el contrato."));
        break;
      default:
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", v.sucursal, v.sucursal ? "ok" : "falta"));
        checks.push(mk("actividad", "Actividad del domicilio", "sucursal", v.actividad, v.actividad ? "ok" : "falta"));
    }
  }

  // --- Agrupado por origen: es lo que el operador tiene que ir a resolver.
  const conProblema = checks.filter((c) => c.estado !== "ok");
  const grupos: GrupoFaltante[] = ORDEN_ORIGENES.flatMap((origen) => {
    const propios = conProblema.filter((c) => c.origen === origen);
    if (propios.length === 0) return [];
    // Un grupo está bloqueado solo si TODOS sus campos lo están: si hay algo accionable, es accionable.
    const bloqueados = propios.filter((c) => c.estado === "bloqueado");
    const bloqueadoPor = bloqueados.length === propios.length ? bloqueados[0]?.dependeDe : undefined;
    return [
      {
        origen,
        titulo: ORIGENES[origen].titulo,
        accion: ORIGENES[origen].accion,
        link: ORIGENES[origen].link,
        checks: propios,
        bloqueadoPor,
        tieneErrores: propios.some((c) => c.estado === "error"),
      },
    ];
  });

  return {
    checks,
    faltantes: conProblema.length,
    completo: conProblema.length === 0,
    grupos,
    // Lo que se puede hacer AHORA: los grupos bloqueados no suman, porque se resuelven solos al
    // destrabar el origen del que dependen.
    configuracionesPendientes: grupos.filter((g) => !g.bloqueadoPor).length,
    errores: checks.filter((c) => c.estado === "error").length,
  };
}
