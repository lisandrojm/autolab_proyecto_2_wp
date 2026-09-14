import axios from "./axiosConfig";

/** Cómo se llama el número de la cuenta: un banco da CBU, una billetera virtual CVU. */
export type RotuloCbu = "CBU" | "CVU" | "CBU/CVU";
export const ROTULOS_CBU: RotuloCbu[] = ["CBU", "CVU", "CBU/CVU"];

/** Un tipo de entidad financiera (Entidades Financieras → Tipos). Ver `server/src/utils/tiposEntidadFinanciera.ts`. */
export interface TipoEntidadFinanciera {
  _id: string;
  /** Lo que queda guardado en entidades y personas. Sale del nombre al crear y no se cambia. */
  clave: string;
  nombre: string;
  /** Si se ofrece en los selectores. Quien ya lo tiene cargado lo sigue viendo. */
  activo: boolean;
  pideTipoCuenta: boolean;
  pideNroCuenta: boolean;
  rotuloCbu: RotuloCbu;
  orden: number;
}

export type TipoEntidadPayload = Partial<Pick<TipoEntidadFinanciera, "nombre" | "activo" | "pideTipoCuenta" | "pideNroCuenta" | "rotuloCbu">>;

export const tiposEntidadAPI = {
  async list(): Promise<TipoEntidadFinanciera[]> {
    const { data } = await axios.get("/tipos-entidad-financiera");
    return data.tipos || [];
  },
  async create(payload: TipoEntidadPayload): Promise<TipoEntidadFinanciera> {
    const { data } = await axios.post("/tipos-entidad-financiera", payload);
    return data.tipo;
  },
  async update(id: string, payload: TipoEntidadPayload): Promise<TipoEntidadFinanciera> {
    const { data } = await axios.patch(`/tipos-entidad-financiera/${id}`, payload);
    return data.tipo;
  },
  async remove(id: string): Promise<void> {
    await axios.delete(`/tipos-entidad-financiera/${id}`);
  },
};
