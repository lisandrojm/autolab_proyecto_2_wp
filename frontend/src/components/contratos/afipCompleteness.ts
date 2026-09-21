import { ContractOverviewRow } from "../../api/users";
import { CategoriaSatItem } from "../../api/categoriasSat";
import { ContratoItem } from "../../api/contratos";
import { SimpleCatalogItem } from "../../api/simpleCatalog";
import { InfoItem } from "../../api/info";
import { conCascada, DefaultsArca, OrigenValorArca } from "./cascadaArca";
import { ArcaSucursal } from "../../api/arcaSucursales";
import { cuitEsValido } from "../../utils/cuit";
import { fechaAfip, finNoPosteriorAlInicio } from "./afipTxt";
import { estadoGeneraAltaTemprana } from "./altaTemprana";
import { claveEstado } from "../../utils/estadoClave";

/**
 * Chequeo de completitud de datos para la generación del TXT de Alta masiva de ARCA.
 * Resuelve cada campo requerido contra los catálogos y marca si está presente o falta.
 * Reutilizable por la vista de completitud (Fase 1b) y por el generador del TXT (Fase 2).
 */
/**
 * ¿Este contrato genera alta temprana? DEL ESTADO, no de un switch.
 *
 * El estado impositivo del contrato es la única fuente de verdad: es el mismo que decide en qué
 * bandeja aparece y qué carpeta de Dropbox lo hace avanzar. El switch del tipo de contrato podía
 * contradecirlo y se eliminó.
 *
 * Sin `estados` en el catálogo se lee el booleano viejo del tipo: mientras alguna pantalla no los
 * pase, es preferible el valor de antes a decidir que ningún contrato declara.
 */
const generaAltaDeLaFila = (row: ContractOverviewRow, cat: AfipCatalogs, tipo?: ContratoItem): boolean => {
  if (cat.estados?.length) {
    const estado = cat.estados.find((e) => claveEstado(e.name) === claveEstado(row.nombre_estado_empleado || ""));
    if (estado) return estadoGeneraAltaTemprana(estado);
  }
  return tipo?.data?.generaAlta !== false;
};

export interface AfipCatalogs {
  categorias: CategoriaSatItem[]; // retribución (sueldoBruto) + categoría profesional (codigoAfip)
  tipos: ContratoItem[]; // códigos ARCA por Tipo de Contrato
  obrasSociales: SimpleCatalogItem[]; // código RNOS
  sedes: InfoItem[]; // catálogo de Sedes (lugar de trabajo; NO tiene relación con ARCA)
  /**
   * Los Estados, para derivar si el contrato genera alta temprana.
   *
   * OPCIONAL a propósito: sin ellos se cae al booleano persistido del tipo de contrato, que es lo
   * que había antes de que el estado impositivo fuera la única fuente. Es una red de contención de
   * la transición, no un segundo criterio — la expresión sigue siendo una sola (`altaTemprana.ts`).
   */
  estados?: InfoItem[];
  /**
   * Empleadoras, con lo que cada una tiene REGISTRADO ante ARCA. Los nomencladores son universales;
   * cada CUIT registra su subconjunto, y ARCA solo acepta altas dentro de él.
   */
  empresas?: Array<{
    _id: string;
    /** Obra social de los EXCLUIDOS DE CONVENIO (9999/99). No aplica al resto. */
    obraSocialDefaultId?: number | null;
    /** Excepciones por convenio: para ese CCT esta empleadora usa otra obra social que la sindical. */
    /** @deprecated Nombre viejo de `obraSocialDefaultId`; se sigue leyendo durante la transición. */
    obraSocialId?: number | null;
    /** Obras sociales registradas para este CUIT (ids del catálogo). Vacío = todavía no se extrajo el padrón. */
    obrasSocialesIds?: string[];
    sucursalIds?: string[];
    /** Qué actividades declaró ESTA empleadora en cada domicilio. Ver `Company.sucursalActividades`. */
    sucursalActividades?: Array<{ sucursalId: string; actividades: Array<{ codigo: string; descripcion?: string }> }>;
    convenioIds?: string[];
    /**
     * La elección habitual de esta empleadora dentro del nomenclador (ARCA → Defaults).
     *
     * Es el valor de ARRANQUE, no una regla: si el Tipo de Contrato trae su propio código, manda el
     * del contrato. Solo entra cuando el tipo de contrato no lo tiene cargado, que hoy deja el campo
     * vacío y bloquea el TXT.
     */
    defaultsArca?: DefaultsArca;
  }>;
  /**
   * Los valores por defecto de la INSTALACIÓN (Configuración → ARCA, la ★ de cada nomenclador).
   *
   * Es el último escalón de la cascada: rige cuando ni el contrato ni la empleadora dijeron nada.
   * Opcional a propósito — sin él la resolución es la de antes, contrato → empresa, así que ninguna
   * pantalla que todavía no lo pase cambia de comportamiento.
   */
  defaultsArcaGlobales?: DefaultsArca;
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
 *  - `aviso`      el dato ESTÁ y el alta se puede generar, pero hay algo que conviene mirar. No
 *                 bloquea ni cuenta como pendiente: es el caso de una obra social heredada de la
 *                 ficha de la persona, que puede estar vencida pero es mejor que nada.
 */
export type EstadoCheck = "ok" | "falta" | "error" | "bloqueado" | "aviso";

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
  /**
   * El campo NO CORRESPONDE para este contrato, y por eso no entra en la cuenta de avance.
   *
   * Hoy lo usa solo Fecha de Fin: con una modalidad por tiempo indeterminado el registro la exige en
   * blanco, así que el chequeo da «ok» —está bien vacía— pero contarla como un campo resuelto infla
   * el denominador con algo que nunca hubo que completar. «5 de 5» y «4 de 4» dicen cosas distintas
   * y las dos son correctas según la modalidad; «5 de 5» cuando uno de los cinco no aplicaba, no.
   *
   * No es lo mismo que `bloqueado`: bloqueado es «todavía no», esto es «acá no va».
   */
  noAplica?: boolean;
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
  /** true si NO es configuración de ARCA sino un selector de la propia fila (ver `ORIGENES_EN_FILA`). */
  enFila: boolean;
}

