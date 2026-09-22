import axios from "./axiosConfig";

export interface RoleFrameItem {
  _id: string;
  externalId: string;
  data: {
    rol: {
      id: number;
      nombre: string;
    };
    /** Cada ítem es la copia de la categoría + lo de la asociación: `valoracionId`. */
    categoriasSat: Array<{ id?: number; nombre?: string; codigoAfip?: number; sueldoBruto?: number; valoracionId?: string | null; [k: string]: unknown }>;
  };
  name: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Una función FRAME que ya no puede proponer una categoría válida.
 *
 * Lo calcula el server con la MISMA regla que el script de auditoría
 * (`utils/auditoriaFuncionesFrame.ts`): si el panel y el script contaran distinto, uno de los dos
 * estaría mintiendo y no habría forma de saber cuál.
 */
export interface FuncionRota {
  _id: string;
  nombre: string;
  rolId?: number;
  /** Cuántos contratos usan esta función. Es lo que decide si urge o si puede esperar. */
  contratos: number;
  conveniosVigentes: string[];
  /** En castellano y listos para mostrar: qué le falta y por qué. */
  motivos: string[];
}

/**
 * Una categoría asociada a una función, con su valoración.
 *
 * Reemplaza al `categoryIds: string[]` de antes: la valoración es una propiedad de la ASOCIACIÓN
 * —el mismo código de ARCA puede ser Oro en una función y Plata en otra— y en una lista de ids no
 * había dónde ponerla. `null` es «sin valorar», que es un estado válido: el filtro de contratación
 * no se aplica hasta que la función tenga sus categorías valoradas.
 */
export interface CategoriaAsociada {
  categoryId: string;
  valoracionId?: string | null;
}

/** Cobertura de valoraciones de una función: qué niveles puede atender y cuáles no. */
export interface CoberturaFuncion {
  _id: string;
  nombre: string;
  categorias: number;
  sinValorar: number;
  cubre: Array<{ _id: string; name: string; orden: number | null; color: string }>;
  faltan: Array<{ _id: string; name: string; orden: number | null; color: string }>;
  totalValoraciones: number;
}

class RoleFrameAPI {
  async list(): Promise<RoleFrameItem[]> {
    const { data } = await axios.get("/role-frames");
    return data;
  }

  /** Las funciones sin categoría válida, ordenadas por contratos afectados. */
  async rotas(): Promise<FuncionRota[]> {
    const { data } = await axios.get("/role-frames/rotas");
    return data;
  }

  async create(payload: { name: string; categorias: CategoriaAsociada[] }): Promise<RoleFrameItem> {
    const { data } = await axios.post("/role-frames", payload);
    return data;
  }

  async update(id: string, payload: { name?: string; categorias?: CategoriaAsociada[] }): Promise<RoleFrameItem> {
    const { data } = await axios.put(`/role-frames/${id}`, payload);
    return data;
  }

  /** Por función: qué valoraciones cubre y cuáles le faltan, según las del tenant. */
  async cobertura(): Promise<CoberturaFuncion[]> {
    const { data } = await axios.get("/role-frames/cobertura");
    return data;
  }

  async remove(id: string): Promise<any> {
    const { data } = await axios.delete(`/role-frames/${id}`);
    return data;
  }
}

export const roleFrameAPI = new RoleFrameAPI();
