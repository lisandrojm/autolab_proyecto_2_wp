import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHashtag, faAt, faInfoCircle, faLightbulb } from "@fortawesome/free-solid-svg-icons";
import { ContentFormat, Platform } from "../../types/post";
import { getFieldsForFormat, getFormatDescription, getFormatTips, validateFieldValue, FieldConfig, getCharacterLimit } from "../../utils/contentFormatFields";

interface DynamicContentFieldsProps {
  format: ContentFormat;
  platforms: Platform[];
  values: Record<string, any>;
  onChange: (fieldName: string, value: any) => void;
  errors?: Record<string, string>;
}

export const DynamicContentFields: React.FC<DynamicContentFieldsProps> = ({ format, platforms, values, onChange, errors = {} }) => {
  const fields = getFieldsForFormat(format);
  const description = getFormatDescription(format);
  const tips = getFormatTips(format);
  const characterLimit = getCharacterLimit(format, platforms);

  const renderField = (field: FieldConfig) => {
    const value = values[field.name] || "";
    const error = errors[field.name];
    const charCount = typeof value === "string" ? value.length : 0;
    const maxChars = field.maxLength || characterLimit;

    const baseInputClasses = `w-full px-4 py-3 border ${error ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"} rounded focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:text-white`;

    switch (field.type) {
      case "text":
      case "url":
        return (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input type={field.type === "url" ? "url" : "text"} value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={field.placeholder} className={baseInputClasses} maxLength={field.maxLength} />
            {field.hint && (
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{field.hint}</span>
              </div>
            )}
            {field.maxLength && (
              <div className="flex justify-end">
                <span className={`text-xs font-medium ${charCount > field.maxLength * 0.9 ? "text-blue-600 dark:text-blue-400" : "text-gray-500"}`}>
                  {charCount} / {field.maxLength}
                </span>
              </div>
            )}
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          </div>
        );

      case "textarea":
        return (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <textarea value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={field.placeholder} rows={field.rows || 8} className={`${baseInputClasses} resize-none`} maxLength={field.maxLength} />
            <div className="flex items-start justify-between gap-4">
              {field.hint && (
                <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 flex-1">
                  <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{field.hint}</span>
                </div>
              )}
              {field.maxLength && (
                <span className={`text-xs font-medium flex-shrink-0 ${charCount > field.maxLength * 0.9 ? "text-blue-600 dark:text-blue-400" : charCount > field.maxLength ? "text-red-600 dark:text-red-400" : "text-gray-500"}`}>
                  {charCount} / {field.maxLength}
                </span>
              )}
            </div>
            {field.supportsHashtags && field.supportsMentions && <div className="text-xs text-gray-500 dark:text-gray-400 italic">💡 Puedes usar #hashtags y @menciones directamente en el texto</div>}
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          </div>
        );

      case "tags":
        const isHashtags = field.supportsHashtags;
        const isMentions = field.supportsMentions;
        const icon = isHashtags ? faHashtag : isMentions ? faAt : faInfoCircle;
        const symbolHint = field.symbolRequired === false ? `sin el símbolo ${isHashtags ? "#" : "@"}` : `con el símbolo ${isHashtags ? "#" : "@"}`;

        return (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <FontAwesomeIcon icon={icon} className="h-4 w-4" />
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input
              type="text"
              value={Array.isArray(value) ? value.join(", ") : value}
              onChange={(e) => {
                const inputValue = e.target.value;
                const symbol = isHashtags ? "#" : isMentions ? "@" : "";
                const items = inputValue
                  .split(",")
                  .map((item) => item.trim().replace(new RegExp(`^${symbol}`, "g"), ""))
                  .filter(Boolean);
                onChange(field.name, items);
              }}
              placeholder={field.placeholder}
              className={baseInputClasses}
            />
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
              <p className="text-xs text-blue-800 dark:text-blue-300">
                <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 mr-1" />
                <strong>Formato:</strong> {field.hint || `Escribe ${symbolHint}, separados por comas`}
              </p>
              {field.placeholder && (
                <p className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                  <strong>Ejemplo:</strong> {field.placeholder}
                </p>
              )}
            </div>
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          </div>
        );

      case "select":
        return (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <select value={value} onChange={(e) => onChange(field.name, e.target.value)} className={baseInputClasses}>
              <option value="">{field.placeholder || "Selecciona una opción"}</option>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {field.hint && (
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{field.hint}</span>
              </div>
            )}
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          </div>
        );

      case "number":
        return (
          <div key={field.name} className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            <input type="number" value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={field.placeholder} className={baseInputClasses} min={field.minLength} max={field.maxLength} />
            {field.hint && (
              <div className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faInfoCircle} className="h-3 w-3 mt-0.5 flex-shrink-0" />
                <span>{field.hint}</span>
              </div>
            )}
            {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {description && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
          <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">{description}</p>
        </div>
      )}

      {tips.length > 0 && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-4">
          <div className="flex items-start gap-2">
            <FontAwesomeIcon icon={faLightbulb} className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Tips para este formato:</p>
              <ul className="space-y-1">
                {tips.map((tip, index) => (
                  <li key={index} className="text-xs text-blue-700 dark:text-blue-400 flex items-start gap-2">
                    <span className="text-blue-500 dark:text-blue-500 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">{fields.map((field) => renderField(field))}</div>

      {platforms.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-4">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Plataformas seleccionadas:</strong> {platforms.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(", ")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">Límite de caracteres más restrictivo: {characterLimit} caracteres</p>
        </div>
      )}
    </div>
  );
};