/**
 * Orígenes que no son configuración de ARCA: son opciones que ya están en pantalla y solo hay que
 * ELEGIR. La empresa, en su columna de la grilla; la sucursal y su actividad, en este mismo
 * formulario de Datos ARCA (tenían columna propia y se sacaron: la grilla no daba abasto y el lugar
 * natural de esos dos códigos es el checklist del alta).
 *
 * Se separan del conteo por eso mismo. "Faltan 2" en la columna ARCA, con una de las dos siendo la
 * empresa que la columna de al lado ya está pidiendo en ámbar, cuenta el mismo pendiente dos veces y
 * manda a configurar algo que no hay que ir a configurar a ningún lado. Siguen frenando el TXT —
 * `completo` los sigue exigiendo—, pero no se cuentan como configuración pendiente.
 */
export const ORIGENES_EN_FILA: OrigenDato[] = ["empresa", "sucursal"];

export interface AfipRowResult {
  checks: AfipFieldCheck[];
  /** Campos con algo pendiente (incluye bloqueados). Se mantiene por compatibilidad. */
  faltantes: number;
  completo: boolean;
  /** Orígenes con problemas, que es lo que hay que ir a resolver. */
  grupos: GrupoFaltante[];
  /**
   * Cuántas CONFIGURACIONES de ARCA hay que tocar AHORA. Excluye las bloqueadas por otro origen
   * (se destraban solas) y las que se eligen en la propia fila (ver `ORIGENES_EN_FILA`).
   */
  configuracionesPendientes: number;
  /** Cuántos selectores de la propia fila están sin elegir (empresa, sucursal/actividad). */
  pendientesEnFila: number;
  /** Cuántos campos están cargados MAL (no faltantes). */
  errores: number;
  /** Cuántos avisos hay: no bloquean el alta, pero conviene mirarlos. */
  avisos: number;
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
export const MODALIDADES_TIEMPO_INDETERMINADO = ["008", "001", "065"];

/**
 * LAS ONCE MODALIDADES QUE UNA PRODUCTORA USA, de las 153 del nomenclador.
 *
 * El catálogo entero es una trampa en un desplegable: varias entradas son de leyes derogadas y otras
 * de regímenes que no son de una productora. Ofrecerlas todas no es neutral — es poner al lado de la
 * opción correcta una docena que declaran mal.
 *
 * LO QUE QUEDA AFUERA, Y POR QUÉ:
 *
 *   000, 004, 005, 006 · modalidades promovidas y de fomento de las leyes 24.013 y 24.465. Derogadas.
 *   003, 007           · aprendizaje (ley 25.013) y período de prueba (24.465/25.013): las leyes que
 *                        las crearon ya no rigen.
 *   102                · «Empleado Servicio Eventual en Usuaria DTO 762» es la modalidad de una
 *                        EMPRESA DE SERVICIOS EVENTUALES que cede personal a una usuaria. Una
 *                        productora que contrata directo usa 012. Es la confusión más fácil de esta
 *                        lista y la más cara: se elige por el nombre y declara otra relación.
 *   3xx, 6xx           · regímenes con reducción de contribuciones (art. 19 y 24 ley 26.940, dcto.
 *                        551/22 y 1085/24). Si alguna aplica es una decisión contable, no del catálogo.
 *
 * No es un candado del modelo: el campo acepta cualquier código y lo ya cargado se sigue mostrando.
 * Es qué se OFRECE.
 */
export const MODALIDADES_OFRECIDAS = ["012", "022", "021", "008", "001", "065", "011", "061", "062", "027", "010"];

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
  /** `false` = el tipo de contrato no genera alta temprana. */
  generaAlta: boolean;
  modalidadContrato: string;
  /** De dónde salió la modalidad de contrato. Ver `cascadaArca.ts`. */
  modalidadContratoOrigen: OrigenValorArca;
  tipoServicio: string;
  /**
   * De dónde salió el tipo de servicio: del tipo de contrato, del default de la empleadora, del de la
   * instalación, o de ningún lado.
   *
   * NO es cosmético: el checklist manda a corregir a un lugar distinto según el origen, y culpar al
   * tipo de contrato por un valor que puso un default manda a editar lo que no está mal.
   */
  tipoServicioOrigen: OrigenValorArca;
  actividad: string;
  modalidadLiq: string;
  /** De dónde salió la modalidad de liquidación. Ver `cascadaArca.ts`. */
  modalidadLiqOrigen: OrigenValorArca;
  rnos: string;
  /** El RNOS no es de la persona: se heredó del convenio o de la empleadora. */
  rnosPorDefecto: boolean;
  /**
   * De dónde salió el RNOS. `ninguno` = no se pudo resolver y el campo FALTA (ya no hay una obra
   * social global que lo rellene: ver la cascada en `resolveAfipValues`).
   */
  rnosOrigen: "constatada" | "manual" | "heredada-usuario" | "override" | "convenio" | "empresa" | "ninguno";
  /** Nombre del Agente del Seguro. El RNOS solo no le dice nada a nadie: se muestran los dos. */
  nombreObraSocial: string;
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
  /**
   * Estado de la constatación en ARCA (Relaciones Laborales → Registrar Nuevas Altas). Son TRES:
   *  - `afiliada`     se consultó y ARCA devolvió esta obra social. Queda fija.
   *  - `no_figura`    se consultó y ARCA no devolvió ninguna: rige la del convenio. Es una RESPUESTA.
   *  - `sin_constatar` nadie consultó: el valor que se muestra es una suposición.
   */
  constatacion: "afiliada" | "no_figura" | "sin_constatar";
  /** Cuándo se constató ("" si no se constató). */
  constatadaEl: string;
  /**
   * Lo que la cascada resolvería si ARCA no devuelve una obra social propia.
   *
   * Se expone aparte de `rnos` porque antes de validar NO es el valor del contrato: es una
   * referencia para decir "esto es lo que va a quedar". `rnos` está vacío hasta que se valida.
   */
  rnosSugerido: string;
  nombreObraSocialSugerida: string;
}

