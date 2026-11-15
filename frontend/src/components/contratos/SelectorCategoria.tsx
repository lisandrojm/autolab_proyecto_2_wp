import React, { useEffect, useMemo, useRef, useState } from "react";
import { valoracionesDeCategoria } from "@compartido/valoracionesDeCategoria";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faSearch, faCheck } from "@fortawesome/free-solid-svg-icons";
import type { SimpleCatalogItem } from "../../api/simpleCatalog";
import { ChipValoracion, ChipSinValorar } from "../proyectos/ChipValoracion";
import { fuzzyMatch } from "../../utils/searchHelpers";
import { etiquetaGrupo } from "../../utils/seleccionConvenioCategoria";
import { Modal } from "../ui/Modal";

export interface OpcionCategoria {
  id: string | number;
  nombre: string;
  codigoArca?: string;
  /** La valoración de la categoría EN LA FUNCIÓN elegida (`RoleFrame.data.categoriasSat[].valoracionId`). */
  valoracionId?: string | null;
  /** Todas sus valoraciones en la función; `valoracionId` es la primera. */
  valoracionIds?: string[];
  /** El grupo del convenio («1»): se muestra como «G1» al lado del nivel. */
  grupo?: string;
}

const texto = (o: OpcionCategoria) => `${o.codigoArca ? `${o.codigoArca} — ` : ""}${o.nombre}`;

/** El tag de valoración (con su color) y el grupo del convenio de una categoría. Los usan el desplegable y el modal. */
const rotulos = (valoraciones: SimpleCatalogItem[]) => {
  const valoracion = (id?: string | null) => (id ? valoraciones.find((v) => String(v._id) === String(id)) : undefined);
  const tag = (o: OpcionCategoria) => {
    const vs = valoracionesDeCategoria(o).map((id) => valoracion(id)).filter(Boolean) as NonNullable<ReturnType<typeof valoracion>>[];
    if (vs.length === 0) return <ChipSinValorar title="Esta categoría no tiene valoración cargada en la función" />;
    return (
      <>
        {vs.map((v) => (
          <ChipValoracion key={String(v._id)} nombre={String(v.name)} color={String(v.color || "")} />
        ))}
      </>
    );
  };
  // El grupo al lado del nivel: «Director de Programas [Oro] G1».
  const grupo = (o: OpcionCategoria) => (etiquetaGrupo(o.grupo) ? <span className="shrink-0 text-[11px] font-bold text-gray-500 dark:text-gray-400" title={`Grupo ${o.grupo} del convenio`}>{etiquetaGrupo(o.grupo)}</span> : null);
  return { tag, grupo };
};

