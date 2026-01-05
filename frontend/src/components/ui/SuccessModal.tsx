import React, { useEffect } from "react";
import { Modal } from "./Modal";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheckCircle } from "@fortawesome/free-solid-svg-icons";

interface SuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  email?: string;
  autoCloseDelay?: number;
}

export const SuccessModal: React.FC<SuccessModalProps> = ({ isOpen, onClose, title, message, email, autoCloseDelay }) => {
  useEffect(() => {
    if (isOpen && autoCloseDelay && autoCloseDelay > 0) {
      const timer = setTimeout(() => {
        onClose();
      }, autoCloseDelay);

      return () => clearTimeout(timer);
    }
  }, [isOpen, autoCloseDelay, onClose]);

  const footer = (
    <div className="flex items-center justify-center">
      <button type="button" onClick={onClose} className="btn-primary px-6 py-2">
        Continuar
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md" footer={footer}>
      <div className="text-center py-4">
        <div className="flex justify-center mb-4">
          <div className="rounded bg-blue-100 dark:bg-blue-900/20 p-3">
            <FontAwesomeIcon icon={faCheckCircle} className="h-12 w-12 text-blue-600 dark:text-blue-400" />
          </div>
        </div>

        <p className="text-base text-gray-700 dark:text-gray-300 mb-4">{message}</p>

        {email && (
          <div className="bg-gray-50 dark:bg-gray-900/40 rounded p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Credenciales de acceso:</p>
            <div className="space-y-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                <span className="text-gray-600 dark:text-gray-400">Email:</span> {email}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">Contraseña: La que ingresaste en el registro</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
