import type React from "react";
import { createContext, useContext } from "react";
import type { ContractOverviewRow } from "../../api/users";
import type { AfipRowResult } from "./afipCompleteness";

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

/**
 * VER EL RESUMEN DE UN CONTRATO AL TOCAR SU FILA (02/11/2026, pedido del usuario), como en Solicitudes.
 * El modal lo dibuja `ContractsPage`; las tablas de Gestión lo piden por acá. `alCambiar` refresca la
 * tabla de donde vino si desde el resumen se edita o se borra el contrato.
 */
export type VerContratoEnModal = (record: ContractOverviewRow, alCambiar?: () => void, arca?: ArcaDelContrato) => void;

/**
 * Lo de ARCA que sabe la pestaña Alta temprana (la completitud sale de sus catálogos y la presentación
 * de su empresa): el resumen muestra el estado («Completo», «Faltan 2»…) y, completo, «Forzar Alta».
 * Las dos acciones abren modales de la pestaña: el resumen se cierra antes de llamarlas.
 */
export interface ArcaDelContrato {
  result: AfipRowResult;
  onVerDatos: () => void;
  /** Sólo si está completo. Sin empresa no hay a nombre de quién presentar (`presentarDeshabilitado`). */
  onPresentar?: () => void;
  presentarDeshabilitado?: string;
}

export const VerContratoEnModalContext = createContext<VerContratoEnModal | null>(null);

export const useVerContratoEnModal = (): VerContratoEnModal | null => useContext(VerContratoEnModalContext);

/**
 * El clic de la fila abre el resumen sólo si cayó en la fila misma: no en un botón, link, select o
 * checkbox de sus celdas, ni en un modal que una celda abrió (React propaga los clics de un portal
 * por el árbol de componentes, no por el del DOM).
 */
export const esClicDeLaFila = (e: React.MouseEvent<HTMLElement>): boolean => {
  const destino = e.target as HTMLElement | null;
  if (!destino || !e.currentTarget.contains(destino)) return false;
  if (destino.closest('button, a, input, select, textarea, label, [role="button"], [role="menu"], [role="option"], [contenteditable="true"]')) return false;
  // Seleccionar texto de una celda no es abrir.
  return !window.getSelection()?.toString();
};
