import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { EstadoBadge } from "../EstadoSelect";
import { InfoItem } from "../../api/info";
import { TipoImpositivo, estadoImpositivoPorTipo } from "../../utils/tramiteImpositivo";

/**
 * SELECT DE TIPO DE CONTRATO CON EL BADGE DEL TRÁMITE AL LADO.
 *
 * Un `<option>` nativo solo admite texto: no se le puede meter un badge adentro ni colorear una parte
 * del renglón. Se probó con el sufijo « · Pedido de ARCA» en el texto y no alcanza — la lista queda
 * como catorce renglones que terminan igual, que es justo lo que había que poder distinguir de un
 * vistazo.
 *
 * Así que es una lista propia, exactamente como `EstadoSelect`, que resolvió lo mismo para el estado
 * («el <select> nativo no permite colorear opciones»). El badge sale del ABM a través de
 * `EstadoBadge`, así que respeta el color y el nombre que tenga configurado cada estado — incluido el
 * renombre de AFIP a ARCA, que se aplica al dibujar.
 */

export interface TipoContratoOption {
  _id: string;
  name: string;
  /** `false` marca los tipos dados de baja: se siguen ofreciendo, aclarados. */
  isActive?: boolean;
}

interface Props {
  options: TipoContratoOption[];
  value: string;
  onChange: (id: string) => void;
  /** Qué trámite declara cada tipo de contrato (id → trámite). Ver `tipoImpositivoDeContrato`. */
  tramitePorContrato: Map<string, TipoImpositivo>;
  /** Estados del ABM: de ahí sale el badge (color y nombre). */
  estados: InfoItem[];
  placeholder?: string;
}

export const TipoContratoSelect: React.FC<Props> = ({ options, value, onChange, tramitePorContrato, estados, placeholder = "Selecciona tipo..." }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = useMemo(() => options.find((o) => String(o._id) === String(value)), [options, value]);

  /** El estado impositivo de un tipo, o `null` si todavía no tiene ninguno vinculado. */
  const estadoDe = (id: string) => estadoImpositivoPorTipo(estados, tramitePorContrato.get(id));

  /**
   * `conBadge` distingue la LISTA del CONTROL CERRADO.
   *
   * En la lista el badge sirve: es lo que diferencia dos tipos que se llaman parecido y aclara qué
   * trámite dispara cada uno. Cerrado no aporta —ya se eligió— y además compite con el badge de
   * «Estado», que está justo al lado en la misma fila de la grilla: dos recuadros de colores
   * pegados, uno que es un dato y otro que es una etiqueta del valor elegido.
   */
  const fila = (o: TipoContratoOption, conBadge = true) => {
    const estado = estadoDe(o._id);
    return (
      <>
        <span className="truncate">
          {o.name}
          {o.isActive === false ? " (inactivo)" : ""}
        </span>
        {conBadge && estado && <EstadoBadge name={estado.name} className="text-[10px] whitespace-nowrap shrink-0" />}
      </>
    );
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input-field w-full flex items-center justify-between gap-2 text-left">
        <span className="flex items-center gap-2 min-w-0 flex-1">{selected ? fila(selected, false) : <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>}</span>
        <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 text-gray-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No hay tipos de contrato para mostrar.</p>
          ) : (
            options.map((o) => (
              <button
                key={o._id}
                type="button"
                onClick={() => {
                  onChange(o._id);
                  setOpen(false);
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${String(o._id) === String(value) ? "bg-gray-50 dark:bg-gray-700/40" : ""}`}
              >
                {fila(o)}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default TipoContratoSelect;
