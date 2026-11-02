import { createContext, useContext } from "react";

/**
 * EDITAR UN CONTRATO SIN SALIR DE CONTRATOS (01/11/2026, pedido del usuario).
 *
 * El lápiz de cada fila llevaba a Gestionar Equipo del proyecto y abría ahí el wizard: se perdía la
 * pantalla, los filtros y la pestaña. Ahora la pantalla que lo ofrece (Contratos) abre el MISMO wizard
 * encima, como Solicitudes al aprobar, y al guardar refresca lo que se estaba mirando.
 *
 * Sólo el contexto vive acá: el modal lo dibuja quien lo provee (`ContractsPage`). Importar el wizard
 * desde este módulo lo volvería circular (el wizard usa las celdas de Contratos que usan esto).
 * Sin proveedor —la misma fila en otra pantalla— el lápiz sigue yendo al equipo como siempre.
 */
export interface ContratoAEditar {
  projectId: string;
  userId: string;
  contractIndex: number;
}

export type EditarContratoEnModal = (contrato: ContratoAEditar, alGuardar?: () => void) => void;

export const EditarContratoEnModalContext = createContext<EditarContratoEnModal | null>(null);

export const useEditarContratoEnModal = (): EditarContratoEnModal | null => useContext(EditarContratoEnModalContext);
