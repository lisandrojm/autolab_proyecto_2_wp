/**
 * ═══════════════════════════════════════════════════════════════════════
 * EMPLEADORA → CONVENIO → CATEGORÍA: LA CADENA, EN UN SOLO LUGAR
 * ═══════════════════════════════════════════════════════════════════════
 *
 * No es una preferencia de pantalla: es cómo ARCA acepta un alta. La categoría profesional tiene que
 * pertenecer a un convenio que la EMPLEADORA tenga registrado, y el organismo rechaza el alta si no.
 * De ahí que el orden sea empresa → convenios de ese CUIT → categorías de esos convenios.
 *
 * Esto vivía dentro de `pages/ProjectTeamPage.tsx`, cerrado sobre su estado, y la solicitud del móvil
 * resolvía lo mismo por su cuenta —filtrando las categorías sólo por el rol empresa, sin mirar el
 * convenio—. Con eso se podía mandar una solicitud con el convenio 0634/11 y una categoría del
 * 0131/75: coherente en la pantalla, rechazada por ARCA. Dos copias de una regla terminan siempre
 * igual: alguien arregla una y la otra sigue diciendo otra cosa.
 *
 * Son funciones puras a propósito: las usan un wizard con `wizardData` y un formulario de móvil con
 * su propio estado, y ninguna de las dos formas tiene por qué imponerse sobre la otra.
 */

import { CategoriaSatItem, esElegible } from "../api/categoriasSat";
import { importePorJornada } from "@compartido/jornadas";
import { Company } from "../api/companies";
import { RoleFrameItem } from "../api/roleFrames";
import { SimpleCatalogItem } from "../api/simpleCatalog";

/** Una categoría, como la ofrecen los selectores: lo mínimo para mostrarla y elegirla. */
export interface CategoriaOfrecida {
  id: number | string;
  nombre: string;
  numeroCategoria: number | string;
  /** El código de ARCA de 6 dígitos, canónico y con sus ceros. Es lo que identifica a la categoría. */
  codigoArca: string;
  /**
   * La valoración de esta categoría EN ESTA FUNCIÓN. `null`/ausente = sin valorar.
   *
   * Viaja desde `RoleFrame.data.categoriasSat[].valoracionId` y no desde el catálogo: el mismo
   * código de ARCA puede ser Oro en una función y Plata en otra.
   */
  valoracionId?: string | null;
}

export interface ConvenioOfrecido {
  /** El código de CCT ("0634/11"). Es la clave con la que las categorías declaran su convenio. */
  externalId: string;
  name: string;
  cantidadCategorias: number;
  /** `false` = la empleadora no lo tiene registrado; se ofrece igual si es el que ya estaba elegido. */
  registrado: boolean;
}

/**
 * Los códigos de CCT que la empleadora tiene registrados ante ARCA.
 *
 * `null` significa «esta empleadora no declara ninguno», que NO es lo mismo que una lista vacía: sin
 * empleadora elegida no hay filtro que aplicar, y filtrar por una lista vacía escondería todo.
 */
export const codigosDeConveniosDeLaEmpleadora = (empresa: Company | undefined, convenios: SimpleCatalogItem[]): string[] | null => {
  if (!empresa) return null;
  const ids = (empresa.convenioIds || []).map(String);
  const codigos = convenios
    .filter((c) => ids.includes(c._id))
    .map((c) => String(c.externalId || "").trim())
    .filter(Boolean);
  return codigos.length > 0 ? codigos : null;
};

/**
 * Los convenios que se pueden elegir. NUNCA el catálogo entero (~2.669): sólo los de la empleadora.
 *
 * Se dice cuántas categorías tiene cada uno porque es lo que anticipa si elegirlo va a servir de algo:
 * un convenio registrado ante ARCA pero sin categorías cargadas en WeProdu deja la lista de abajo
 * vacía, y sin el número eso parece un error de la pantalla.
 *
 * Un convenio SIN categorías no se ofrece —no hay nada que filtrar con él— salvo que sea el que ya
 * estaba elegido: esconderlo rompería la edición de un contrato viejo.
 */