/**
 * EL TIPO DE CONTRATO NO SE ENCUENTRA POR IGUALDAD DE NOMBRE, y por eso los tres códigos de ARCA
 * salían vacíos aunque estuvieran cargados.
 *
 * `contracts.nombre_contrato` viene de FRAME con el sufijo de la empleadora pegado —«Jornada 2030
 * SRL», «Servicios - FZERO SRL»— mientras que el catálogo local guarda el tipo canónico («Jornada»,
 * «Servicios»). Medido sobre los 6.780 contratos: la comparación exacta acertaba en 100, y
 * `tipo_contrato_id` —un id de FRAME que acá no resuelve— en 19. Por eso el modal decía «del tipo de
 * contrato X» y a la vez «Falta»: encontraba el nombre en el contrato y no el tipo en el catálogo.
 *
 * QUÉ SE PERMITE Y QUÉ NO. Se normaliza (espacios, mayúsculas, acentos) y se saca un sufijo de
 * empleadora, que es un patrón enumerable —« 2030 SRL», « - FZERO SRL»— y no una semejanza. Lo que
 * NO se hace es elegir por parecido: «Eventual Talento» a secas no se resuelve contra ninguno de los
 * cuatro «Eventual Talento …», y queda sin tipo. Adivinar ahí escribiría en el TXT la modalidad de
 * un contrato que nadie eligió, que es peor que declarar que falta.
 */
const NORMALIZAR = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/**
 * Lo que puede sobrar al final: la razón social de la empleadora.
 *
 * Se exige que TERMINE en una forma societaria («SRL», «S.R.L.», «SA») y que sea corta. No alcanza
 * con «algo al final»: sin ese ancla, «Plazo fijo 5x10 2030 SRL + Release JSA FZERO» —que no
 * corresponde a ningún tipo cargado— se recortaría hasta parecerse a uno.
 */
const SOBRA_EMPLEADORA = /^\s*[-–]?\s*[^-–]{0,40}\b(?:S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?)\s*$/i;

/**
 * EL CATÁLOGO ES LA AUTORIDAD, no un regex sobre nombres de empresa.
 *
 * En vez de adivinar dónde termina el tipo y empieza la empleadora, se busca qué tipo del catálogo
 * es PREFIJO del nombre del contrato y se toma el más largo. Así «Plazo fijo 5x7 part-time 2030 SRL»
 * cae en «Plazo fijo 5x7 part-time» y no en «Plazo fijo 5x7», que es el error que un recorte a ciegas
 * comete y que además no se nota: los dos son tipos válidos y el TXT saldría con la modalidad del
 * equivocado.
 */
export const buscarTipoContrato = <T extends { name: string }>(tipos: T[], nombreContrato?: string | null): T | undefined => {
  const buscado = NORMALIZAR(nombreContrato || "");
  if (!buscado) return undefined;

  const exacto = tipos.find((t) => NORMALIZAR(t.name) === buscado);
  if (exacto) return exacto;

  let mejor: T | undefined;
  let largo = -1;
  for (const t of tipos) {
    const n = NORMALIZAR(t.name);
    if (!n || !buscado.startsWith(n) || n.length <= largo) continue;
    // Lo que sobra tiene que parecer una razón social; si no, no es el mismo tipo con sufijo.
    if (!SOBRA_EMPLEADORA.test(String(nombreContrato).slice(String(nombreContrato).length - (buscado.length - n.length)))) continue;
    mejor = t;
    largo = n.length;
  }
  return mejor;
};

