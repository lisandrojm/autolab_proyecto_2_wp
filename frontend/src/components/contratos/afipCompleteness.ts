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
  /**
   * Empleadoras, con lo que cada una tiene REGISTRADO ante ARCA. Los nomencladores son universales;
   * cada CUIT registra su subconjunto, y ARCA solo acepta altas dentro de él.
   */
  empresas?: Array<{
    _id: string;
    /** Obra social de los EXCLUIDOS DE CONVENIO (9999/99). No aplica al resto. */
    obraSocialDefaultId?: number | null;
    /** Excepciones por convenio: para ese CCT esta empleadora usa otra obra social que la sindical. */
    convenioObraSocialOverrides?: Array<{ convenioId: string; obraSocialId: number }>;
    /** @deprecated Nombre viejo de `obraSocialDefaultId`; se sigue leyendo durante la transición. */
    obraSocialId?: number | null;
    /** Obras sociales registradas para este CUIT (ids del catálogo). Vacío = todavía no se extrajo el padrón. */
    obrasSocialesIds?: string[];
    sucursalIds?: string[];
    convenioIds?: string[];
  }>;
  /** Catálogo de Sucursales de ARCA: de acá salen el código de sucursal y las actividades. */
  sucursales?: ArcaSucursal[];
  /**
   * Catálogo de Convenios: solo para traducir los `convenioIds` de la empresa (que son refs) al
   * código de CCT ("0131/75") con el que se compara el convenio de la categoría.
   */
  convenios?: Array<SimpleCatalogItem & { obraSocialDefaultId?: number | null }>;
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

/**
 * Código de CCT de "EXCLUIDO DE CONVENIO" en el nomenclador de ARCA.
 *
 * No es la ausencia de convenio: es un convenio más de la lista, con una sola categoría (999999).
 * Se nombra acá porque es el único caso donde la EMPLEADORA define la obra social — quien está
 * excluido no tiene sindicato, y por lo tanto no hay obra social sindical de la que heredar.
 */
export const CONVENIO_EXCLUIDO = "9999/99";

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
  rnosOrigen: "persona" | "override" | "convenio" | "empresa" | "global" | "ninguno";
  sucursal: string;
  /** Cómo se resolvió la actividad (o por qué no se pudo). */
  actividadOrigen: ActividadOrigen;
  /** Actividades declaradas para esa sucursal (para poder elegir en la UI). */
  actividadesDisponibles: ArcaSucursal["actividades"];
  /** Domicilio de la sucursal del contrato, para los mensajes del checklist. */
  nombreSucursal: string;
  /** Sucursales que el contrato puede elegir: las asignadas a su empresa empleadora. */
  sucursalesDisponibles: ArcaSucursal[];
  /** Código de CCT de la categoría del contrato ("" si la categoría no lo tiene cargado). */
  convenioCategoria: string;
  /** Códigos de CCT habilitados para la empleadora del contrato. */
  conveniosEmpresa: string[];
  /**
   * `true` si la obra social resuelta está entre las REGISTRADAS por la empleadora ante ARCA.
   * `null` cuando no se puede saber: la empleadora todavía no tiene el padrón extraído, o no hay
   * empresa ni obra social. No se asume que esté bien ni que esté mal.
   */
  obraSocialRegistrada: boolean | null;
}