/** Las filas de categorías, con la elegida tildada y «corresponde» en las del nivel que rige. */
const ListaCategorias: React.FC<{
  opciones: OpcionCategoria[];
  valor: string;
  onElegir: (id: string) => void;
  valoraciones: SimpleCatalogItem[];
  valoracionQueRige: string;
  vacio: string;
  className: string;
}> = ({ opciones, valor, onElegir, valoraciones, valoracionQueRige, vacio, className }) => {
  const { tag, grupo } = rotulos(valoraciones);
  return (
    <ul role="listbox" className={className}>
      {opciones.length === 0 && <li className="px-3 py-3 text-xs text-gray-500 dark:text-gray-400">{vacio}</li>}
      {opciones.map((o) => {
        const sel = String(o.id) === String(valor);
        const delNivel = !!valoracionQueRige && valoracionesDeCategoria(o).includes(valoracionQueRige);
        return (
          <li key={o.id} role="option" aria-selected={sel}>
            <button type="button" onClick={() => onElegir(String(o.id))} className={`w-full px-3 py-2 flex items-center gap-2 text-left text-sm transition-colors ${sel ? "bg-blue-50 dark:bg-blue-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-700/50"}`}>
              <FontAwesomeIcon icon={faCheck} className={`h-3 w-3 shrink-0 ${sel ? "text-blue-600 dark:text-blue-400" : "text-transparent"}`} />
              <span className="flex-1 min-w-0 truncate text-gray-800 dark:text-gray-200">{texto(o)}</span>
              {delNivel && <span className="text-[10px] font-semibold text-green-700 dark:text-green-400 shrink-0">corresponde</span>}
              {tag(o)}
              {grupo(o)}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/**
 * EL SELECTOR DE CATEGORÍA DEL ALTA, con el TAG de la valoración de cada una, con su color.
 *
 * Reemplaza a un `<select>`, que no admite colores: había que elegir una categoría para recién ahí
 * ver su nivel. Acá cada opción lleva su badge (Bronce, Plata, Oro…) y las del nivel que rige para
 * este contrato van marcadas, así se ve de un vistazo cuál corresponde.
 */
export const SelectorCategoria: React.FC<{
  opciones: OpcionCategoria[];
  valor: string;
  onChange: (id: string) => void;
  valoraciones: SimpleCatalogItem[];
  /** La valoración que rige para este contrato (la del proyecto o la de su rol y tipo de contrato). */
  valoracionQueRige?: string;
  placeholder?: string;
}> = ({ opciones, valor, onChange, valoraciones, valoracionQueRige = "", placeholder = "Selecciona categoría..." }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const { tag, grupo } = rotulos(valoraciones);
  const elegida = opciones.find((o) => String(o.id) === String(valor));
  const filtradas = useMemo(() => opciones.filter((o) => !busqueda.trim() || fuzzyMatch(texto(o), busqueda)), [opciones, busqueda]);

  return (
    <div ref={raiz} className="relative">
      <button
        type="button"
        onClick={() => {
          setBusqueda("");
          setAbierto((a) => !a);
        }}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="input-field w-full flex items-center gap-2 text-left"
      >
        {elegida ? (
          <>
            <span className="truncate flex-1">{texto(elegida)}</span>
            {tag(elegida)}
            {grupo(elegida)}
          </>
        ) : (
          <span className="flex-1 text-gray-400 dark:text-gray-500">{placeholder}</span>
        )}
        <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 text-gray-400 shrink-0" />
      </button>

      {abierto && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
          {opciones.length > 8 && (
            <div className="p-2 border-b border-gray-100 dark:border-gray-700/60 relative">
              <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400" />
              <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar categoría…" className="input-field py-1.5 pl-7 text-sm" />
            </div>
          )}
          <ListaCategorias
            opciones={filtradas}
            valor={valor}
            onElegir={(id) => {
              onChange(id);
              setAbierto(false);
            }}
            valoraciones={valoraciones}
            valoracionQueRige={valoracionQueRige}
            vacio={opciones.length === 0 ? "No hay categorías para elegir." : "Nada coincide con la búsqueda."}
            className="max-h-72 overflow-y-auto py-1"
          />
        </div>
      )}
    </div>
  );
};

/**
 * TODAS LAS CATEGORÍAS DEL CONVENIO, EN UN MODAL (15/11/2026, pedido del usuario).
 *
 * «Ver todas las del convenio» cambiaba lo que ofrecía el desplegable de arriba y había que volver a
 * subir a abrirlo, que confundía. Ahora la lista completa se abre acá, con buscador: se elige y el
 * modal se cierra con la categoría puesta en el formulario.
 */
export const ModalCategorias: React.FC<{
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  subtitulo?: string;
  opciones: OpcionCategoria[];
  valor: string;
  onChange: (id: string) => void;
  valoraciones: SimpleCatalogItem[];
  valoracionQueRige?: string;
}> = ({ abierto, onCerrar, titulo, subtitulo, opciones, valor, onChange, valoraciones, valoracionQueRige = "" }) => {
  const [busqueda, setBusqueda] = useState("");
  useEffect(() => {
    if (abierto) setBusqueda("");
  }, [abierto]);
  const filtradas = useMemo(() => opciones.filter((o) => !busqueda.trim() || fuzzyMatch(texto(o), busqueda)), [opciones, busqueda]);

  return (
    <Modal isOpen={abierto} onClose={onCerrar} title={titulo} subtitle={subtitulo} size="lg" zIndex={70}>
      <div className="space-y-3">
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por código o nombre…" className="input-field pl-9" />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {busqueda.trim() ? `${filtradas.length} de ${opciones.length}` : `${opciones.length}`} {opciones.length === 1 ? "categoría" : "categorías"}. Las que no son de la función aparecen sin valorar.
        </p>
        <ListaCategorias
          opciones={filtradas}
          valor={valor}
          onElegir={(id) => {
            onChange(id);
            onCerrar();
          }}
          valoraciones={valoraciones}
          valoracionQueRige={valoracionQueRige}
          vacio={opciones.length === 0 ? "El convenio no tiene categorías para elegir." : "Nada coincide con la búsqueda."}
          className="max-h-[60vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60"
        />
      </div>
    </Modal>
  );
};