export const conveniosOfrecidos = ({ codigosEmpleadora, convenioElegido, categorias, convenios }: { codigosEmpleadora: string[] | null; convenioElegido: string; categorias: CategoriaSatItem[]; convenios: SimpleCatalogItem[] }): ConvenioOfrecido[] => {
  const codigos = new Set<string>(codigosEmpleadora || []);
  // Un contrato viejo puede tener una categoría de un convenio que la empleadora ya no registra. Se
  // ofrece igual, marcado: el error ya lo señala el checklist de Datos ARCA, que es donde corresponde.
  if (convenioElegido) codigos.add(convenioElegido);

  const cantidadPorCct = new Map<string, number>();
  for (const c of categorias) {
    if (!esElegible(c)) continue;
    const cct = String(c.data?.convenio || "").trim();
    if (cct) cantidadPorCct.set(cct, (cantidadPorCct.get(cct) || 0) + 1);
  }
  const nombrePorCct = new Map(convenios.map((c) => [String(c.externalId || "").trim(), String(c.name || "")]));

  return [...codigos]
    .map((externalId) => ({
      externalId,
      name: nombrePorCct.get(externalId) || "",
      cantidadCategorias: cantidadPorCct.get(externalId) || 0,
      registrado: (codigosEmpleadora || []).includes(externalId),
    }))
    .filter((c) => c.cantidadCategorias > 0 || c.externalId === convenioElegido)
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
};

export interface CategoriasOfrecidas {
  categorias: CategoriaOfrecida[];
  /** Las que ARCA no aceptaría: son de un convenio que la empleadora no registró. Hay que explicarlas. */
  ocultasPorConvenio: number;
  /** Las que dejó afuera el convenio elegido. Las destraba quien filtró, cambiando de convenio. */
  ocultasPorFiltroConvenio: number;
  /** La función FRAME tiene categorías, pero ninguna de este convenio: el cruce daría vacío. */
  rolNoTieneCategoriasDelConvenio: boolean;
  /** Las que dejó afuera la valoración del proyecto. Se destraban con «Elegir de todas formas». */
  ocultasPorValoracion: number;
  /**
   * La función tiene categorías VALORADAS, pero ninguna de la valoración del proyecto.
   *
   * Calca a `rolNoTieneCategoriasDelConvenio`: se sale del filtro y se avisa, en vez de devolver una
   * lista vacía. Una lista vacía sin explicación se lee como un problema de la pantalla.
   */
  rolNoTieneCategoriasDeLaValoracion: boolean;
  /**
   * El proyecto está valorado pero la función NO: ninguna de sus categorías tiene valoración, así
   * que el modo permisivo las ofrece todas y no se elige ninguna sola.
   *
   * Se informa porque en silencio parece una falla del filtro: con el proyecto en Plata, quien abre
   * el desplegable espera ver la categoría de Plata elegida, y lo que ve es la lista completa.
   */
  rolSinValorar: boolean;
}

/**
 * Las categorías que se pueden elegir, con el motivo de lo que quedó afuera.
 *
 * `rolesFrame` es una LISTA porque la solicitud del móvil admite varios oficios a la vez —una persona
 * puede entrar como Iluminador y Animador 2D— y el wizard del escritorio pasa uno solo. Las categorías
 * de todos se suman: cualquiera de esos oficios habilita su propia escala.
 */
