import React, { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faFileContract, faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { EstadoBadge } from "../EstadoSelect";
import { InfoItem } from "../../api/info";
import { estadoImpositivoPorTipo, esTipoImpositivo, TipoImpositivo } from "../../utils/tramiteImpositivo";

/*
  EL TIPO DE CONTRATO SE ELIGE EN UNA VENTANA, NO EN UN DESPLEGABLE (pedido del 17/10/2026). Ya son
  más de una docena de tipos con su badge de trámite al lado: en un desplegable había que scrollear a
  ciegas dentro del formulario. En la ventana entran todos con un buscador y los chips del trámite
  para acotar — y la lista arranca SIEMPRE completa: el filtro es una ayuda que se pone a mano, no algo
  que el formulario decide solo.

  Es la misma pantalla que la app móvil (`apps/mobile/.../SelectorTipoContrato.tsx`), con el estilo
  del escritorio: quien eligió un contrato en el teléfono reconoce la ventana acá.
*/

export interface TipoContratoParaElegir {
  _id: string;
  name: string;
  /** `false` marca los tipos dados de baja: se siguen ofreciendo si ya estaban elegidos, aclarados. */
  isActive?: boolean;
}

interface Comun {
  contratos: TipoContratoParaElegir[];
  contratoId: string;
  /** El trámite que declara cada tipo de contrato («constancia_cuit» = servicios). */
  tramitePorContrato: Map<string, TipoImpositivo>;
  /** Los estados del ABM: de ahí salen el nombre y el color del badge del trámite. */
  estados: InfoItem[];
}

const estadoDelTramite = ({ estados, tramitePorContrato }: Pick<Comun, "estados" | "tramitePorContrato">, contratoId: string) => {
  const tipo = tramitePorContrato.get(contratoId);
  return tipo ? estadoImpositivoPorTipo(estados, tipo) : null;
};

/** El campo cerrado: lo elegido con su trámite, o «Elegí el tipo de contrato…». Toca y abre la ventana. */
export const CampoTipoContrato: React.FC<Comun & { onAbrir: () => void; placeholder?: string }> = ({ contratos, contratoId, tramitePorContrato, estados, onAbrir, placeholder = "Elegí el tipo de contrato…" }) => {
  const elegido = contratos.find((c) => String(c._id) === String(contratoId)) || null;
  const estado = elegido ? estadoDelTramite({ estados, tramitePorContrato }, elegido._id) : null;
  return (
    <button type="button" onClick={onAbrir} className="input-field w-full flex items-center gap-2 text-left" aria-haspopup="dialog">
      {elegido ? (
        <>
          <span className="flex-1 truncate">
            {elegido.name}
            {elegido.isActive === false && <span className="ml-1 text-[10px] text-gray-400">(inactivo)</span>}
          </span>
          {estado && <EstadoBadge name={estado.name} className="text-[9px] px-1.5 py-0 whitespace-nowrap" />}
        </>
      ) : (
        <>
          <FontAwesomeIcon icon={faSearch} className="h-3 w-3 text-gray-400" />
          <span className="flex-1 text-gray-400">{placeholder}</span>
        </>
      )}
      <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-gray-400 shrink-0" />
    </button>
  );
};

/**
 * La ventana: buscador, chips de trámite (opcionales) y una fila por tipo con su badge. Tocar una
 * elige y cierra. `filtro`/`onFiltro` son el mismo filtro por trámite del formulario, así lo que se
 * acota acá y lo que dice el rótulo de afuera es una sola cosa.
 */
export const ModalTipoContrato: React.FC<
  Comun & {
    abierto: boolean;
    onCerrar: () => void;
    onElegir: (contratoId: string) => void;
    filtro?: TipoImpositivo | "";
    onFiltro?: (tipo: TipoImpositivo | "") => void;
    /** Los estados impositivos del ABM (para los chips). */
    impositivos?: InfoItem[];
    zIndex?: number;
  }
> = ({ abierto, onCerrar, contratos, contratoId, tramitePorContrato, estados, onElegir, filtro = "", onFiltro, impositivos = [], zIndex = 120 }) => {
  const [busqueda, setBusqueda] = useState("");
  const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return contratos.filter((c) => (!filtro || tramitePorContrato.get(c._id) === filtro || String(c._id) === String(contratoId)) && (!q || normalizar(c.name).includes(q)));
  }, [contratos, busqueda, filtro, tramitePorContrato, contratoId]);

  return (
    <Modal
      isOpen={abierto}
      onClose={onCerrar}
      title="Tipo de contrato"
      subtitle="El trámite ante ARCA sale del tipo que elijas"
      size="md"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <span className="text-[11px] text-gray-500 dark:text-gray-400">{visibles.length === contratos.length ? `${contratos.length} tipos` : `${visibles.length} de ${contratos.length} tipos`}</span>
          <button type="button" onClick={onCerrar} className="btn-secondary">
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input type="search" autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar tipo de contrato…" className="input-field w-full pl-9" />
        </div>
        {onFiltro && impositivos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Trámite</span>
            {impositivos.map((e) => {
              const tipo = e.data?.tipoImpositivo;
              if (!esTipoImpositivo(tipo)) return null;
              const activo = filtro === tipo;
              const cuantos = contratos.filter((c) => tramitePorContrato.get(c._id) === tipo).length;
              return (
                <button key={e._id} type="button" onClick={() => onFiltro(activo ? "" : tipo)} aria-pressed={activo} className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 transition-colors ${activo ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/20" : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"}`} title={activo ? "Quitar el filtro" : `Ver sólo los tipos que declaran ${e.name}`}>
                  <EstadoBadge name={e.name} className="text-[9px] px-1.5 py-0" />
                  <span className="text-[10px] text-gray-500">{cuantos}</span>
                  {activo && <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5 text-gray-400" />}
                </button>
              );
            })}
          </div>
        )}
        <div className="grid grid-cols-1 gap-1.5 max-h-[55vh] overflow-y-auto pr-1">
          {visibles.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              <FontAwesomeIcon icon={faFileContract} className="mr-2 text-gray-400" />
              {busqueda ? `Ningún tipo de contrato coincide con «${busqueda}».` : "Ningún tipo de contrato declara ese trámite."}
            </p>
          ) : (
            visibles.map((c) => {
              const elegido = String(contratoId) === String(c._id);
              const estado = estadoDelTramite({ estados, tramitePorContrato }, c._id);
              return (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => {
                    onElegir(c._id);
                    onCerrar();
                  }}
                  aria-pressed={elegido}
                  className={`flex items-center gap-3 rounded-lg border p-3 text-left transition-all ${elegido ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-300" : "border-gray-200 bg-white hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60 text-gray-800 dark:text-gray-100"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600" : "border-gray-300 dark:border-gray-600"}`}>{elegido && <span className="h-2 w-2 rounded-full bg-blue-600" />}</span>
                  <span className="flex-1 text-sm font-medium">
                    {c.name}
                    {c.isActive === false && <span className="ml-1 text-[10px] text-gray-400">(inactivo)</span>}
                  </span>
                  {estado ? <EstadoBadge name={estado.name} className="text-[9px] px-1.5 py-0 whitespace-nowrap" /> : <span className="text-[10px] italic text-gray-400">sin trámite</span>}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
