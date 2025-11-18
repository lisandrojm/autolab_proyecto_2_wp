import React from "react";
import { Modal } from "./ui/Modal";
import { AIAssistantChat } from "./AIAssistantChat";
import { useAssistantStore } from "../stores/assistantStore";

export const AIAssistantModal: React.FC = () => {
  const { isOpen, closeAssistant, clearMessages } = useAssistantStore();

  const handleClose = () => {
    closeAssistant();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Asistente IA" subtitle="Tu asistente personal para marketing y creatividad" size="fullscreen" zIndex={60}>
      <AIAssistantChat />
    </Modal>
  );
};