export const categoriasOfrecidas = ({
  rolesFrame,
  convenioElegido,
  codigosEmpleadora,
  categorias,
  verTodasDelConvenio,
  categoriaElegidaId,
  valoracionProyecto,
  verTodasLasValoraciones = false,
}: {
  rolesFrame: RoleFrameItem[];
  convenioElegido: string;
  codigosEmpleadora: string[] | null;
  categorias: CategoriaSatItem[];
  verTodasDelConvenio: boolean;
  categoriaElegidaId?: string | number;
  /** La valoración del PROYECTO. Vacío = el proyecto no está valorado y no se filtra por esto. */
  valoracionProyecto?: string;
  /** El escape manual: muestra todas y deja elegir una de otra valoración (se audita al guardar). */
  verTodasLasValoraciones?: boolean;
}): CategoriasOfrecidas => {
  // El convenio de cada categoría vive SOLO en el catálogo: la copia denormalizada de las funciones
  // FRAME no lo guarda, así que todo lo que use el CCT se resuelve contra este mapa por `data.id`.
  const convenioPorId = new Map(categorias.map((c) => [String(c.data?.id), String(c.data?.convenio || "").trim()]));

  const delRol: CategoriaOfrecida[] = rolesFrame.flatMap((rf) =>
    (Array.isArray(rf.data?.categoriasSat) ? (rf.data.categoriasSat as any[]) : []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      numeroCategoria: c.numeroCategoria ?? c.id,
      codigoArca: "",
      valoracionId: c.valoracionId ? String(c.valoracionId) : null,
    })),
  );

  /*
    EL CASO QUE BLOQUEA UN CONVENIO ENTERO.

    Si la función Frame tiene categorías cargadas, se usan SOLO esas. Cuando ninguna es del convenio
    elegido, el cruce da vacío y el convenio queda inalcanzable — que es exactamente lo que pasa con
    0131/75 (218 categorías en el catálogo, cero ofrecidas). No es un dato faltante del operador: es
    que la función Frame se cargó con las categorías de otro convenio.

    Se detecta y se sale del filtro por función, avisando. Callarlo deja una lista vacía sin explicación.
  */
  const rolNoTieneCategoriasDelConvenio = rolesFrame.length > 0 && !!convenioElegido && delRol.length > 0 && !delRol.some((c) => convenioPorId.get(String(c.id)) === convenioElegido);
  const ignorarFiltroPorRol = !!convenioElegido && (verTodasDelConvenio || rolNoTieneCategoriasDelConvenio);

  let list: CategoriaOfrecida[] = ignorarFiltroPorRol ? [] : delRol;

  // Sin categorías por función, el catálogo entero. Se filtran las no elegibles (alias que existen
  // sólo para que resuelvan contratos históricos): acá se ELIGE una para un contrato nuevo.
  if (list.length === 0 && categorias.length > 0) {
    list = categorias.filter(esElegible).map((c) => ({ id: c.data?.id, nombre: c.name, numeroCategoria: c.data?.numeroCategoria || c.data?.id, codigoArca: "" }));
  }

  // Sólo las categorías de los convenios de la empleadora. Este filtro es de ARCA, no una preferencia:
  // el organismo rechaza el alta con una categoría de un convenio que la empleadora no registró.
  let ocultasPorConvenio = 0;
  if (codigosEmpleadora) {
    const antes = list.length;
    // Una categoría SIN convenio tampoco se ofrece: no se puede verificar que ARCA la acepte, y su
    // alta saldría sin categoría profesional. Se cuenta aparte para poder decirlo.
    list = list.filter((c) => {
      const cct = convenioPorId.get(String(c.id));
      return !!cct && codigosEmpleadora.includes(cct);
    });
    ocultasPorConvenio = antes - list.length;
  }

  /*
    El filtro que pidió el operador, aplicado DESPUÉS del de la empleadora.

    Ese orden importa para lo que se cuenta: «ocultas por convenio» son las que ARCA no aceptaría y hay
    que explicar; «ocultas por el filtro» son las que el propio operador acaba de dejar afuera y
    destraba solo. Sumarlas en un número las volvería la misma cosa.
  */
  let ocultasPorFiltroConvenio = 0;
  if (convenioElegido) {
    const antes = list.length;
    list = list.filter((c) => convenioPorId.get(String(c.id)) === convenioElegido);
    ocultasPorFiltroConvenio = antes - list.length;
  }

  /*
    ── LA VALORACIÓN, ÚLTIMA DE LA CADENA ──

    El orden es función → convenios de la empleadora → convenio elegido → VALORACIÓN, y no es
    arbitrario: los tres primeros son de ARCA y el organismo RECHAZA el alta si se los saltea. La
    valoración es comercial — si se aplicara antes, podría dejar pasar una categoría de un convenio
    que la empleadora no registró, y ese archivo vuelve rebotado.

    MODO PERMISIVO. Si NINGUNA categoría de la función tiene valoración cargada, el filtro no se
    aplica: es el estado en el que está todo hasta que alguien termine de valorar las funciones, y
    frenar la contratación por un dato que todavía no se cargó sería peor que no tener la feature.

    SALIDA CON AVISO. Si la función SÍ tiene categorías valoradas pero ninguna de la valoración del
    proyecto, se sale del filtro y se avisa, igual que con `rolNoTieneCategoriasDelConvenio`. Una
    lista vacía sin explicación se lee como un error de la pantalla, no como un dato que falta.
  */
  let ocultasPorValoracion = 0;
  const algunaValorada = list.some((c) => !!c.valoracionId);
  const rolNoTieneCategoriasDeLaValoracion = !!valoracionProyecto && algunaValorada && !list.some((c) => c.valoracionId === valoracionProyecto);
  // Con una sola no hay nada que explicar: el alta la elige sola, igual que si estuviera valorada.
  const rolSinValorar = !!valoracionProyecto && rolesFrame.length > 0 && list.length > 1 && !algunaValorada;

  if (valoracionProyecto && algunaValorada && !verTodasLasValoraciones && !rolNoTieneCategoriasDeLaValoracion) {
    const antes = list.length;
    // Una categoría SIN valorar dentro de una función que sí valoró otras queda afuera: no se puede
    // afirmar que corresponda a este nivel, y ofrecerla sería decidir por quien no la cargó.
    list = list.filter((c) => c.valoracionId === valoracionProyecto);
    ocultasPorValoracion = antes - list.length;
  }

  // La categoría ya elegida se muestra siempre, aunque el filtro la haya sacado: esconderla convertiría
  // un contrato mal cargado en una lista vacía, sin decir qué tenía.
  if (categoriaElegidaId && !list.some((c) => String(c.id) === String(categoriaElegidaId))) {
    const global = categorias.find((c) => String(c.data?.id) === String(categoriaElegidaId));
    if (global) list = [...list, { id: global.data?.id, nombre: global.name, numeroCategoria: global.data?.numeroCategoria || global.data?.id, codigoArca: "" }];
  }

  // Lo que identifica a una categoría es su código de ARCA de 6 dígitos, no el "Nº Cat." —que era el
  // número del GRUPO salarial, compartido por decenas de categorías distintas—. La copia denormalizada
  // de las funciones FRAME lo guarda como número, así que se re-resuelve contra el catálogo, donde
  // está canónico con sus ceros.
  const codigoPorId = new Map(categorias.map((c) => [String(c.data?.id), String(c.data?.codigoArca || "").trim()]));
  // `...c` primero: conserva `valoracionId`, que sólo existe en la copia de la función y no en el
  // catálogo. Invertirlo lo borraría acá, en la última línea, después de haber filtrado bien.
  const conCodigo = list.map((c) => ({ ...c, codigoArca: codigoPorId.get(String(c.id)) || "" }));

  return { categorias: conCodigo, ocultasPorConvenio, ocultasPorFiltroConvenio, rolNoTieneCategoriasDelConvenio, ocultasPorValoracion, rolNoTieneCategoriasDeLaValoracion, rolSinValorar };
};

