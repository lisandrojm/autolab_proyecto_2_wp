import React, { useEffect, useState } from "react";
import { infoAPI, InfoItem } from "../../../../api/info";
import { roleFrameAPI } from "../../../../api/roleFrames";
import { useProfile } from "../hooks/useProfile";
import { PERSONAL_DATA_FIELDS, PERSONAL_DATA_SECTION_LABELS, PersonalDataSection, PersonalDataField, CATALOG_TO_INFO_TYPE, ESTADO_CIVIL_OPTIONS } from "../../../../config/personalDataFields";

interface PersonalDataFormProps {
  enabledKeys: string[];
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
}

const inputClass = "w-full rounded border bg-white dark:border-slate-700 dark:bg-slate-800 px-3 py-2 text-sm";

export const PersonalDataForm: React.FC<PersonalDataFormProps> = ({ enabledKeys, value, onChange }) => {
  const { profile } = useProfile();
  const [catalogs, setCatalogs] = useState<Record<string, InfoItem[]>>({});
  const [roleFrames, setRoleFrames] = useState<Array<{ _id: string; name: string }>>([]);

  const fields: PersonalDataField[] = PERSONAL_DATA_FIELDS.filter((f) => enabledKeys.includes(f.key));

  // Valor ORIGINAL del usuario (se muestra en el input, pero NO se envía si no cambió).
  const originalFor = (field: PersonalDataField): any => {
    const meta: any = (profile as any)?.metadata || {};
    switch (field.key) {
      case "nombre":
        return meta.nombre ?? (profile as any)?.firstName ?? "";
      case "apellido":
        return meta.apellido ?? (profile as any)?.lastName ?? "";
      case "rolesFrameIds":
        return Array.isArray(meta.roles_frame) ? meta.roles_frame.map((rf: any) => (typeof rf === "string" ? rf : rf._id)) : [];
      default:
        return meta[field.key] ?? "";
    }
  };

  // Comparación tolerante (arrays por contenido; resto con coerción suave).
  const isSameAsOriginal = (field: PersonalDataField, val: any): boolean => {
    const orig = originalFor(field);
    if (Array.isArray(orig) || Array.isArray(val)) {
      const a = (Array.isArray(orig) ? orig : []).map(String).sort();
      const b = (Array.isArray(val) ? val : []).map(String).sort();
      return a.length === b.length && a.every((x, i) => x === b[i]);
    }
    if (field.type === "boolean") return !!orig === !!val;
    return String(orig ?? "") === String(val ?? "");
  };

  // Carga de catálogos necesarios.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const catalogFields = fields.filter((f) => f.type === "catalog" && f.catalog && CATALOG_TO_INFO_TYPE[f.catalog]);
      const uniqueTypes = Array.from(new Set(catalogFields.map((f) => CATALOG_TO_INFO_TYPE[f.catalog!])));
      const results: Record<string, InfoItem[]> = {};
      await Promise.all(
        uniqueTypes.map(async (type) => {
          try {
            results[type] = await infoAPI.listByType(type);
          } catch {
            results[type] = [];
          }
        }),
      );
      // Nacionalidad: si no hay catálogo propio, usar países como fallback.
      if (results["nacionalidad"] && results["nacionalidad"].length === 0 && results["pais"]) {
        results["nacionalidad"] = results["pais"];
      }
      if (fields.some((f) => f.key === "rolesFrameIds")) {
        try {
          const rf = await roleFrameAPI.list();
          if (!cancelled) setRoleFrames((Array.isArray(rf) ? rf : []).map((r: any) => ({ _id: r._id, name: r.name })));
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) setCatalogs(results);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKeys.join(",")]);

  const v = value || {};

  // Valor a mostrar: la edición si existe, si no el original del usuario.
  const getDisplayValue = (field: PersonalDataField): any => (Object.prototype.hasOwnProperty.call(v, field.key) ? v[field.key] : originalFor(field));

  // Solo persistimos en el payload los campos que difieren del original.
  const setField = (field: PersonalDataField, val: any) => {
    const next = { ...v };
    if (isSameAsOriginal(field, val)) {
      delete next[field.key];
    } else {
      next[field.key] = val;
    }
    onChange(next);
  };

  const renderField = (field: PersonalDataField) => {
    const val = getDisplayValue(field);

    if (field.type === "boolean") {
      return (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!val} onChange={(e) => setField(field, e.target.checked)} className="rounded" />
          {field.label}
        </label>
      );
    }

    if (field.type === "date") {
      return (
        <div>
          <label className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">{field.label}</label>
          <input type="date" value={val ? String(val).split("T")[0] : ""} onChange={(e) => setField(field, e.target.value)} className={inputClass} />
        </div>
      );
    }

    if (field.type === "catalog") {
      // Estado civil: opciones fijas.
      if (field.catalog === "estadosCiviles") {
        return (
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">{field.label}</label>
            <select value={val ?? ""} onChange={(e) => setField(field, e.target.value)} className={inputClass}>
              <option value="">Seleccionar...</option>
              {ESTADO_CIVIL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        );
      }

      // Rol Frame: multi-selección de refs.
      if (field.key === "rolesFrameIds") {
        const selected: string[] = Array.isArray(val) ? val : [];
        return (
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">{field.label}</label>
            <div className="max-h-40 overflow-y-auto rounded border dark:border-slate-700 p-2 space-y-1">
              {roleFrames.length === 0 && <p className="text-xs text-slate-400">Sin roles disponibles</p>}
              {roleFrames.map((rf) => (
                <label key={rf._id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(rf._id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...selected, rf._id] : selected.filter((id) => id !== rf._id);
                      setField(field, next);
                    }}
                    className="rounded"
                  />
                  {rf.name}
                </label>
              ))}
            </div>
          </div>
        );
      }

      const infoType = field.catalog ? CATALOG_TO_INFO_TYPE[field.catalog] : undefined;
      const options = infoType ? catalogs[infoType] || [] : [];
      return (
        <div>
          <label className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">{field.label}</label>
          <select
            value={val ?? ""}
            onChange={(e) => setField(field, e.target.value === "" ? "" : Number(e.target.value))}
            className={inputClass}
          >
            <option value="">Seleccionar...</option>
            {options.map((it) => (
              <option key={it._id} value={it.data?.id}>
                {it.data?.nombre || it.name}
              </option>
            ))}
          </select>
        </div>
      );
    }

    // text
    return (
      <div>
        <label className="block text-xs font-medium mb-1 text-slate-500 dark:text-slate-400">{field.label}</label>
        <input type="text" value={val ?? ""} onChange={(e) => setField(field, e.target.value)} className={inputClass} />
      </div>
    );
  };

  if (fields.length === 0) {
    return <p className="text-sm text-amber-500">Este tipo de pedido no tiene campos configurados para modificar.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">Modificá los datos que necesites. Al aprobarse el pedido, se actualizarán en tu perfil.</p>
      {(Object.keys(PERSONAL_DATA_SECTION_LABELS) as PersonalDataSection[]).map((section) => {
        const sectionFields = fields.filter((f) => f.section === section);
        if (sectionFields.length === 0) return null;
        return (
          <div key={section}>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{PERSONAL_DATA_SECTION_LABELS[section]}</p>
            <div className="grid grid-cols-1 gap-3">{sectionFields.map((field) => <div key={field.key}>{renderField(field)}</div>)}</div>
          </div>
        );
      })}
    </div>
  );
};
