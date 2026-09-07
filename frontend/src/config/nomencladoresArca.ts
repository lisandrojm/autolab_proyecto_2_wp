/**
 * EL ÁMBITO DE CADA NOMENCLADOR DE ARCA, EN UN SOLO LUGAR.
 *
 * QUÉ PROBLEMA RESUELVE. La UI mezclaba dos cosas distintas sin distinguirlas: los nomencladores que
 * en ARCA se declaran POR CUIT y las tablas generales, iguales para todos los empleadores. Varias
 * listas mostraban una columna «Empresas» que no significaba nada, y la ficha de una empleadora
 * ofrecía asignar cosas que ARCA no permite asignar. Cada pantalla lo decidía por su cuenta.
 *
 * LA REGLA, verificada contra el Manual de Ayuda de Simplificación Registral: en ARCA solo se declara
 * por CUIT lo que vive bajo «Datos del Empleador» —obras sociales, domicilios de explotación,
 * convenios colectivos, CBU, medios de contacto, datos del padrón, tipo de empleador,
 * jurisdicciones—. Todo lo demás son tablas generales de ARCA / ANSeS / SRT que se eligen al momento
 * del alta de cada relación laboral.
 *
 * De este mapa se derivan la columna de asignación, el badge del encabezado, la línea explicativa y
 * qué entra en el submenú de la ficha de empresa. Si mañana ARCA cambia el criterio de uno, se toca
 * una línea acá y no cuatro componentes.
 */

export type AmbitoNomenclador =
  /** Se declara por CUIT ante ARCA. El organismo rechaza un alta fuera de esa lista. */
  | 'empresa'
  /** Depende del convenio, no de la empresa: se hereda, no se asigna. */
  | 'derivado'
  /** Tabla general, igual para todas las empresas. Se elige en el alta. */
  | 'general'
  /** No existe en ARCA: es un dato nuestro. */
  | 'plataforma';

/** De dónde sale la tabla. Es lo que separa «Tabla de ARCA» de «Tabla de ANSeS» en el badge. */
export type FuenteNomenclador = 'ARCA' | 'ANSeS' | 'convenio' | 'plataforma';

export interface NomencladorArca {
  id: string;
  label: string;
  ruta: string;
  ambito: AmbitoNomenclador;
  fuente: FuenteNomenclador;
  /** La frase que se muestra debajo del título y en el tooltip del badge. Va literal. */
  descripcionAmbito: string;
}

export const NOMENCLADORES_ARCA: NomencladorArca[] = [
  {
    id: 'convenios',
    label: 'Convenios',
    ruta: '/convenios',
    ambito: 'empresa',
    fuente: 'ARCA',
    descripcionAmbito: 'Cada empresa declara ante ARCA los convenios colectivos que aplica.',
  },
  {
    id: 'domicilios',
    label: 'Domicilios de Explotación',
    ruta: '/arca/sucursales',
    ambito: 'empresa',
    fuente: 'ARCA',
    descripcionAmbito: 'Cada empresa declara ante ARCA sus domicilios de explotación.',
  },
  {
    id: 'obras-sociales',
    label: 'Obras Sociales',
    ruta: '/obras-sociales',
    ambito: 'empresa',
    fuente: 'ARCA',
    descripcionAmbito: 'Cada empresa informa ante ARCA las obras sociales correspondientes a sus actividades.',
  },
  {
    id: 'categorias',
    label: 'Categorías',
    ruta: '/arca/categorias',
    ambito: 'derivado',
    fuente: 'convenio',
    descripcionAmbito: 'Las categorías vienen dadas por el convenio. Una empresa no las declara: hereda las de los convenios que registró.',
  },
  {
    id: 'modalidades-contratacion',
    label: 'Modalidades de Contrato',
    ruta: '/arca/modalidades-contratacion',
    ambito: 'general',
    fuente: 'ARCA',
    descripcionAmbito: 'Tabla general de ARCA, igual para todas las empresas. No se declara por empresa: se elige en el alta de cada relación laboral.',
  },
  {
    id: 'modalidades-liquidacion',
    label: 'Modalidades de Liquidación',
    ruta: '/arca/modalidades-liquidacion',
    ambito: 'general',
    fuente: 'ARCA',
    descripcionAmbito: 'Tabla general de ARCA, igual para todas las empresas. No se declara por empresa: se elige en el alta de cada relación laboral.',
  },
  {
    id: 'tipos-servicio',
    label: 'Tipos de Servicio',
    ruta: '/arca/tipos-servicio',
    ambito: 'general',
    fuente: 'ANSeS',
    descripcionAmbito: 'Tabla de ANSeS, igual para todas las empresas. No se asigna: se elige en el alta de cada empleado.',
  },
  {
    id: 'grupos-tipo-servicio',
    label: 'Grupos de Tipo de Servicio',
    ruta: '/arca/grupos-tipo-servicio',
    ambito: 'general',
    fuente: 'ANSeS',
    descripcionAmbito: 'Tabla de ANSeS, igual para todas las empresas. No se asigna: se elige en el alta de cada empleado.',
  },
  {
    id: 'actividades',
    label: 'Actividades',
    ruta: '/arca/actividades',
    ambito: 'general',
    fuente: 'ARCA',
    descripcionAmbito: 'Catálogo general. En ARCA la actividad se declara dentro de cada domicilio de explotación, no a nivel empresa.',
  },
  {
    id: 'fuentes-paritaria',
    label: 'Fuentes de Paritarias',
    ruta: '/arca/fuentes-paritaria',
    ambito: 'plataforma',
    fuente: 'plataforma',
    descripcionAmbito: 'Dato de la plataforma, no de ARCA. Es del sindicato o del convenio, no de una empresa en particular.',
  },
];