/** Resuelve los valores ARCA de un contrato contra los catálogos (sin validar). */
export function resolveAfipValues(row: ContractOverviewRow, cat: AfipCatalogs): AfipValues {
  const categoria = row.categoria_sat_id != null ? cat.categorias.find((c) => c.data?.id === row.categoria_sat_id) : undefined;
  const tipo = cat.tipos.find((t) => t.name === row.nombre_contrato);
  const porDataId = (id?: number | null) => (id == null ? undefined : cat.obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const empresa = row.empresaContratoId ? cat.empresas?.find((e) => e._id === row.empresaContratoId) : undefined;

  // Convenio al que pertenece la categoría del contrato. Se resuelve ACÁ ARRIBA porque de él sale la
  // obra social, que es lo primero que se calcula.
  const convenioCategoria = String(categoria?.data?.convenio || "").trim();
  const convenioDeLaCategoria = convenioCategoria ? cat.convenios?.find((c) => String(c.externalId || "").trim() === convenioCategoria) : undefined;

  /**
   * Cascada de obra social, en cuatro pasos:
   *
   *   1. ¿La persona tiene obra social propia?           → esa
   *   2. ¿Su categoría pertenece a un convenio?          → la del convenio
   *        ├─ ¿la empresa lo pisó para ese convenio?     → el override de la empresa
   *        └─ si no                                       → la sindical del CCT
   *   3. ¿Está EXCLUIDA de convenio (9999/99)?           → la por defecto de la empresa
   *   4. Nada de lo anterior                              → la global, y falta configurar algo
   *
   * En la Argentina la obra social la define el sindicato y al sindicato lo define el CCT: por eso el
   * paso 2 es el que resuelve casi todo. La empleadora **corrige una excepción** ahí (el override),
   * pero **decide** solo en el paso 3 — quien está excluido de convenio no tiene sindicato.
   *
   * Ojo con el paso 4: un convenio SIN obra social cargada NO cae al default de la empresa. Cae a la
   * global y se avisa, porque es una configuración que falta, no un caso legítimo. Taparlo con el
   * default de la empresa haría que el alta salga con una obra social plausible pero equivocada.
   */
  const obraSocialPropia = porDataId(row.osId);
  const overrideEmpresa = convenioDeLaCategoria ? (empresa?.convenioObraSocialOverrides || []).find((o) => String(o.convenioId) === String(convenioDeLaCategoria._id)) : undefined;
  const obraSocialOverride = porDataId(overrideEmpresa?.obraSocialId);
  const obraSocialConvenio = porDataId(convenioDeLaCategoria?.obraSocialDefaultId);
  // `obraSocialDefaultId` es el nombre nuevo; se lee el viejo mientras queden documentos sin migrar.
  // Solo aplica a los excluidos de convenio: ver el paso 3.
  const esExcluidoDeConvenio = convenioCategoria === CONVENIO_EXCLUIDO;
  const obraSocialEmpresa = esExcluidoDeConvenio ? porDataId(empresa?.obraSocialDefaultId ?? empresa?.obraSocialId) : undefined;
  const obraSocialGlobal = cat.obrasSociales.find((o) => (o.data as { porDefecto?: boolean } | undefined)?.porDefecto);
  const obraSocial = obraSocialPropia || obraSocialOverride || obraSocialConvenio || obraSocialEmpresa || obraSocialGlobal;

  // Sucursal y actividad salen del catálogo de Sucursales de ARCA, filtrado por las que tiene
  // asignadas la empresa empleadora. Nada de esto cuelga de la Sede: son entidades distintas.
  const sucursalesEmpresa = (cat.sucursales || []).filter((s) => (empresa?.sucursalIds || []).map(String).includes(s._id));

  // Convenios habilitados para la empleadora, traducidos de refs a códigos de CCT. ARCA solo ofrece
  // las categorías de esos convenios (l_CatCCT viene filtrado por CCT), así que son el conjunto
  // válido contra el que se valida la categoría del contrato.
  const idsConvenio = (empresa?.convenioIds || []).map(String);
  const conveniosEmpresa = (cat.convenios || []).filter((c) => idsConvenio.includes(c._id)).map((c) => String(c.externalId || "").trim()).filter(Boolean);
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

  // La obra social del contrato tiene que estar REGISTRADA por la empleadora: ARCA solo ofrece las
  // que ese CUIT declaró en Datos del Empleador, y una de otra empresa se rechaza. Es la misma regla
  // que ya se aplica al convenio de la categoría y a la sucursal.
  // Sin `obrasSocialesIds` cargado no se valida: el padrón todavía no se extrajo para esa empleadora,
  // y marcar error ahí culparía al contrato de una configuración que le falta a la empresa.
  const registradas = empresa?.obrasSocialesIds || [];
  const obraSocialRegistrada = !obraSocial || registradas.length === 0 ? null : registradas.map(String).includes(String(obraSocial._id));

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
    convenioCategoria,
    conveniosEmpresa,
    obraSocialRegistrada,
    modalidadLiq: tipo?.data?.afipModalidadLiquidacion || "",
    // El "ID Externo" de la Obra Social siempre fue el código RNOS (ver ObrasSocialesPage.tsx).
    rnos: soloDigitos(obraSocial?.externalId),
    rnosPorDefecto: !obraSocialPropia && !!obraSocial,
    rnosOrigen: obraSocialPropia ? "persona" : obraSocialOverride ? "override" : obraSocialConvenio ? "convenio" : obraSocialEmpresa ? "empresa" : obraSocialGlobal ? "global" : "ninguno",
    sucursal: sucursal?.codigo ? String(sucursal.codigo) : "",
  };
}

