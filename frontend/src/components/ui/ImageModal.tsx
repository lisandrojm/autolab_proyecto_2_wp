import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes } from "@fortawesome/free-solid-svg-icons";

interface ImageModalProps {
  imageUrl: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, alt = "Image", isOpen, onClose }) => {
  if (!isOpen) return null;

  const isPDF = imageUrl.toLowerCase().endsWith(".pdf");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 w-full" onClick={onClose}>
      <div className="relative w-full flex justify-center max-h-[70svh]" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-4 -right-0 p-2 rounded-full text-gray-400" title="Cerrar">
          <FontAwesomeIcon icon={faTimes} className="h-5 w-5" />
        </button>
        {isPDF ? <iframe src={imageUrl} className="w-full h-[90vh] rounded-lg shadow-2xl bg-white" title={alt} /> : <img src={imageUrl} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />}
      </div>
    </div>
  );
};

{
  /* Modal de imagen en pantalla completa */
}
