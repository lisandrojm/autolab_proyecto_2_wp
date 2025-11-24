import React from "react";
import { Modal } from "./Modal";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  informacionText: string;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, onClose, onConfirm, informacionText }) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confirmación del Pedido"
      size="md"
      footer={
        <div className="flex gap-3 w-full">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 transition-colors font-medium"
          >
            Aceptar
          </button>
        </div>
      }
    >
      <div className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
        {informacionText}
      </div>
    </Modal>
  );
};