/** Metadatos de cada origen: cómo se llama y a dónde se va a resolverlo. */
const ORIGENES: Record<OrigenDato, { titulo: string; accion: string; link?: { to: string; label: string } | { enFila: string } }> = {
  persona: { titulo: "Datos de la persona", accion: "Corregí el CUIT/CUIL en la ficha de la persona.", link: { to: "/users", label: "Ir a Usuarios" } },
  contrato: { titulo: "Fechas del contrato", accion: "Revisá las fechas de alta y baja del contrato.", link: { enFila: "Se edita en el contrato del miembro" } },
  tipo_contrato: { titulo: "Códigos ARCA del Tipo de Contrato", accion: "Cargá los códigos ARCA de este tipo de contrato (modalidad, tipo de servicio y modalidad de liquidación).", link: { to: "/contratos", label: "Ir a Contratos" } },
  // El sueldo bruto NO se carga en la categoría: vive en el grupo salarial del convenio, que es
  // adonde lleva el link. Decir "cargalo en la categoría" mandaba a buscar un campo que ya no existe.
  categoria_sat: { titulo: "Categoría", accion: "Revisá el código ARCA de la categoría y el sueldo bruto del grupo salarial de su convenio.", link: { to: "/arca/categorias", label: "Ir a Categorías" } },
  // La obra social la define el SINDICATO, y al sindicato lo define el convenio: por eso lo primero
  // que hay que revisar es la del CCT de la categoría, no la de la empresa. El catálogo es el
  // universo; lo que ARCA acepta es el subconjunto que ese CUIT registró.
  obra_social: { titulo: "Obra social", accion: "Cargá la obra social del convenio de la categoría (Configuración → ARCA → Convenios), o asignásela a la persona. Tiene que estar entre las registradas por la empleadora.", link: { to: "/convenios", label: "Ir a Convenios" } },
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

  // --- Categoría
  // La retribución sale de la ESCALA, que vive en el grupo salarial del convenio: la categoría solo
  // aporta el código. Nombrar el grupo evita mandar a buscar un campo de sueldo en la categoría.
  checks.push(v.retribucion <= 0 ? mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", "", "falta", "El grupo salarial de esta categoría no tiene cargado el sueldo bruto.") : !v.retribucionOk ? mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", String(v.retribucion), "error", "El importe no entra en las 15 posiciones del campo.") : mk("retribucion", "Retribución (sueldo bruto)", "categoria_sat", String(v.retribucion), "ok"));
  checks.push(presencia("categoriaProf", "Categoría profesional (cód. ARCA)", "categoria_sat", v.categoriaProf, "La categoría no tiene cargado su código de ARCA."));

  // Categoría ∈ convenios de la empresa. ARCA no tiene un catálogo global de categorías: el combo
  // `l_CatCCT` viene filtrado por convenio y solo ofrece los de los CCT que la empleadora tiene
  // habilitados. Una categoría de otro convenio es un dato MAL CARGADO — hoy pasa todos los
  // controles y llega mal, porque el convenio no viaja en el TXT (ARCA lo infiere de la categoría).
  //
  // El operador no elige el convenio: lo determina la categoría. Por eso esto es una validación y
  // no un selector.
  if (v.categoriaProf) {
    if (!hayEmpresa) {
      checks.push(mk("convenioCategoria", "Convenio de la categoría", "categoria_sat", v.convenioCategoria, "bloqueado", "Se valida contra los convenios habilitados para la empleadora.", "empresa"));
    } else if (!v.convenioCategoria) {
      // Sin convenio en la categoría no se puede validar. No se inventa: se pide cargarlo.
      checks.push(mk("convenioCategoria", "Convenio de la categoría", "categoria_sat", "", "falta", "La categoría no tiene cargado a qué convenio pertenece, así que no se puede verificar que sea elegible para esta empresa."));
    } else if (v.conveniosEmpresa.length === 0) {
      checks.push(mk("convenioCategoria", "Convenio de la categoría", "categoria_sat", v.convenioCategoria, "falta", "La empresa no tiene convenios registrados ante ARCA: cargáselos en su ficha, en ARCA → Convenios."));
    } else if (!v.conveniosEmpresa.includes(v.convenioCategoria)) {
      checks.push(mk("convenioCategoria", "Convenio de la categoría", "categoria_sat", v.convenioCategoria, "error", `La categoría pertenece al convenio ${v.convenioCategoria}, que no está habilitado para esta empresa (tiene ${v.conveniosEmpresa.join(", ")}). ARCA no la va a aceptar.`));
    } else {
      checks.push(mk("convenioCategoria", "Convenio de la categoría", "categoria_sat", v.convenioCategoria, "ok", "Habilitado para esta empresa."));
    }
  }

  // --- Tipo de Contrato: los tres códigos salen del mismo lugar, por eso comparten origen.
  checks.push(presencia("modalidadContrato", "Modalidad de contrato", "tipo_contrato", v.modalidadContrato, "El tipo de contrato no tiene cargado su código de modalidad."));
  checks.push(presencia("tipoServicio", "Tipo de servicio", "tipo_contrato", v.tipoServicio, "El tipo de contrato no tiene cargado su tipo de servicio."));
  checks.push(presencia("modalidadLiq", "Modalidad de liquidación", "tipo_contrato", v.modalidadLiq, "El tipo de contrato no tiene cargada su modalidad de liquidación."));

  // --- Obra social (cascada persona → convenio → empresa → global). Decir de DÓNDE salió no es un
  // detalle: si salió del convenio, corregirla es cambiar el convenio y afecta a todos sus contratos;
  // si salió de la empresa o de la global, es un respaldo y probablemente falte cargar el sindical.
  const etiquetaRnos = {
    persona: "Código RNOS (obra social de la persona)",
    override: "Código RNOS (excepción de la empresa para este convenio)",
    convenio: "Código RNOS (obra social del convenio)",
    empresa: "Código RNOS (excluido de convenio: la define la empresa)",
    global: "Código RNOS (último recurso: la global del catálogo)",
    ninguno: "Código RNOS (obra social)",
  }[v.rnosOrigen];
  checks.push(presencia("rnos", etiquetaRnos, "obra_social", v.rnos, "Ni la persona, ni el convenio de su categoría, ni el catálogo tienen una obra social definida."));

  // Caer en la GLOBAL no es un final feliz: significa que falta configurar algo aguas arriba. Con el
  // convenio cargado, el paso 2 tendría que haber resuelto. Se avisa sin bloquear —el alta se puede
  // generar— porque el RNOS que sale es plausible pero probablemente no sea el que corresponde.
  if (v.rnos && v.rnosOrigen === "global") {
    const detalle = v.convenioCategoria
      ? `Se está usando la obra social global porque el convenio ${v.convenioCategoria} no tiene ninguna cargada. La obra social la define el sindicato: asignásela al convenio en Configuración → ARCA → Convenios.`
      : "Se está usando la obra social global porque no se pudo resolver ninguna aguas arriba. Revisá que la categoría del contrato tenga convenio.";
    checks.push(mk("rnosGlobal", "Obra social sin resolver por convenio", "obra_social", v.rnos, "error", detalle));
  }

  // Obra social ∈ registradas por la empleadora. Mismo tipo de regla que el convenio de la categoría:
  // el nomenclador es universal, pero ARCA solo acepta las que ESE CUIT declaró en Datos del Empleador.
  // `null` = no se puede saber (falta el padrón de la empresa), y entonces no se dice nada: inventar
  // un "ok" ahí sería peor que no validar.
  if (v.rnos && v.obraSocialRegistrada === false) {
    // El origen cambia dónde está el error: si la obra social vino del CONVENIO, el dato del contrato
    // está bien y lo que está mal es la configuración —el convenio apunta a una obra social que esta
    // empleadora no tiene registrada—, y arreglarlo alcanza a todos los contratos de ese CCT.
    const detalle =
      v.rnosOrigen === "convenio"
        ? `El convenio ${v.convenioCategoria} tiene asignada esta obra social, pero la empleadora no la tiene registrada ante ARCA. Es un error de configuración y alcanza a TODOS los contratos de ese convenio: registrala en Empresa → ARCA → Obras Sociales, o poné una excepción para ese convenio en Empresa → ARCA → Convenios.`
        : v.rnosOrigen === "override"
          ? `La excepción que esta empleadora puso para el convenio ${v.convenioCategoria} apunta a una obra social que ella misma no tiene registrada ante ARCA. Corregila en Empresa → ARCA → Convenios, o registrá esa obra social.`
          : "Esta obra social no está entre las registradas para la empleadora del contrato. ARCA solo acepta las que el CUIT declaró en Datos del Empleador: cargala en Empresa → ARCA → Obras Sociales.";
    checks.push(mk("obraSocialRegistrada", "Obra social registrada en ARCA", "obra_social", v.rnos, "error", detalle));
  }

  // --- Sucursal y actividad. Toda esta rama depende de la empresa: sin ella no se sabe qué
  // sucursales son elegibles, así que se marca bloqueada en vez de faltante.
  if (!hayEmpresa) {
    checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", "", "bloqueado", "Las sucursales elegibles son las de la empresa empleadora.", "empresa"));
    checks.push(mk("actividad", "Actividad del domicilio", "sucursal", "", "bloqueado", "Las actividades son las declaradas para la sucursal.", "empresa"));
  } else {
    switch (v.actividadOrigen) {
      case "sin_sucursal":
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", "", "falta", v.sucursalesDisponibles.length === 0 ? "La empresa no tiene domicilios de explotación registrados: cargáselos en su ficha, en ARCA → Domicilios." : "Elegí el domicilio de desempeño en la columna «Sucursal»."));
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
  /**
   * A dónde manda el link del grupo.
   *
   * Los datos que ARCA lleva POR CUIT —convenios, domicilios y obras sociales registradas— dejaron de
   * vivir en un listado global: se configuran en la ficha de cada empleadora. Un link a
   * "Configuración → Empresas" deja al operador en una pantalla donde eso ya no se toca, así que
   * cuando el contrato tiene empleadora decidida el link apunta a la ficha de ESA empresa.
   *
   * Solo se redirige cuando el problema ES la configuración de la empleadora. Si el convenio existe
   * pero le falta la obra social, el lugar sigue siendo el nomenclador: ese dato es del CCT y lo
   * comparten todas las empresas.
   */
  const fichaArca = row.empresaContratoId ? `/empresas/${row.empresaContratoId}/arca` : null;
  const linkDelGrupo = (origen: OrigenDato): GrupoFaltante["link"] => {
    if (!fichaArca) return ORIGENES[origen].link;
    if (origen === "sucursal" && v.sucursalesDisponibles.length === 0) return { to: `${fichaArca}/domicilios`, label: "Ir a los domicilios de la empresa" };
    if (origen === "categoria_sat" && v.conveniosEmpresa.length === 0) return { to: `${fichaArca}/convenios`, label: "Ir a los convenios de la empresa" };
    if (origen === "obra_social" && v.obraSocialRegistrada === false) return { to: `${fichaArca}/obras-sociales`, label: "Ir a las obras sociales de la empresa" };
    return ORIGENES[origen].link;
  };

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
        link: linkDelGrupo(origen),
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