/** Por `id`, para que cada pantalla se pida la suya sin repetir el literal de la ruta. */
export const nomencladorPorId = (id: string): NomencladorArca | undefined => NOMENCLADORES_ARCA.find((n) => n.id === id);

/** Por ruta, para el submenú de la ficha y para resolver desde el router. */
export const nomencladorPorRuta = (ruta: string): NomencladorArca | undefined => NOMENCLADORES_ARCA.find((n) => n.ruta === ruta);

/**
 * El texto del badge. Sale del ámbito y de la fuente, nunca escrito a mano en una pantalla.
 *
 * «Tabla de ARCA» y «Tabla de ANSeS» se distinguen porque el organismo que publica la tabla es lo
 * que decide a quién reclamarle un código que falta.
 */
export const badgeDeAmbito = (n: NomencladorArca): string => {
  if (n.ambito === 'empresa') return 'Por empresa';
  if (n.ambito === 'derivado') return 'Según el convenio';
  if (n.ambito === 'plataforma') return 'Dato de la plataforma';
  return n.fuente === 'ANSeS' ? 'Tabla de ANSeS' : 'Tabla de ARCA';
};

/**
 * Si este nomenclador se DECLARA ante ARCA por CUIT.
 *
 * Es lo que decide si la columna dice «Empresas» —un registro ante el organismo— o «Habilitadas
 * para», que es una preferencia nuestra y no significa nada para ARCA.
 */
export const seDeclaraPorEmpresa = (n: NomencladorArca): boolean => n.ambito === 'empresa';

/**
 * El rótulo de la columna de vínculo con empresas.
 *
 * Los dos existen y hacen falta los dos, pero NO son lo mismo y por eso no pueden llamarse igual:
 * en los de ámbito «empresa» la lista es el padrón que ARCA acepta; en los generales es un recorte
 * para que el combo de un alta no ofrezca 293 opciones cuando la productora usa cuatro.
 */
export const rotuloColumnaEmpresas = (n: NomencladorArca): string => (seDeclaraPorEmpresa(n) ? 'Empresas' : 'Habilitadas para');

/**
 * Las props de encabezado que le tocan a un nomenclador: el badge y la línea explicativa.
 *
 * UN SOLO ELEMENTO POR PANTALLA. El badge dice el ámbito en dos palabras y la línea lo explica en
 * prosa, debajo del título, con el mismo tratamiento que ya tiene el resto. Nada de banner, ícono
 * suelto ni modal: la duda nace mirando la lista —«¿por qué ésta no tiene columna Empresas?»— así
 * que la respuesta va ahí y no en una página de ayuda aparte.
 *
 * El tooltip repite la frase completa porque el badge se trunca en pantallas angostas.
 */
export const encabezadoDeAmbito = (id: string): { badge: { text: string; variant: 'default'; tooltip: string }; subtitle: string } | undefined => {
  const n = nomencladorPorId(id);
  if (!n) return undefined;
  return {
    // `default` es el gris del sistema: el ámbito es una aclaración permanente, no un estado ni una
    // alerta. En color competiría con los avisos que sí piden acción.
    badge: { text: badgeDeAmbito(n), variant: 'default', tooltip: n.descripcionAmbito },
    subtitle: n.descripcionAmbito,
  };
};
