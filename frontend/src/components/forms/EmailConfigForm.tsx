import React, { useState } from "react";
import { Mail, X, Plus, User, Copy, Eye } from "lucide-react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faAt, faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { EmailConfig } from "../../types/post";

interface EmailConfigFormProps {
  config: Partial<EmailConfig>;
  onChange: (config: Partial<EmailConfig>) => void;
}

export const EmailConfigForm: React.FC<EmailConfigFormProps> = ({ config, onChange }) => {
  const [recipientInput, setRecipientInput] = useState("");
  const [ccInput, setCcInput] = useState("");
  const [bccInput, setBccInput] = useState("");
  const [viewMode, setViewMode] = useState<"plain" | "html">("plain");

  const handleAddRecipient = () => {
    if (!recipientInput.trim()) return;

    const emails = recipientInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && isValidEmail(e));
    if (emails.length === 0) return;

    onChange({
      ...config,
      recipients: [...(config.recipients || []), ...emails],
    });
    setRecipientInput("");
  };

  const handleRemoveRecipient = (index: number) => {
    const newRecipients = [...(config.recipients || [])];
    newRecipients.splice(index, 1);
    onChange({ ...config, recipients: newRecipients });
  };

  const handleAddCC = () => {
    if (!ccInput.trim()) return;

    const emails = ccInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && isValidEmail(e));
    if (emails.length === 0) return;

    onChange({
      ...config,
      cc: [...(config.cc || []), ...emails],
    });
    setCcInput("");
  };

  const handleRemoveCC = (index: number) => {
    const newCC = [...(config.cc || [])];
    newCC.splice(index, 1);
    onChange({ ...config, cc: newCC });
  };

  const handleAddBCC = () => {
    if (!bccInput.trim()) return;

    const emails = bccInput
      .split(",")
      .map((e) => e.trim())
      .filter((e) => e && isValidEmail(e));
    if (emails.length === 0) return;

    onChange({
      ...config,
      bcc: [...(config.bcc || []), ...emails],
    });
    setBccInput("");
  };

  const handleRemoveBCC = (index: number) => {
    const newBCC = [...(config.bcc || [])];
    newBCC.splice(index, 1);
    onChange({ ...config, bcc: newBCC });
  };

  const isValidEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <FontAwesomeIcon icon={faEnvelope} className="mr-2" />
          Asunto del Email *
        </label>
        <input type="text" value={config.subject || ""} onChange={(e) => onChange({ ...config, subject: e.target.value })} placeholder="Ej: Nuevas ofertas exclusivas para ti" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
        <p className="text-xs text-gray-500 mt-1">Caracteres: {(config.subject || "").length} (recomendado: 30-50 caracteres)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <FontAwesomeIcon icon={faAt} className="mr-2" />
          Destinatarios *
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="email"
            value={recipientInput}
            onChange={(e) => setRecipientInput(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddRecipient();
              }
            }}
            placeholder="correo@ejemplo.com (separados por coma)"
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
          />
          <button type="button" onClick={handleAddRecipient} className="px-4 py-2 bg-primary-600 text-white rounded hover:bg-primary-700 transition-colors flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Agregar
          </button>
        </div>
        {config.recipients && config.recipients.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {config.recipients.map((email, index) => (
              <span key={index} className="inline-flex items-center gap-1 px-3 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded text-sm">
                {email}
                <button type="button" onClick={() => handleRemoveRecipient(index)} className="hover:text-primary-900 dark:hover:text-primary-100">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-500 mt-1">{config.recipients?.length || 0} destinatario(s)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Copy className="inline h-4 w-4 mr-2" />
            CC (Con Copia)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              value={ccInput}
              onChange={(e) => setCcInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddCC();
                }
              }}
              placeholder="correo@ejemplo.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <button type="button" onClick={handleAddCC} className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {config.cc && config.cc.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {config.cc.map((email, index) => (
                <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                  {email}
                  <button type="button" onClick={() => handleRemoveCC(index)} className="hover:text-gray-900 dark:hover:text-gray-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            <Eye className="inline h-4 w-4 mr-2" />
            BCC (Copia Oculta)
          </label>
          <div className="flex gap-2 mb-2">
            <input
              type="email"
              value={bccInput}
              onChange={(e) => setBccInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddBCC();
                }
              }}
              placeholder="correo@ejemplo.com"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white"
            />
            <button type="button" onClick={handleAddBCC} className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {config.bcc && config.bcc.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {config.bcc.map((email, index) => (
                <span key={index} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                  {email}
                  <button type="button" onClick={() => handleRemoveBCC(index)} className="hover:text-gray-900 dark:hover:text-gray-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          <User className="inline h-4 w-4 mr-2" />
          Responder a (Reply-To)
        </label>
        <input type="email" value={config.replyTo || ""} onChange={(e) => onChange({ ...config, replyTo: e.target.value })} placeholder="respuestas@ejemplo.com" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white" />
        <p className="text-xs text-gray-500 mt-1">Email donde se recibirán las respuestas (opcional)</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Contenido del Email *</label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setViewMode("plain")} className={`px-3 py-1 text-xs rounded ${viewMode === "plain" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
              Texto Plano
            </button>
            <button type="button" onClick={() => setViewMode("html")} className={`px-3 py-1 text-xs rounded ${viewMode === "html" ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"}`}>
              HTML
            </button>
          </div>
        </div>

        {viewMode === "plain" ? (
          <textarea value={config.body || ""} onChange={(e) => onChange({ ...config, body: e.target.value })} placeholder="Escribe el contenido de tu email aquí..." rows={12} className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none font-mono text-sm" />
        ) : (
          <textarea
            value={config.bodyHtml || config.body || ""}
            onChange={(e) =>
              onChange({
                ...config,
                bodyHtml: e.target.value,
                body: e.target.value,
              })
            }
            placeholder="<html>&#10;  <body>&#10;    <h1>¡Hola!</h1>&#10;    <p>Tu contenido HTML aquí...</p>&#10;  </body>&#10;</html>"
            rows={12}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white resize-none font-mono text-sm"
          />
        )}
        <p className="text-xs text-gray-500 mt-1">{(viewMode === "html" ? config.bodyHtml || config.body || "" : config.body || "").length} caracteres</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faLightbulb} className="text-blue-500 dark:text-blue-300" />
          <p className="text-sm text-blue-800 dark:text-blue-300">Las imágenes agregadas en la sección "Multimedia" se insertarán en el cuerpo del email.</p>
        </div>
      </div>
    </div>
  );
};
