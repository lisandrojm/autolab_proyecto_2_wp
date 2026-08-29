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
export const COLECCION_CONTRATOS = "users_&_projects";

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
  data?: { id?: number; nombre?: string };
}

export interface RolLean {
  _id: any;
  name: string;
  data?: { rol?: { id?: number; nombre?: string }; categoriasSat?: Array<{ id?: number; nombre?: string }> };
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
export function auditarFunciones(roles: RolLean[], categorias: CategoriaLean[], contratosPorRolId: Map<number, number>): FuncionAuditada[] {
  const porLegacyId = new Map<number, CategoriaLean>();
  for (const c of categorias) {
    // `legacyId` en el modelo nuevo, `data.id` en `categorias-sat`. Se aceptan los dos por lo mismo
    // que `resolverCategoriasCompatPorId`: hay datos guardados de antes de la migración.
    const id = c.legacyId ?? c.data?.id;
    // El primero gana: ver el comentario del orden en `run()`.
    if (id != null && !porLegacyId.has(Number(id))) porLegacyId.set(Number(id), c);
  }

  return roles.map((rol) => {
    const guardadas = Array.isArray(rol.data?.categoriasSat) ? rol.data!.categoriasSat! : [];
    const referencias: ReferenciaAuditada[] = guardadas.map((g) => {
      const id = Number(g?.id);
      const vigente = porLegacyId.get(id);
      if (!vigente) return { id, nombreGuardado: String(g?.nombre || ""), estado: "fantasma" as const };
      const nombreVigente = vigente.nombre || vigente.data?.nombre || "";
      return {
        id,
        nombreGuardado: String(g?.nombre || ""),
        // `isActive` puede venir `undefined` en documentos viejos: el default del esquema es `true`,
        // así que ausente significa activa. Tratarlo como baja marcaría media base como rota.
        estado: vigente.isActive === false ? ("de-baja" as const) : ("ok" as const),
        nombreVigente,
        convenio: vigente.convenio,
        codigoArca: vigente.codigoArca,
      };
    });

    const vigentes = referencias.filter((r) => r.estado === "ok");
    const conveniosVigentes = [...new Set(vigentes.map((r) => r.convenio).filter(Boolean) as string[])].sort();

    const motivos: string[] = [];
    const fantasmas = referencias.filter((r) => r.estado === "fantasma");
    const deBaja = referencias.filter((r) => r.estado === "de-baja");
    if (fantasmas.length) motivos.push(`${fantasmas.length} categoría(s) que no existen: ${fantasmas.map((r) => `id ${r.id}${r.nombreGuardado ? ` «${r.nombreGuardado}»` : ""}`).join(", ")}`);
    if (deBaja.length) motivos.push(`${deBaja.length} categoría(s) dadas de baja: ${deBaja.map((r) => `${r.codigoArca || `id ${r.id}`} «${r.nombreGuardado}»`).join(", ")}`);
    if (vigentes.length === 0) motivos.push("no le queda ninguna categoría válida para proponer");
    if (conveniosVigentes.length > 1) motivos.push(`mezcla convenios: ${conveniosVigentes.join(", ")}`);

    return {
      _id: String(rol._id),
      nombre: rol.name,
      rolId: rol.data?.rol?.id,
      referencias,
      contratos: contratosPorRolId.get(Number(rol.data?.rol?.id)) || 0,
      conveniosVigentes,
      // La MEZCLA sola no rompe: hay funciones legítimamente presentes en dos convenios. Lo que rompe
      // es no tener nada válido que proponer.
      rota: vigentes.length === 0 || fantasmas.length > 0 || deBaja.length > 0,
      motivos,
    };
  });
}

