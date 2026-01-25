import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faMinus } from "@fortawesome/free-solid-svg-icons";

interface DynamicFieldArrayProps {
  label: string;
  fields: any[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  renderField: (field: any, index: number) => React.ReactNode;
  addButtonText?: string;
  minFields?: number;
}

export const DynamicFieldArray: React.FC<DynamicFieldArrayProps> = ({ label, fields, onAdd, onRemove, renderField, addButtonText = "Agregar", minFields = 0 }) => {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <div className="space-y-2">
        {fields.map((field, index) => (
          <div key={field.id || index} className="flex items-center space-x-2">
            {renderField(field, index)}
            {fields.length > minFields && (
              <button type="button" onClick={() => onRemove(index)} className="p-2 text-red-600 hover:text-gray-800 dark:hover:text-gray-300 rounded transition-colors">
                <FontAwesomeIcon icon={faMinus} className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={onAdd} className="flex items-center space-x-2 text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 transition-colors">
          <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
          <span className="text-sm">{addButtonText}</span>
        </button>
      </div>
    </div>
  );
};
