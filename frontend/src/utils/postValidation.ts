import { ContentFormat } from "../types/post";
import { getFieldsForFormat, validateFieldValue } from "./contentFormatFields";

export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  missingFields: string[];
}

export function validateDynamicFieldsForFormat(format: ContentFormat | undefined, dynamicFields: Record<string, any>): ValidationResult {
  const errors: Record<string, string> = {};
  const missingFields: string[] = [];

  if (!format) {
    return {
      isValid: false,
      errors: { format: "Debes seleccionar un formato de contenido" },
      missingFields: ["format"],
    };
  }

  const fields = getFieldsForFormat(format);

  fields.forEach((field) => {
    const value = dynamicFields?.[field.name];
    const validation = validateFieldValue(field, value);

    if (!validation.valid) {
      errors[field.name] = validation.error || `${field.label} es inválido`;
      if (field.required) {
        missingFields.push(field.label);
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    missingFields,
  };
}

export function hasRequiredDynamicFields(format: ContentFormat | undefined, dynamicFields: Record<string, any>): boolean {
  if (!format) return false;

  const fields = getFieldsForFormat(format);
  const requiredFields = fields.filter((f) => f.required);

  return requiredFields.every((field) => {
    const value = dynamicFields?.[field.name];

    if (field.type === "tags") {
      return Array.isArray(value) ? true : false;
    }

    if (typeof value === "string") {
      return value.trim().length > 0;
    }

    return !!value;
  });
}

export function getRequiredFieldsStatus(format: ContentFormat | undefined, dynamicFields: Record<string, any>): { completed: number; total: number; fieldNames: string[] } {
  if (!format) {
    return { completed: 0, total: 0, fieldNames: [] };
  }

  const fields = getFieldsForFormat(format);
  const requiredFields = fields.filter((f) => f.required);

  let completed = 0;
  const fieldNames: string[] = [];

  requiredFields.forEach((field) => {
    const value = dynamicFields?.[field.name];
    let isCompleted = false;

    if (field.type === "tags") {
      isCompleted = Array.isArray(value) && value.length > 0;
    } else if (typeof value === "string") {
      isCompleted = value.trim().length > 0;
    } else {
      isCompleted = !!value;
    }

    if (isCompleted) {
      completed++;
    }

    fieldNames.push(field.label);
  });

  return {
    completed,
    total: requiredFields.length,
    fieldNames,
  };
}