/** Resuelve los valores ARCA de un contrato contra los catálogos (sin validar). */
export function resolveAfipValues(row: ContractOverviewRow, cat: AfipCatalogs): AfipValues {
  const categoria = row.categoria_sat_id != null ? cat.categorias.find((c) => c.data?.id === row.categoria_sat_id) : undefined;
  const tipo = buscarTipoContrato(cat.tipos, row.nombre_contrato);
  const porDataId = (id?: number | null) => (id == null ? undefined : cat.obrasSociales.find((o) => Number((o.data as { id?: number } | undefined)?.id) === id));
  const empresa = row.empresaContratoId ? cat.empresas?.find((e) => e._id === row.empresaContratoId) : undefined;

  // Convenio al que pertenece la categoría del contrato. Se resuelve ACÁ ARRIBA porque de él sale la
  // obra social, que es lo primero que se calcula.
  const convenioCategoria = String(categoria?.data?.convenio || "").trim();
  const convenioDeLaCategoria = convenioCategoria ? cat.convenios?.find((c) => String(c.externalId || "").trim() === convenioCategoria) : undefined;

  /**
   * Cascada de obra social, en TRES pasos. Si ninguno resuelve, el campo FALTA.
   *
   *   1. ¿El CONTRATO tiene una fijada?                  → esa (constatada en ARCA, o manual)
   *   2. ¿Su categoría pertenece a un convenio?          → la del convenio
   *        ├─ ¿la empresa lo pisó para ese convenio?     → el override de la empresa
   *        └─ si no                                       → la sindical del CCT
   *   3. ¿Está EXCLUIDA de convenio (9999/99)?           → la de la empleadora
   *   ─  Nada de lo anterior                              → FALTA: no se genera el TXT
   *
   * El paso 1 GANA SIEMPRE: si ARCA dice que esa persona está en 901402, no importa qué diga el
   * convenio. Y es del CONTRATO, no de la persona: ARCA declara el RNOS en cada alta (pos. 40-45),
   * dos contratos de la misma persona en dos empleadoras llevan cada uno el suyo, y el dato caduca
   * solo —por desregulación alguien cambia de obra social sin que su empleadora se entere—.
   *
   * En la Argentina la obra social la define el sindicato y al sindicato lo define el CCT: por eso el
   * paso 2 es el que resuelve casi todo. La empleadora **corrige una excepción** ahí (el override),
   * pero **decide** solo en el paso 3 — quien está excluido de convenio no tiene sindicato.
   *
   * HABÍA un cuarto paso, una obra social "global" del catálogo, y se eliminó. Solo entraba cuando
   * faltaba configurar algo aguas arriba —típicamente el convenio sin obra social—, así que lo único
   * que hacía era rellenar el campo con un valor sin fundamento. ARCA lo acepta igual: el alta sale
   * con la obra social equivocada y el error se descubre cuando ya está presentado. Es preferible que
   * el checklist lo marque como faltante y no se genere el TXT.
   */
  const obraSocialPropia = porDataId(row.osId);
  const obraSocialConvenio = porDataId(convenioDeLaCategoria?.obraSocialDefaultId);
  // `obraSocialDefaultId` es el nombre nuevo; se lee el viejo mientras queden documentos sin migrar.
  // Solo aplica a los excluidos de convenio: ver el paso 3.
  const esExcluidoDeConvenio = convenioCategoria === CONVENIO_EXCLUIDO;
  const obraSocialEmpresa = esExcluidoDeConvenio ? porDataId(empresa?.obraSocialDefaultId ?? empresa?.obraSocialId) : undefined;
  /*
    Sin escalón de «excepción por empresa»: la obra social la define el SINDICATO del convenio y vale
    para todas las empleadoras que lo tengan registrado. Ese escalón permitía declarar otra obra
    social para una empresa sin que nada lo frenara, y no había ninguna cargada.
  */
  const obraSocial = obraSocialPropia || obraSocialConvenio || obraSocialEmpresa;

  // Sucursal y actividad salen del catálogo de Sucursales de ARCA, filtrado por las que tiene
  // asignadas la empresa empleadora. Nada de esto cuelga de la Sede: son entidades distintas.
  const sucursalesEmpresa = (cat.sucursales || []).filter((s) => (empresa?.sucursalIds || []).map(String).includes(s._id));

  // Convenios habilitados para la empleadora, traducidos de refs a códigos de CCT. ARCA solo ofrece
  // las categorías de esos convenios (l_CatCCT viene filtrado por CCT), así que son el conjunto
  // válido contra el que se valida la categoría del contrato.
  const idsConvenio = (empresa?.convenioIds || []).map(String);
  const conveniosEmpresa = (cat.convenios || []).filter((c) => idsConvenio.includes(c._id)).map((c) => String(c.externalId || "").trim()).filter(Boolean);
  /*
    EL DOMICILIO HABITUAL DE LA EMPLEADORA SE PRESELECCIONA, igual que el Tipo de Servicio.

    Si el contrato no eligió sucursal y la empleadora dejó una marcada con ★, rige esa. Es exactamente
    el mecanismo que ya usaban `tipoServicio` y `modalidadLiquidacion` unas líneas más abajo: el
    default se RESUELVE al leer, no se escribe en el contrato.

    Esa diferencia importa. Escribirlo dejaría en la base un domicilio que nadie eligió, indistinguible
    de uno decidido a mano; resolviéndolo al leer, el contrato sigue diciendo la verdad —«no eligió»—
    y la pantalla, el checklist y el TXT ven el mismo valor porque los tres salen de acá.

    Elegir otro en el picker escribe y pisa el default, que es lo esperado: la preselección acelera el
    caso normal sin cerrar ninguno.
  */
  /*
    El default se busca en DOS escalones: la ★ de la empleadora y, si no tiene, la de la instalación.

    El global se descarta si esta empleadora no tiene ese domicilio declarado: el código de domicilio
    es POR CUIT, así que uno global puede no existir para este CUIT y ARCA rechazaría el alta. Mejor
    sin domicilio —que el checklist marca como faltante— que con uno que el organismo no reconoce.
  */
  const globalSucursal = cat.defaultsArcaGlobales?.sucursalId;
  const globalSucursalAplica = !!globalSucursal && sucursalesEmpresa.some((s) => s._id === String(globalSucursal));
  const sucursalResuelta = conCascada(row.sucursalArcaId, "contrato", "sucursalId", empresa?.defaultsArca, globalSucursalAplica ? cat.defaultsArcaGlobales : undefined);
  const sucursalId = sucursalResuelta.valor;
  const sucursal = sucursalId ? sucursalesEmpresa.find((s) => s._id === String(sucursalId)) : undefined;
  /*
    LAS ACTIVIDADES SON DE LA EMPLEADORA, NO DEL DOMICILIO.

    ARCA las declara POR CUIT: dos empleadoras en el mismo domicilio pueden tener declaradas
    distintas, y el organismo rechaza un alta con una que ESE CUIT no declaró ahí, aunque otra
    empresa sí la tenga. Por eso el domicilio quedó como un ABM de la dirección y su código, y las
    actividades viven en `Company.sucursalActividades`.

    SIN FILA PARA ESE DOMICILIO NO HAY NINGUNA. No se hereda del domicilio: una vez que la
    declaración es de la empresa, no existe una lista de la cual heredar. El checklist lo dice con
    `sin_actividades`, que es lo correcto — un alta ahí la rechaza ARCA.
  */
  const declaradas =
    (empresa as { sucursalActividades?: Array<{ sucursalId: string; actividades: Array<{ codigo: string; descripcion?: string }> }> } | undefined)?.sucursalActividades?.find(
      (x) => String(x.sucursalId) === String(sucursalId),
    )?.actividades || [];
  const actividades = declaradas.filter((a) => !!a.codigo);

  const elegida = row.actividadArca ? actividades.find((a) => a.codigo === row.actividadArca) : undefined;

  let actividad = "";
  let actividadOrigen: ActividadOrigen;
  if (!row.empresaContratoId) {
    actividadOrigen = "sin_empresa";
  } else if (!sucursalId) {
    /*
      POR EL ID YA RESUELTO, NO POR `row.sucursalArcaId`.

      Preguntar por el campo del contrato deshacía justo arriba el default de la empleadora: con la ★
      puesta, `sucursalId` resolvía bien y `actividades` salía cargada, pero esta rama cortaba en
      «sin_sucursal» y la actividad quedaba vacía. En pantalla se veía el domicilio completo y la
      actividad en blanco, y la única forma de destrabarlo era volver a elegir a mano la misma
      sucursal que ya estaba puesta —que es exactamente lo que escribe `row.sucursalArcaId`.

      La regla del bloque de arriba vale para toda la cadena: el default se RESUELVE al leer, así que
      todo lo que cuelga del domicilio tiene que mirar el valor resuelto y no el escrito.
    */
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

  /**
   * Hasta que no se valida contra ARCA, el contrato NO TIENE obra social.
   *
   * La cascada (convenio → excepción de la empleadora → excluidos) sigue calculándose, pero su
   * resultado queda en `rnosSugerido`: es lo que VA A quedar si ARCA no devuelve una propia, no lo
   * que hay. Mostrarlo como valor antes de validar hacía creer que estaba confirmado, y el número
   * que termina en el archivo salía de una suposición nuestra en vez del organismo.
   *
   * Consecuencia asumida: sin validar, las posiciones 40-45 quedan sin dato y el TXT de esa persona
   * no se puede generar. Validar deja de ser una mejora y pasa a ser un paso del alta.
   */
  const constatacion: "afiliada" | "no_figura" | "sin_constatar" = row.obraSocialNoFigura ? "no_figura" : row.obraSocialOrigen === "constatada" ? "afiliada" : "sin_constatar";
  const validada = constatacion !== "sin_constatar";
  const rnosCascada = soloDigitos(obraSocial?.externalId);

  /*
    LOS TRES CAMPOS QUE HEREDAN, resueltos con la misma cascada: contrato → empresa → instalación.

    `modalidadLiquidacion` y `modalidadContratacion` no heredaban nada hasta acá: miraban solo el
    tipo de contrato. El default de la empleadora existía —la ficha lo dejaba cargar— y no lo leía
    nadie, así que era un campo que aparentaba hacer algo. Ahora los tres se resuelven igual.

    El tipo de contrato entra como `tipo_contrato` y no como `contrato` porque no lo eligió nadie en
    esta alta: viene de la plantilla. La pantalla ya hacía esa distinción para el tipo de servicio.
  */
  const defaultsEmpresa = empresa?.defaultsArca as DefaultsArca | undefined;
  const defaultsGlobales = cat.defaultsArcaGlobales;
  const tipoServicioResuelto = conCascada(tipo?.data?.afipTipoServicio, "tipo_contrato", "tipoServicio", defaultsEmpresa, defaultsGlobales);
  const modalidadContratoResuelta = conCascada(tipo?.data?.afipModalidadContrato, "tipo_contrato", "modalidadContratacion", defaultsEmpresa, defaultsGlobales);
  const modalidadLiqResuelta = conCascada(tipo?.data?.afipModalidadLiquidacion, "tipo_contrato", "modalidadLiquidacion", defaultsEmpresa, defaultsGlobales);

  return {
    cuil,
    cuilValido: cuitEsValido(cuil),
    retribucionOk: retribucion > 0 && retribucion <= RETRIBUCION_MAXIMA,
    fechaInicio: row.fecha_alta_contrato || "",
    fechaFin: row.fecha_baja_contrato || "",
    retribucion,
    categoriaProf: categoria?.data?.codigoAfip ? String(categoria.data.codigoAfip) : "",
    /**
     * `false` = este tipo de contrato NO se declara ante ARCA (locación de servicios).
     *
     * Se resuelve acá, junto al resto, para que la pantalla, el checklist y el TXT vean lo mismo.
     * Sin tipo resuelto NO se asume `false`: no saber si declara es distinto de saber que no.
     */
    generaAlta: generaAltaDeLaFila(row, cat, tipo),
    modalidadContrato: modalidadContratoResuelta.valor,
    modalidadContratoOrigen: modalidadContratoResuelta.origen,
    // El default de la empleadora entra DESPUÉS del tipo de contrato, nunca antes: es lo que dice
    // la pantalla de Defaults y es la regla que hace que el default sea seguro de poner.
    tipoServicio: tipoServicioResuelto.valor,
    tipoServicioOrigen: tipoServicioResuelto.origen,
    actividad,
    actividadOrigen,
    actividadesDisponibles: actividades,
    nombreSucursal: sucursal ? `${sucursal.codigo} — ${sucursal.domicilio}` : "",
    sucursalesDisponibles: sucursalesEmpresa,
    convenioCategoria,
    conveniosEmpresa,
    obraSocialRegistrada,
    modalidadLiq: modalidadLiqResuelta.valor,
    modalidadLiqOrigen: modalidadLiqResuelta.origen,
    // El "ID Externo" de la Obra Social siempre fue el código RNOS (ver ObrasSocialesPage.tsx).
    // Vacío mientras no esté validada: ver el comentario de `rnosSugerido`.
    rnos: validada ? rnosCascada : "",
    nombreObraSocial: validada ? obraSocial?.name || "" : "",
    /** Lo que va a quedar si ARCA no devuelve una propia. Es una REFERENCIA, no el valor. */
    rnosSugerido: rnosCascada,
    nombreObraSocialSugerida: obraSocial?.name || "",
    rnosPorDefecto: !obraSocialPropia && !!obraSocial,
    constatacion,
    constatadaEl: String(row.obraSocialConstatadaEl || ""),
    rnosOrigen: obraSocialPropia ? ((row.obraSocialOrigen || "heredada-usuario") as "constatada" | "manual" | "heredada-usuario") : obraSocialConvenio ? "convenio" : obraSocialEmpresa ? "empresa" : "ninguno",
    sucursal: sucursal?.codigo ? String(sucursal.codigo) : "",
  };
}

/**
 * Metadatos de cada origen: cómo se llama y a dónde se va a resolverlo.
 * `corto` es el imperativo que va en el badge de la grilla, donde no entra el título largo.
 */
const ORIGENES: Record<OrigenDato, { titulo: string; accion: string; corto?: string; link?: { to: string; label: string } | { enFila: string } }> = {
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
  empresa: { titulo: "Empresa del Contrato", accion: "Elegí con qué empleadora se da de alta a esta persona.", corto: "Elegí la empresa", link: { enFila: "Se elige en la columna «Empresa Contrato»" } },
  sucursal: { titulo: "Sucursal y actividad", accion: "Elegí el domicilio de desempeño con el que se declara el alta.", corto: "Elegí la sucursal", link: { enFila: "Se eligen acá abajo, en «Sucursal» y «Actividad»" } },
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
  } else if (finNoPosteriorAlInicio(fechaAfip(v.fechaInicio), fechaAfip(v.fechaFin))) {
    /*
      Mismo día, o fin antes del inicio. Es la única forma de estar «mal» teniendo las dos fechas
      bien escritas, y por eso hay que decirlo acá: el archivo pasaría el validador de formato de
      ARCA y registraría una relación laboral de cero días.

      El mensaje repite las dos fechas porque el error no se ve mirando una sola.
    */
    checks.push(
      mk(
        "fechaFin",
        "Fecha de fin",
        "contrato",
        v.fechaFin,
        "error",
        `La fecha de fin (${fechaAfip(v.fechaFin)}) tiene que ser posterior a la de inicio (${fechaAfip(v.fechaInicio)}): así como está, el contrato duraría cero días.`,
      ),
    );
  } else {
    /*
      Vacía y correcta. `noAplica` distingue las DOS formas de llegar acá: con una modalidad
      indeterminada el campo no correspondía —y no tiene que contar como uno de los que había que
      completar—, mientras que con una fecha efectivamente cargada sí es un campo resuelto.
    */
    checks.push({ ...mk("fechaFin", "Fecha de fin", "contrato", v.fechaFin || "(en blanco, correcto)", "ok"), noAplica: prohibeFin && !v.fechaFin });
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

  /*
    --- Tipo de Contrato: los tres códigos cascadean igual, así que se explican igual.

    Decir DE DÓNDE salió cada uno no es un adorno: manda a corregir a un lugar distinto. Culpar al
    tipo de contrato por un valor que puso el default de la empleadora hace editar una plantilla que
    no está mal, y el valor volvería a aparecer igual en el alta siguiente.
  */
  const heredado = (campo: string, etiqueta: string, valor: string, origen: OrigenValorArca, faltaMsg: string) => {
    if (origen === "empresa") return mk(campo, etiqueta, "empresa", valor, "ok", "Del default de la empleadora: el tipo de contrato no trae el suyo.");
    if (origen === "global") return mk(campo, etiqueta, "empresa", valor, "ok", "Del default de la instalación (Configuración → ARCA): ni el tipo de contrato ni la empleadora traen el suyo.");
    return presencia(campo, etiqueta, "tipo_contrato", valor, faltaMsg);
  };
  checks.push(heredado("modalidadContrato", "Modalidad de contrato", v.modalidadContrato, v.modalidadContratoOrigen, "El tipo de contrato no tiene cargado su código de modalidad, y no hay ninguno marcado con estrella: se marca en la ficha de la empleadora o en Configuración → ARCA."));
  checks.push(heredado("tipoServicio", "Tipo de servicio", v.tipoServicio, v.tipoServicioOrigen, "El tipo de contrato no tiene cargado su tipo de servicio, y no hay ninguno marcado con estrella: se marca en la ficha de la empleadora o en Configuración → ARCA."));
  checks.push(heredado("modalidadLiq", "Modalidad de liquidación", v.modalidadLiq, v.modalidadLiqOrigen, "El tipo de contrato no tiene cargada su modalidad de liquidación, y no hay ninguna marcada con estrella: se marca en la ficha de la empleadora o en Configuración → ARCA."));

  // --- Obra social. Decir de DÓNDE salió no es un detalle: si salió del convenio, corregirla es
  // cambiar el convenio y alcanza a todos sus contratos; si salió de la persona, es solo de ella.
  const fechaConstatada = row.obraSocialConstatadaEl ? new Date(row.obraSocialConstatadaEl).toLocaleDateString("es-AR") : "";
  // La fuente va en la etiqueta junto con la fecha. Hoy se constata en ARCA; "SSS" sobrevive para los
  // contratos constatados antes del cambio de fuente, que no se reescriben: decían la verdad cuando
  // se guardaron y borrar de dónde salió un dato es peor que mostrar dos orígenes distintos.
  const fuenteConstatada = row.obraSocialConstatadaEn === "arca" ? "ARCA" : row.obraSocialConstatadaEn === "sss" ? "SSS" : "";
  const etiquetaRnos = v.constatacion === "sin_constatar"
    ? "Código RNOS — sin validar en ARCA"
    : {
    constatada: `Código RNOS — constatada${fuenteConstatada ? ` · ${fuenteConstatada}` : ""}${fechaConstatada ? ` · ${fechaConstatada}` : ""}`,
    manual: "Código RNOS — cargada a mano en este contrato",
    "heredada-usuario": "Código RNOS — viene de la ficha de la persona",
    override: `Código RNOS — del convenio ${v.convenioCategoria || ""} (excepción de esta empresa)`.trim(),
    convenio: `Código RNOS — del convenio ${v.convenioCategoria || ""}`.trim(),
    empresa: "Código RNOS — excluido de convenio: de la empleadora",
    ninguno: "Código RNOS — obra social",
      }[v.rnosOrigen];

  // El detalle del faltante dice QUÉ falta cargar, que depende de por dónde se cortó la cascada.
  // Antes acá había una obra social global que rellenaba el campo: se eliminó porque solo tapaba
  // esta misma situación con un valor sin fundamento, que ARCA acepta igual.
  /**
   * Qué falta, que ahora es SIEMPRE lo mismo: validar contra ARCA.
   *
   * Antes acá se explicaba cómo configurar el convenio, porque el valor salía de la cascada y el
   * faltante era que la cascada no llegara a nada. Ahora el valor sale de ARCA: mientras no se
   * valide no hay obra social, tenga o no el convenio la suya cargada. Lo que sí cambia es la NOTA
   * de referencia —qué va a quedar si ARCA no devuelve ninguna—, que se arma abajo.
   */
  const faltaRnos = v.rnosSugerido
    ? `Validá el CUIL en ARCA (Relaciones Laborales → Registrar Nuevas Altas) y aplicá el resultado en «Validar obras sociales». Si el organismo no tiene una registrada para esta persona, va a quedar la del ${v.convenioCategoria ? `convenio ${v.convenioCategoria}` : "convenio"}: ${v.rnosSugerido} · ${v.nombreObraSocialSugerida}.`
    : !v.convenioCategoria
      ? "Validá el CUIL en ARCA. Y ojo: la categoría del contrato no tiene cargado a qué convenio pertenece, así que si ARCA no devuelve ninguna no hay de dónde sacarla — cargásela en Configuración → ARCA → Categorías."
      : v.convenioCategoria === CONVENIO_EXCLUIDO
        ? "Validá el CUIL en ARCA. Es un excluido de convenio (9999/99): si el organismo no devuelve ninguna, la define la empleadora y hay que cargarla en su ficha (ARCA → Obras Sociales)."
        : `Validá el CUIL en ARCA. Y ojo: el convenio ${v.convenioCategoria} no tiene obra social cargada, así que si el organismo no devuelve ninguna no hay de dónde sacarla — asignásela en Configuración → ARCA → Convenios.`;
  checks.push(presencia("rnos", etiquetaRnos, "obra_social", v.rnos, faltaRnos));

  /**
   * Heredada de la ficha de la persona: sirve, pero nadie la verificó.
   *
   * Es `aviso` y no `falta`: el dato está y el alta se puede generar. Lo que se marca es que viene
   * del campo viejo del usuario —sin fecha ni constatación— y que por desregulación puede estar
   * vencida. Es el origen que deja la migración y el que hay que ir limpiando.
   */
  /**
   * NO se pudo verificar contra el padrón de la empleadora. No es lo mismo que estar bien.
   *
   * `obraSocialRegistrada === null` significa que falta el dato con el que se compara —la empleadora
   * todavía no está elegida, o su padrón nunca se extrajo—, no que la obra social sea válida. Sin
   * esto la fila se veía verde y quedaba con cara de validada: el operador no vuelve a mirar algo que
   * ya está en verde, y el rechazo aparece recién cuando ARCA devuelve el archivo.
   */
  if (v.rnos && v.obraSocialRegistrada === null) {
    checks.push(
      mk(
        "obraSocialSinVerificar",
        "Obra social sin verificar contra ARCA",
        "obra_social",
        v.rnos,
        "aviso",
        hayEmpresa
          ? "La empleadora no tiene cargadas sus obras sociales registradas, así que no se puede saber si ARCA va a aceptar esta. Extraé su padrón (Datos del Empleador → Obras Sociales) y cargalo en su ficha."
          : "Todavía no se eligió la empleadora del contrato, así que no hay contra qué padrón verificarla. Se comprueba sola al elegirla.",
      ),
    );
  }

  /*
   * Acá vivía el aviso "obra social sin constatar": el valor estaba —salía del convenio— y lo que se
   * marcaba era que nadie lo había verificado. Se eliminó al cambiar la regla: ahora, sin validar, no
   * hay valor, así que el estado no es un aviso sino el faltante que ya declara `presencia("rnos")`
   * unas líneas arriba. Un aviso sobre un campo vacío diría dos veces lo mismo.
   */

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
        checks.push(mk("sucursal", "Sucursal de ARCA", "sucursal", "", "falta", v.sucursalesDisponibles.length === 0 ? "La empresa no tiene domicilios de explotación registrados: cargáselos en su ficha, en ARCA → Domicilios." : "Elegí el domicilio de desempeño en «Sucursal», acá abajo."));
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
  /**
   * Lo que impide (o traba) generar el alta. Los `aviso` NO entran: el dato está, el TXT sale, y
   * contarlos como pendientes haría que un contrato listo se muestre incompleto para siempre —
   * "constatar la obra social" es una mejora, no un requisito.
   */
  /*
    UN TIPO QUE NO GENERA ALTA NO TIENE FALTANTES.

    «Servicios» es una locación de servicios: no es relación laboral y no se declara. Sus tres
    códigos vacíos no son un dato pendiente, son la respuesta correcta — y contarlos como faltantes
    lo dejaba «incompleto» para siempre, que es la forma más segura de que alguien los complete y
    declare ante el organismo una relación que no existe.

    Los `aviso` tampoco entran: el dato está, el TXT sale, y «constatar la obra social» es una
    mejora, no un requisito.
  */
  const conProblema = v.generaAlta ? checks.filter((c) => c.estado !== "ok" && c.estado !== "aviso") : [];
  const avisos = checks.filter((c) => c.estado === "aviso");
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
        enFila: ORIGENES_EN_FILA.includes(origen),
      },
    ];
  });

  // Lo que se puede hacer AHORA: los grupos bloqueados no suman, porque se resuelven solos al
  // destrabar el origen del que dependen.
  const accionables = grupos.filter((g) => !g.bloqueadoPor);

  return {
    checks,
    faltantes: conProblema.length,
    completo: conProblema.length === 0,
    grupos,
    configuracionesPendientes: accionables.filter((g) => !g.enFila).length,
    pendientesEnFila: accionables.filter((g) => g.enFila).length,
    errores: checks.filter((c) => c.estado === "error").length,
    avisos: avisos.length,
  };
}

