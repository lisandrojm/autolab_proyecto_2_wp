import React from "react";
import { Mail, Paperclip } from "lucide-react";
import { EmailConfig } from "../../types/post";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";

interface EmailPreviewProps {
  config: Partial<EmailConfig>;
  images?: string[];
}

export const EmailPreview: React.FC<EmailPreviewProps> = ({ config, images = [] }) => {
  const hasAttachments = (images && images.length > 0) || (config.attachments && config.attachments.length > 0);

  const renderEmailBody = () => {
    if (config.bodyHtml) {
      return <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: config.bodyHtml }} />;
    }

    return <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">{config.body || "El contenido del email aparecerá aquí..."}</div>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5" />
          Vista Previa del Email
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Así es como los destinatarios verán tu email</p>
      </div>

      <div className="bg-gray-100 dark:bg-gray-900 rounded p-6 space-y-4">
        <div className="bg-white dark:bg-gray-800 rounded shadow-lg overflow-hidden max-w-3xl mx-auto">
          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">De: {config.replyTo || "noreply@ejemplo.com"}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Para: {config.recipients && config.recipients.length > 0 ? config.recipients.slice(0, 3).join(", ") + (config.recipients.length > 3 ? ` y ${config.recipients.length - 3} más` : "") : "destinatarios@ejemplo.com"}</div>
            {config.cc && config.cc.length > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                CC: {config.cc.slice(0, 2).join(", ")}
                {config.cc.length > 2 && ` y ${config.cc.length - 2} más`}
              </div>
            )}
          </div>

          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{config.subject || "Asunto del email"}</h2>
            {hasAttachments && (
              <div className="flex items-center gap-2 mt-2 text-sm text-gray-500 dark:text-gray-400">
                <Paperclip className="h-4 w-4" />
                <span>
                  {images.length > 0 && `${images.length} imagen${images.length > 1 ? "es" : ""}`}
                  {images.length > 0 && config.attachments && config.attachments.length > 0 && ", "}
                  {config.attachments && config.attachments.length > 0 && `${config.attachments.length} archivo${config.attachments.length > 1 ? "s" : ""}`}
                </span>
              </div>
            )}
          </div>

          <div className="px-6 py-6">
            {renderEmailBody()}

            {images && images.length > 0 && (
              <div className="mt-6 space-y-3">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Imágenes adjuntas:</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {images.slice(0, 6).map((img, index) => (
                    <div key={index} className="aspect-video rounded overflow-hidden bg-gray-100 dark:bg-gray-700">
                      <img src={img} alt={`Adjunto ${index + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
                {images.length > 6 && (
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    y {images.length - 6} imagen{images.length - 6 > 1 ? "es" : ""} más...
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 px-6 py-3 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">Este es un email enviado por tu aplicación</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
        <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Información del Email</h4>
        <div className="space-y-1 text-sm text-blue-700 dark:text-blue-300">
          <div>
            <strong>Destinatarios:</strong> {config.recipients?.length || 0}
          </div>
          {config.cc && config.cc.length > 0 && (
            <div>
              <strong>CC:</strong> {config.cc.length}
            </div>
          )}
          {config.bcc && config.bcc.length > 0 && (
            <div>
              <strong>BCC:</strong> {config.bcc.length}
            </div>
          )}
          <div>
            <strong>Tipo:</strong> {config.bodyHtml ? "HTML" : "Texto Plano"}
          </div>
          {hasAttachments && (
            <div>
              <strong>Adjuntos:</strong> {images.length + (config.attachments?.length || 0)}
            </div>
          )}
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
        <div className="flex gap-2 text-sm text-blue-800 dark:text-blue-300">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 text-blue-300" />
          <div>
            <strong>Nota:</strong> Esta es una vista previa aproximada. La apariencia puede variar según el cliente de email del destinatario (Gmail, Outlook, etc.)
          </div>
        </div>
      </div>
    </div>
  );
};
