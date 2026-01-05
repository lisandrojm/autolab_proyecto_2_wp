import React, { useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCamera, faImage, faTimes, faSpinner } from "@fortawesome/free-solid-svg-icons";

interface ImageUploaderProps {
  value?: string | File;
  onChange: (file: File | null) => void;
  onRemove?: () => void;
  disabled?: boolean;
  showPreview?: boolean;
  acceptCamera?: boolean;
  acceptGallery?: boolean;
  maxSizeMB?: number;
  className?: string;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({ value, onChange, onRemove, disabled = false, showPreview = true, acceptCamera = true, acceptGallery = true, maxSizeMB = 10, className = "" }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (value) {
      if (typeof value === "string") {
        setPreview(value);
      } else if (value instanceof File) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setPreview(reader.result as string);
        };
        reader.readAsDataURL(value);
      }
    } else {
      setPreview(null);
    }
  }, [value]);

  const validateFile = (file: File): boolean => {
    const maxSize = maxSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      setError(`La imagen debe ser menor a ${maxSizeMB}MB`);
      return false;
    }

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)");
      return false;
    }

    setError(null);
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      setLoading(true);
      setTimeout(() => {
        onChange(file);
        setLoading(false);
      }, 100);
    }
  };

  const handleRemove = () => {
    setPreview(null);
    setError(null);
    onChange(null);
    if (onRemove) onRemove();
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (cameraInputRef.current) cameraInputRef.current.value = "";
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {error && (
        <div className="rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {showPreview && preview && (
        <div className="relative rounded overflow-hidden border-2 border-gray-300 dark:border-gray-600">
          <img src={preview} alt="Preview" className="w-full h-48 object-cover" />
          {!disabled && (
            <button type="button" onClick={handleRemove} className="absolute top-2 right-2 p-2 rounded bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg" title="Eliminar imagen">
              <FontAwesomeIcon icon={faTimes} className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {!preview && !loading && (
        <div className="flex gap-3">
          {acceptCamera && (
            <>
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} disabled={disabled} className="hidden" />
              <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={disabled} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 py-6 px-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={faCamera} className="h-8 w-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Tomar Foto</span>
              </button>
            </>
          )}

          {acceptGallery && (
            <>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} disabled={disabled} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled} className="flex-1 flex flex-col items-center justify-center gap-2 rounded border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 py-6 px-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <FontAwesomeIcon icon={faImage} className="h-8 w-8 text-gray-400" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Subir Imagen</span>
              </button>
            </>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-blue-500" />
        </div>
      )}
    </div>
  );
};