/**
 * Un campo cuenta como RESUELTO si el TXT se puede generar con él: `ok` y también `aviso`.
 *
 * Un aviso no es un faltante. El caso que lo obliga es la obra social: si ARCA no devolvió ninguna,
 * rige la del convenio y el registro sale igual — que esté sin constatar es una verificación
 * pendiente, no un dato ausente. Contándolo como no resuelto, un contrato perfectamente generable
 * mostraba 5/15 y quedaba pidiendo trabajo que no cambiaba el archivo. Es el mismo error que ya se
 * corrigió con Puesto Desempeñado y Situación de Revista.
 *
 * La regla vive acá para que la fracción del badge, la barra del pie y `completo` no puedan
 * discrepar: los tres dicen lo mismo sobre el mismo contrato.
 */
export const esResuelto = (c: AfipFieldCheck): boolean => c.estado === "ok" || c.estado === "aviso";

/** Tono del resumen: define el color del badge y del encabezado del detalle. */
export type TonoArca = "ok" | "error" | "falta" | "en_fila";

/**
 * Qué decir en una línea sobre el estado ARCA de un contrato. Vive acá y no en el badge porque lo
 * consumen tres lugares (las dos vistas de la grilla y el encabezado del detalle) y tienen que
 * coincidir: un badge que dice una cosa abriendo un detalle que dice otra es peor que cualquiera de
 * los dos textos.
 *
 * Habla en CAMPOS y no en configuraciones. "1 configuración" era exacto —un tipo de contrato sin
 * códigos es una sola cosa que ir a cargar— pero no se entendía al lado de la barra que marcaba
 * 5/14: dos unidades distintas para la misma fila se leen como una contradicción. Ahora el badge y
 * la barra dicen el MISMO número en la MISMA dirección (resueltos sobre el total), y el desglose de
 * cuántos "lugares" hay que tocar queda para los pasos numerados del detalle, que es donde importa.
 *
 * El tono sigue distinguiendo la gravedad: rojo si hay datos mal cargados, ámbar si falta cargar,
 * gris si solo falta elegir algo que ya está en pantalla.
 */
export function resumenArca(r: AfipRowResult): { tono: TonoArca; texto: string } {
  const total = r.checks.length;
  const resueltos = r.checks.filter(esResuelto).length;
  if (r.completo) return { tono: "ok", texto: "Completo" };
  // Solo la fracción: que el badge sea una ACCIÓN lo dice el ícono de tuerca, no una palabra que
  // repite en cada fila lo mismo y le come el lugar al único dato que distingue una de otra.
  return { tono: r.errores > 0 ? "error" : r.configuracionesPendientes > 0 ? "falta" : "en_fila", texto: `${resueltos}/${total}` };
}
