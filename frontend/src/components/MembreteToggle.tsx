import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { InfoModal } from "./ui/InfoModal";

/**
 * Checkbox reutilizable "Membrete con datos de la empresa y firma de la empresa" para las plantillas
 * (Pedidos/Vacaciones, Contratos, Releases). Incluye un ícono de info que explica el comportamiento.
 */
export const MembreteToggle: React.FC<{ checked: boolean; onChange: (v: boolean) => void }> = ({ checked, onChange }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
        />
        Membrete con datos de la empresa y firma de la empresa
        <button type="button" onClick={() => setOpen(true)} className="text-gray-400 hover:text-blue-500 transition-colors" title="¿Qué significa?" aria-label="Información sobre membrete y firma">
          <FontAwesomeIcon icon={faCircleInfo} />
        </button>
      </label>

      <InfoModal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Membrete y firma de la empresa"
        size="md"
        zIndex={120}
        actions={[{ label: "Entendido", onClick: () => setOpen(false), variant: "primary" }]}
      >
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
          <p>
            Con esta opción <strong>activada</strong>, el documento se genera con el <strong>membrete</strong> (encabezado con el logo y los
            datos de la empresa: razón social, CUIT y domicilio) y con la <strong>firma</strong> de la empresa que se elige al momento de descargar.
          </p>
          <p>
            Si la <strong>desactivás</strong>, el documento <strong>no</strong> llevará ese encabezado ni esa firma.
          </p>
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-amber-800 dark:text-amber-300">
            <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 shrink-0" />
            <span>
              Importante: si además el contenido de la plantilla <strong>no</strong> usa variables de empresa (las que figuran en
              "Variables disponibles", como razón social, CUIT o ciudad), el documento <strong>no incluirá ningún dato de la empresa</strong>.
            </span>
          </div>
        </div>
      </InfoModal>
    </>
  );
};

export default MembreteToggle;
