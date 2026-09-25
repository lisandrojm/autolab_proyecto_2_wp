import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faSearch, faTimes, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "./Modal";
import { fuzzyMatch } from "../../utils/searchHelpers";

/*
  ELEGIR VARIOS DE UNA LISTA: el mismo patrón que Rol/es Empresa en la ficha del usuario.

  Lo elegido va como badges con su ✕ debajo del nombre del campo; el [+] de la cabecera (o, sin nada
  elegido, un campo ancho) abre una ventana con buscador y casillas para marcar varios. Lo usan Sede y
  Empresa del contrato en el formulario de proyecto.

  El ORDEN importa donde hay uno principal (la sede: el primero es el que precarga el alta de
  contratos): se respeta el orden en que se fueron eligiendo.
*/
export interface OpcionSeleccion {
  id: string;
  nombre: string;
  /** Datos chicos al lado del nombre, como badges (ej. las empresas a las que pertenece un convenio). */
  etiquetas?: string[];
}

/** Los badges chicos de `etiquetas`. */
const Etiquetas: React.FC<{ etiquetas?: string[] }> = ({ etiquetas }) =>
  etiquetas && etiquetas.length > 0 ? (
    <span className="inline-flex flex-wrap gap-1">
      {etiquetas.map((e) => (
        <span key={e} className="rounded bg-gray-100 px-1 py-px text-[9px] font-semibold text-gray-600 dark:bg-gray-700/70 dark:text-gray-300">
          {e}
        </span>
      ))}
    </span>
  ) : null;

interface Props {
  /** El nombre del campo, con su ⓘ si lo tiene. Va en la cabecera, al lado del [+]. */
  label: React.ReactNode;
  opciones: OpcionSeleccion[];
  valor: string[];
  onChange: (ids: string[]) => void;
  /** Título y bajada de la ventana. */
  titulo: string;
  descripcion?: string;
  placeholder?: string;
  placeholderBusqueda?: string;
  vacio?: string;
  /** Marca el primero como «principal» (badge con un rótulo). */
  principal?: string;
  zIndex?: number;
}

export const SeleccionMultiple: React.FC<Props> = ({ label, opciones, valor, onChange, titulo, descripcion, placeholder = "Elegí uno o más…", placeholderBusqueda = "Buscar...", vacio = "No hay opciones cargadas.", principal, zIndex = 90 }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const nombreDe = (id: string) => opciones.find((o) => o.id === id)?.nombre || "—";
  const etiquetasDe = (id: string) => opciones.find((o) => o.id === id)?.etiquetas;
  const quitar = (id: string) => onChange(valor.filter((x) => x !== id));
  const alternar = (id: string) => (valor.includes(id) ? quitar(id) : onChange([...valor, id]));
  const filtradas = opciones.filter((o) => fuzzyMatch(o.nombre, busqueda));
  const abrir = () => {
    setBusqueda("");
    setAbierto(true);
  };

  const badges = (
    <div className="flex flex-wrap gap-1.5">
      {valor.map((id, i) => (
        <span key={id} className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800">
          {nombreDe(id)}
          <Etiquetas etiquetas={etiquetasDe(id)} />
          {principal && i === 0 && valor.length > 1 && <span className="rounded bg-blue-600/15 px-1 text-[9px] uppercase tracking-wide">{principal}</span>}
          <button type="button" onClick={() => quitar(id)} aria-label={`Quitar ${nombreDe(id)}`} className="rounded-full hover:bg-blue-200 dark:hover:bg-blue-800/60 p-0.5">
            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {label}
        {/* Sólo con algo elegido: sin nada, abajo está el campo ancho y el [+] sería un segundo camino a lo mismo. */}
        {valor.length > 0 && (
          <button type="button" onClick={abrir} aria-label={`Agregar a ${titulo}`} className="inline-flex items-center justify-center px-1.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          </button>
        )}
      </div>

      {valor.length > 0 ? (
        badges
      ) : (
        <button type="button" onClick={abrir} className="input-field py-2.5 text-left flex items-center gap-2 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
          <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>
          <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400 ml-auto shrink-0" />
        </button>
      )}

      {abierto && (
        <Modal
          isOpen={abierto}
          onClose={() => setAbierto(false)}
          title={titulo}
          subtitle={`${valor.length} seleccionado(s)${descripcion ? ` · ${descripcion}` : ""}`}
          size="lg"
          zIndex={zIndex}
          footer={
            <>
              <button type="button" onClick={() => onChange([])} className="btn-secondary" disabled={valor.length === 0}>
                Limpiar
              </button>
              <button type="button" onClick={() => setAbierto(false)} className="btn-primary">
                Listo
              </button>
            </>
          }
        >
          {/* Alto fijo: si siguiera al contenido, filtrar achicaría la ventana y «Listo» se movería. */}
          <div className="h-[60vh] flex flex-col">
            {valor.length > 0 && <div className="mb-3 shrink-0">{badges}</div>}

            <div className="relative mb-3 shrink-0">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <input type="text" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={placeholderBusqueda} className="input-field pl-9 pr-8" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda("")} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <FontAwesomeIcon icon={faTimes} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 flex-1 overflow-y-auto content-start pr-1">
              {filtradas.map((o) => {
                const marcada = valor.includes(o.id);
                return (
                  <label key={o.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all cursor-pointer ${marcada ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20" : "bg-white border-gray-100 dark:bg-gray-800 dark:border-gray-700 hover:border-gray-300"}`}>
                    <input type="checkbox" checked={marcada} onChange={() => alternar(o.id)} className="rounded text-blue-500 focus:ring-blue-500 h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex flex-col gap-1">
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate" title={o.nombre}>
                        {o.nombre}
                      </span>
                      <Etiquetas etiquetas={o.etiquetas} />
                    </span>
                  </label>
                );
              })}
              {filtradas.length === 0 && <div className="col-span-full py-8 text-center text-xs text-gray-500 italic">{opciones.length === 0 ? vacio : `Nada coincide con "${busqueda}"`}</div>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
