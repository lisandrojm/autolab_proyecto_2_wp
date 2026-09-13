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
}: {
  rolesFrame: RoleFrameItem[];
  convenioElegido: string;
  codigosEmpleadora: string[] | null;
  categorias: CategoriaSatItem[];
  verTodasDelConvenio: boolean;
  categoriaElegidaId?: string | number;
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
  const conCodigo = list.map((c) => ({ ...c, codigoArca: codigoPorId.get(String(c.id)) || "" }));

  return { categorias: conCodigo, ocultasPorConvenio, ocultasPorFiltroConvenio, rolNoTieneCategoriasDelConvenio };
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
export const importePorJornadaDeCategoria = (categoria: CategoriaSatItem | undefined): number => (categoria ? Number((Number(categoria.data?.neto ?? 0) / 30).toFixed(2)) : 0);