/** El CCT al que pertenece una categoría, por su `data.id`. Vacío si no lo declara. */
export const convenioDeCategoria = (categoriaId: string | number | undefined, categorias: CategoriaSatItem[]): string =>
  categoriaId ? String(categorias.find((c) => String(c.data?.id) === String(categoriaId))?.data?.convenio || "").trim() : "";

/**
 * Lo que se paga por jornada según la escala de la categoría.
 *
 * Es el mismo número que el escritorio llama `sueldo_diario_neto`: el neto mensual del grupo salarial
 * dividido 30. Se propone, no se impone —lo pactado puede ser otro— pero tenerlo que escribir a mano
 * desde cero era pedirle a un coordinador que calcule algo que el convenio ya dice.
 */
/**
 * El importe por jornada que propone una categoría: su neto mensual dividido 30.
 *
 * EL MULTIPLICADOR DEL TIPO DE CONTRATO SE APLICA ACÁ. Un contrato «Jornada» con multiplicador 1,5
 * paga una vez y media la jornada de la escala: el número que hay que proponer es el ya multiplicado,
 * no la escala pelada —que es lo que valdría si el contrato fuera común—. Vive en esta función y no
 * en cada pantalla para que la app y el escritorio propongan lo mismo.
 *
 * Sin multiplicador cargado (0, vacío o ausente) se usa 1: es «sin multiplicador», no «por cero».
 */
export const importePorJornadaDeCategoria = (categoria: CategoriaSatItem | undefined, multiplicadorDiario?: number | null): number => (categoria ? importePorJornada(categoria.data?.neto, multiplicadorDiario) : 0);

/** Un nivel del catálogo de Valoraciones. Para compararlos alcanza con el orden. */
export interface NivelDeValoracion {
  _id: string;
  /** **1 es el nivel MÁS ALTO** (Oro). Sin orden, un nivel no se puede comparar con otro. */
  orden?: number | null;
}

