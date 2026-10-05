/**
 * La regla que define cuándo una función FRAME está ROTA.
 *
 * Vive en `utils` y no adentro del script de auditoría porque tiene DOS consumidores: ese script y
 * el endpoint `GET /role-frames/rotas` que alimenta el panel de la pantalla. Si cada uno tuviera su
 * copia, uno de los dos terminaría contando distinto y no habría forma de saber cuál miente — que es
 * exactamente cómo el panel de categorías huérfanas dejó de ver a «Actor».
 */
/**
 * Dónde viven los contratos. El nombre lleva un "&" y NO es `userprojects`: escribirlo de memoria
 * devuelve una colección vacía, y una agregación sobre una colección vacía no falla — reporta cero.
 * Este script llegó a informar "0 contratos afectados" en todas las funciones por eso mismo.
 */
export declare const COLECCION_CONTRATOS = "users_&_projects";
/**
 * La categoría COMO ESTÁ EN LA BASE, no como la sirve la API.
 *
 * El documento crudo tiene `legacyId` y `nombre`. El `data.id` y el `name` que ve el resto de la
 * app los fabrica `utils/categoriaCompat.ts` al aplanar. Leer `data.id` del documento crudo
 * devuelve `undefined` para TODAS, y entonces todas las referencias parecen apuntar a categorías
 * inexistentes: la primera corrida de este script informó 85 de 85 funciones rotas por eso.
 */
export interface CategoriaLean {
    _id: any;
    /** El id numérico con el que la referencian los contratos y las funciones FRAME. */
    legacyId?: number;
    nombre?: string;
    convenio?: string;
    codigoArca?: string;
    /**
     * `false` NO siempre es «dada de baja»: los ALIAS nacen así a propósito —resuelven para los
     * contratos históricos pero no deben ofrecerse al armar uno nuevo— y una función que apunta a un
     * alias está igual de rota, porque le propone a la gente algo que no se elige.
     */
    isActive?: boolean;
    /** Solo en `categorias-sat`, el modelo viejo. */
    data?: {
        id?: number;
        nombre?: string;
    };
}
export interface RolLean {
    _id: any;
    name: string;
    data?: {
        rol?: {
            id?: number;
            nombre?: string;
        };
        categoriasSat?: Array<{
            id?: number;
            nombre?: string;
        }>;
    };
}
/** Cómo quedó cada referencia de una función a una categoría. */
type EstadoRef = "ok" | "fantasma" | "de-baja";
export interface ReferenciaAuditada {
    id: number;
    nombreGuardado: string;
    estado: EstadoRef;
    /** La categoría vigente, si el id resolvió. */
    nombreVigente?: string;
    convenio?: string;
    codigoArca?: string;
}
export interface FuncionAuditada {
    _id: string;
    nombre: string;
    rolId?: number;
    referencias: ReferenciaAuditada[];
    /** Contratos que hoy usan esta función. Es lo que dice si urge. */
    contratos: number;
    /** Convenios distintos entre sus categorías VIGENTES. Más de uno = mezcla. */
    conveniosVigentes: string[];
    rota: boolean;
    motivos: string[];
}
/**
 * Audita el puente. Puro: recibe las tres colecciones ya leídas y no toca la base.
 *
 * Separado de la conexión a propósito — así lo puede usar el endpoint que alimenta el panel de la
 * pantalla sin duplicar la regla, que es exactamente cómo el chequeo de categorías huérfanas y este
 * terminarían diciendo cosas distintas.
 */
export declare function auditarFunciones(roles: RolLean[], categorias: CategoriaLean[], contratosPorRolId: Map<number, number>): FuncionAuditada[];
export {};
