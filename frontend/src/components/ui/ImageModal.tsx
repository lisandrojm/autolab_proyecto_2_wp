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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4" onClick={onClose}>
      <div className="relative max-w-7xl max-h-full z-50" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-4 -right-4 p-2 rounded-full text-gray-500  transition-colors shadow-lg z-10" title="Cerrar">
          <FontAwesomeIcon icon={faTimes} className="h-5 w-5" />
        </button>
        <img src={imageUrl} alt={alt} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
      </div>
    </div>
  );
};
