import React from "react";
import type {
  TipoAccionFutura,
  ResponsableAccion,
  QuienDefineVencimiento,
} from "../../types/futureAction";
import {
  tipoAccionFuturaLabels,
  responsableAccionLabels,
} from "../../types/futureAction";

interface FutureActionFieldsProps {
  tipoAccionFutura: TipoAccionFutura;
  onTipoChange: (tipo: TipoAccionFutura) => void;
  descripcionAccion: string;
  onDescripcionChange: (desc: string) => void;
  responsableAccion: ResponsableAccion;
  onResponsableChange: (resp: ResponsableAccion) => void;
  plazoDias?: number;
  onPlazoDiasChange: (dias: number) => void;
  fechaLimite?: string;
  onFechaLimiteChange: (fecha: string) => void;
  documentoRequerido?: string;
  onDocumentoRequeridoChange: (doc: string) => void;
  quienDefineVencimiento?: QuienDefineVencimiento;
  onQuienDefineVencimientoChange: (quien: QuienDefineVencimiento) => void;
}

export const FutureActionFields: React.FC<FutureActionFieldsProps> = ({
  tipoAccionFutura,
  onTipoChange,
  descripcionAccion,
  onDescripcionChange,
  responsableAccion,
  onResponsableChange,
  plazoDias,
  onPlazoDiasChange,
  fechaLimite,
  onFechaLimiteChange,
  documentoRequerido,
  onDocumentoRequeridoChange,
  quienDefineVencimiento,
  onQuienDefineVencimientoChange,
}) => {
  const renderConditionalFields = () => {
    switch (tipoAccionFutura) {
      case "plazoDias":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Plazo en Días *
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={plazoDias || ""}
              onChange={(e) => onPlazoDiasChange(parseInt(e.target.value) || 0)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder="Ej: 10"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              El sistema calculará automáticamente la fecha límite
            </p>
          </div>
        );

      case "fechaEspecifica":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fecha Límite *
            </label>
            <input
              type="date"
              value={fechaLimite || ""}
              onChange={(e) => onFechaLimiteChange(e.target.value)}
              required
              min={new Date().toISOString().split("T")[0]}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        );

      case "presentacionDocumento":
        return (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Documento Requerido *
              </label>
              <input
                type="text"
                value={documentoRequerido || ""}
                onChange={(e) => onDocumentoRequeridoChange(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="Ej: DNI escaneado, Certificado médico..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Fecha Límite (Opcional)
              </label>
              <input
                type="date"
                value={fechaLimite || ""}
                onChange={(e) => onFechaLimiteChange(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>
        );

      case "vencimientoSistema":
        return (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Plazo Predefinido (Días) *
            </label>
            <input
              type="number"
              min="1"
              max="365"
              value={plazoDias || 7}
              onChange={(e) => onPlazoDiasChange(parseInt(e.target.value) || 7)}
              required
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              El sistema define automáticamente este plazo según reglas internas
            </p>
          </div>
        );

      case "vencimientoInterno":
        return (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Un área interna debe evaluar y asignar una fecha de vencimiento. El pedido
              quedará en estado "En Revisión" hasta que se cargue la fecha límite.
            </p>
          </div>
        );

      case "sinVencimiento":
        return (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-sm text-slate-700 dark:text-slate-200">
              No tiene fecha límite, pero debe ser gestionada y marcada como cumplida
              manualmente.
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        Configuración de Acción Futura
      </h3>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Tipo de Acción *
        </label>
        <select
          value={tipoAccionFutura}
          onChange={(e) => onTipoChange(e.target.value as TipoAccionFutura)}
          required
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {Object.entries(tipoAccionFuturaLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Descripción de la Acción *
        </label>
        <textarea
          value={descripcionAccion}
          onChange={(e) => onDescripcionChange(e.target.value)}
          required
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
          placeholder="Describe qué debe hacer el responsable..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
          Responsable *
        </label>
        <select
          value={responsableAccion}
          onChange={(e) => onResponsableChange(e.target.value as ResponsableAccion)}
          required
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          {Object.entries(responsableAccionLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {renderConditionalFields()}
    </div>
  );
};
