import React, { useEffect, useState } from "react";
import { infoAPI, InfoItem } from "../../api/info";
import { roleFrameAPI } from "../../api/roleFrames";
import { PERSONAL_DATA_FIELDS, CATALOG_TO_INFO_TYPE, PERSONAL_DATA_SECTION_LABELS, PersonalDataSection } from "../../config/personalDataFields";

interface ProposedPersonalDataDetailsProps {
  proposedUserData: Record<string, any>;
}

/**
 * Muestra, en el detalle del pedido, los campos de datos personales que el
 * colaborador solicitó modificar (categoryType === "datos_personales"), con
 * los valores de catálogo resueltos a su nombre legible.
 */
export const ProposedPersonalDataDetails: React.FC<ProposedPersonalDataDetailsProps> = ({ proposedUserData }) => {
  const [catalogs, setCatalogs] = useState<Record<string, InfoItem[]>>({});
  const [roleFrames, setRoleFrames] = useState<Array<{ _id: string; name: string }>>([]);

  // proposedUserData ya contiene SOLO los campos que el usuario modificó.
  const changedKeys = Object.keys(proposedUserData || {});
  const changedFields = PERSONAL_DATA_FIELDS.filter((f) => changedKeys.includes(f.key));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const catalogFields = changedFields.filter((f) => f.type === "catalog" && f.catalog && CATALOG_TO_INFO_TYPE[f.catalog]);
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
      if (changedFields.some((f) => f.key === "rolesFrameIds")) {
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
  }, [changedKeys.join(",")]);

  const displayValue = (key: string): string => {
    const field = PERSONAL_DATA_FIELDS.find((f) => f.key === key);
    const raw = proposedUserData[key];
    if (!field) return String(raw);

    if (field.type === "boolean") return raw ? "Sí" : "No";
    if (field.type === "date") return raw ? (typeof raw === "string" ? raw.split("T")[0] : String(raw)) : "—";

    if (field.key === "rolesFrameIds") {
      const ids: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
      if (ids.length === 0) return "—";
      const names = ids.map((id) => roleFrames.find((rf) => rf._id === id)?.name || id);
      return names.join(", ");
    }

    if (raw === "" || raw === null || raw === undefined) return "—";

    if (field.type === "catalog" && field.catalog && CATALOG_TO_INFO_TYPE[field.catalog]) {
      const list = catalogs[CATALOG_TO_INFO_TYPE[field.catalog]] || [];
      const match = list.find((it) => String(it.data?.id) === String(raw));
      return match ? match.data?.nombre || match.name : String(raw);
    }

    return String(raw);
  };

  if (changedFields.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">No se especificaron cambios de datos.</p>;
  }

  return (
    <div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">Datos que solicita modificar</p>
      <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
        {(Object.keys(PERSONAL_DATA_SECTION_LABELS) as PersonalDataSection[]).map((section) => {
          const sectionFields = changedFields.filter((f) => f.section === section);
          if (sectionFields.length === 0) return null;
          return (
            <div key={section}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{PERSONAL_DATA_SECTION_LABELS[section]}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {sectionFields.map((field) => (
                  <div key={field.key} className="flex justify-between gap-3 text-sm">
                    <span className="text-slate-500 dark:text-slate-400">{field.label}</span>
                    <span className="font-medium text-slate-800 dark:text-slate-100 text-right break-words">{displayValue(field.key)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
