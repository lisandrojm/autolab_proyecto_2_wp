/**
 * El tercer agujero de la familia: CONTRATOS que apuntan a una categoría que no existe.
 *
 * Los otros dos ya tienen su chequeo y su panel:
 *
 *   1. Categoría sin convenio ni código      → `GET /arca/categorias/huerfanas`
 *   2. Función FRAME sin categoría válida    → `GET /role-frames/rotas`
 *   3. Contrato con puntero a la nada        → esto
 *
 * POR QUÉ NINGUNO DE LOS DOS PRIMEROS LO VEÍA
 *
 * El panel de huérfanas recorre CATEGORÍAS y se pregunta si les falta algo. Un puntero a un id que no
 * existe se le escapa por definición: no hay categoría que listar. Y el panel de funciones cuenta
 * contratos POR FUNCIÓN, así que los 164 del `legacyId 43` aparecían sumados a los 322 de «Mezclador
 * de Control Central» bajo un solo número de «Director de Programas» — 485 contratos, ningún aviso.
 *
 * Sobrevivió a todas las revisiones porque cada pantalla miraba desde un lado por el que no se veía.
 *
 * QUÉ SIGNIFICA ESTAR ROTO ACÁ
 *
 * El contrato guarda `categoria_sat_id`, un número. Si ese número no resuelve, el alta no tiene
 * categoría profesional: el TXT sale sin las posiciones 101-106 y ARCA lo rechaza. No es un problema
 * futuro como el de las funciones —que rompe el PRÓXIMO contrato— sino uno presente: esos contratos
 * ya existen y hoy no se pueden generar.
 */
export interface CategoriaParaPuntero {
    legacyId?: number;
    nombre?: string;
    data?: {
        id?: number;
        nombre?: string;
    };
}
export interface ContratoHuerfano {
    /** El id que el contrato guarda y que no resuelve. */
    categoriaSatId: number;
    /** El nombre que quedó denormalizado en el contrato. Es la mejor pista de a qué apuntaba. */
    nombreGuardado: string;
    rolFrameId: number | null;
    /** Para poder encontrarlo: documento de `users_&_projects` y posición en `contracts[]`. */
    userProjectId: string;
    indice: number;
    userId: string;
    proyecto: string;
}
export interface ResumenPunteros {
    total: number;
    /** Agrupados por el id que no resuelve, de mayor a menor. Es lo que dice si hay UN caso o muchos. */
    porCategoria: Array<{
        categoriaSatId: number;
        nombreGuardado: string;
        contratos: number;
        roles: Array<{
            rolFrameId: number | null;
            nombre: string;
            contratos: number;
        }>;
    }>;
    contratos: ContratoHuerfano[];
}
/** Todos los ids de categoría que SÍ resuelven, mirando los dos modelos como hace `categoriaCompat`. */
export declare function idsDeCategoriasExistentes(categorias: CategoriaParaPuntero[]): Set<number>;
/**
 * Los contratos cuyo `categoria_sat_id` no resuelve.
 *
 * Puro: recibe lo ya leído. Lo comparten el script de auditoría y el endpoint que alimenta el panel,
 * por la misma razón que la regla de las funciones — si contaran distinto, uno de los dos estaría
 * mintiendo y no habría forma de saber cuál.
 *
 * Los contratos SIN categoría (`null`) no cuentan acá: es un estado legítimo de un contrato a medio
 * cargar, y mezclarlo taparía los punteros rotos, que son otra cosa.
 */
export declare function auditarPunteros(userProjects: Array<{
    _id: any;
    userId?: any;
    nombre_proyecto?: string;
    contracts?: Array<any>;
}>, categorias: CategoriaParaPuntero[], nombrePorRolId?: Map<number, string>): ResumenPunteros;
