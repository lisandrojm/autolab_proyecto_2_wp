import axios from "./axiosConfig";

/**
 * Un contrato vigente que termina en los próximos 7 días, para decidir si se renueva o se deja vencer.
 *
 * Lo arma el server (`services/contratosPorVencer.ts`): ahí están las reglas de qué contrato entra
 * (ya empezó, dura más de una semana, nadie lo resolvió) y quién lo ve (supervisor del proyecto o
 * coordinador de su área/turno).
 */
export interface ContratoPorVencer {
  userProjectId: string;
  userId: string;
  nombre: string;
  projectId: string;
  proyectoNombre: string;
  clienteNombre: string;
  areaNombre: string;
  turnoNombre: string;
  rolFrame: string;
  contrato: string;
  horario: string;
  /** "YYYY-MM-DD" */
  fechaAlta: string;
  /** "YYYY-MM-DD". Junto con `userProjectId` identifica el contrato. */
  fechaBaja: string;
  /** 0 = vence hoy. */
  diasRestantes: number;
  /** Por qué le aparece a quien mira. */
  motivo: "supervisa" | "coordina";
  /** Ya se había pedido la renovación y la rechazaron o cancelaron: vuelve a estar sin resolver. */
  renovacionRechazada: boolean;
  /** Los datos del contrato con la forma de una solicitud: con esto se abre el formulario ya completo. */
  plantilla: { firstName: string; lastName: string; hireDate?: string; metadata: Record<string, any> };
}

export const contratosPorVencerAPI = {
  async listar(): Promise<ContratoPorVencer[]> {
    const { data } = await axios.get(`/contratos-por-vencer`);
    return Array.isArray(data?.contratos) ? data.contratos : [];
  },

  /** Sólo el número, para el aviso de la tarjeta Contratación del inicio. */
  async contar(): Promise<number> {
    const { data } = await axios.get(`/contratos-por-vencer/count`);
    return Number(data?.count) || 0;
  },

  /** No se renueva: sale de la lista y el contrato termina en su fecha. */
  async dejarVencer(userProjectId: string, fechaBajaContrato: string): Promise<void> {
    await axios.post(`/contratos-por-vencer/dejar-vencer`, { userProjectId, fechaBajaContrato });
  },
};