/** Por qué quedó elegida esa categoría. Lo usa la pantalla para explicarlo sin volver a deducirlo. */
export type MotivoDeDefecto = "coincide" | "otra-valoracion" | "unica";

export interface CategoriaElegidaPorDefecto {
  id: string;
  motivo: MotivoDeDefecto;
  /** Cuántas candidatas había. Más de una significa que se eligió la primera y conviene decirlo. */
  candidatas: number;
}

const ordenDelNivel = (valoracionId: string | null | undefined, niveles: NivelDeValoracion[]): number | null => {
  const nivel = niveles.find((n) => String(n._id) === String(valoracionId || ""));
  const orden = Number(nivel?.orden);
  return Number.isFinite(orden) ? orden : null;
};

/**
 * QUÉ CATEGORÍA VIENE ELEGIDA AL ABRIR EL ALTA.
 *
 * La valoración del proyecto es lo que define el encuadre: un proyecto Plata se contrata con las
 * categorías Plata de la función. Dejar el selector vacío obliga a elegir a mano algo que el dato ya
 * decide, y —peor— hace que la pantalla dependa de que cada persona se acuerde de la regla.
 *
 * EL ORDEN DE PREFERENCIA
 *
 *   1. Una del NIVEL DEL PROYECTO, si existe. Gana siempre, aunque haya de otros niveles en la lista.
 *   2. Si no hay ninguna de ese nivel, la del nivel MÁS CERCANO por `orden`, y en un empate la MÁS
 *      ALTA. Que no exista la categoría del nivel del proyecto no es motivo para no proponer nada: se
 *      propone la más parecida y se dice que difiere, para que se lea como lo que es —una decisión
 *      particular de este contrato— y no como un descuido. Quien la confirme va a tener que escribir
 *      el motivo igual, que es lo que el server exige.
 *   3. Si hay una sola candidata, ésa: pedir un click para confirmar lo único posible no es elegir.
 *
 * CUÁNDO NO DECIDE NADA (devuelve `null`): sin categorías, o con varias y ninguna valorada. En el
 * segundo caso el dato que haría falta —la valoración de cada categoría en esa función— todavía no se
 * cargó, y elegir por orden de lista sería inventar un criterio.
 *
 * `candidatas > 1` con motivo `coincide` significa que la función tiene varias del nivel del proyecto
 * y se tomó la primera. Es una elección legítima pero no la única, y por eso se informa.
 */
export const categoriaPorDefecto = ({
  categorias,
  valoracionProyecto,
  niveles = [],
}: {
  categorias: CategoriaOfrecida[];
  valoracionProyecto?: string;
  niveles?: NivelDeValoracion[];
}): CategoriaElegidaPorDefecto | null => {
  if (categorias.length === 0) return null;
  if (categorias.length === 1) return { id: String(categorias[0].id), motivo: "unica", candidatas: 1 };
  if (!valoracionProyecto) return null;

  const delNivelDelProyecto = categorias.filter((c) => String(c.valoracionId || "") === valoracionProyecto);
  if (delNivelDelProyecto.length > 0) return { id: String(delNivelDelProyecto[0].id), motivo: "coincide", candidatas: delNivelDelProyecto.length };

  const ordenProyecto = ordenDelNivel(valoracionProyecto, niveles);
  const valoradas = categorias.filter((c) => ordenDelNivel(c.valoracionId, niveles) !== null);
  // Sin orden del proyecto o sin categorías valoradas no hay con qué medir "cercanía": no se decide.
  if (ordenProyecto === null || valoradas.length === 0) return null;

  const masCercana = [...valoradas].sort((a, b) => {
    const ordenA = ordenDelNivel(a.valoracionId, niveles) as number;
    const ordenB = ordenDelNivel(b.valoracionId, niveles) as number;
    const distanciaA = Math.abs(ordenA - ordenProyecto);
    const distanciaB = Math.abs(ordenB - ordenProyecto);
    if (distanciaA !== distanciaB) return distanciaA - distanciaB;
    // Empate: gana el nivel más alto, que es el de `orden` más chico.
    return ordenA - ordenB;
  })[0];

  return { id: String(masCercana.id), motivo: "otra-valoracion", candidatas: valoradas.length };
};
