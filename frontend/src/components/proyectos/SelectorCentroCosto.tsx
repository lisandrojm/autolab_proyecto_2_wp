import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSearch, faCheck, faTimes, faPiggyBank } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { fuzzyMatch } from "../../utils/searchHelpers";
import { empresasDelCentroCosto, opcionesCentroCosto } from "../../utils/centroCosto";

/*
  ELEGIR EL CENTRO DE COSTO DE UN PROYECTO.

  Era un `<select>` nativo. Con 47 centros se podía; con los 806 de Tango es una lista de números
  —«405, 406, 407…»— por la que hay que scrollear a ojo, sin poder buscar y sin saber qué es cada uno:
  el código solo no dice nada si no te lo acordás de memoria.

  Acá se ve el CÓDIGO y su DESCRIPCIÓN juntos, y se busca por cualquiera de los dos: quien conoce el
  número escribe «682» y quien conoce el proyecto escribe «PEGSA». La búsqueda es la misma difusa que
  el resto de la plataforma (`fuzzyMatch`), así que no hace falta acertar los espacios ni los acentos.

  LOS INHABILITADOS NO SE OFRECEN —Tango dice que no se usan más—, salvo el que el proyecto ya tiene
  puesto: sacarlo de la lista dejaría el campo vacío sobre un proyecto que sí tiene centro, y el
  próximo guardado se lo borraría sin que nadie lo pidiera. Ése aparece con «(inhabilitado)» al lado,
  para que se vea por qué conviene cambiarlo. La regla vive en `opcionesCentroCosto`, compartida.
*/

interface SelectorCentroCostoProps {
  /** El `idAuxiliar` elegido (lo que se guarda en `metadata.centroCostoId`). */
  valor?: number | null;
  /** De qué empresa de Tango es ese centro: sin esto el id es ambiguo (ver `opcionesCentroCosto`). */
  empresaTangoId?: number | null;
  /** Devuelve el par: el id y la empresa de Tango a la que pertenece. */
  onCambio: (id: number | undefined, empresaTangoId?: number) => void;
  /** El catálogo ya cargado por la pantalla (`cargarCentrosCosto`). */
  catalogo: any[];
  /** Sin él, el campo ofrece «Quitar»: no todos los proyectos tienen centro. */
  required?: boolean;
  disabled?: boolean;
  /** Por encima del modal del formulario, que vive en z-50. */
  zIndex?: number;
}

export const SelectorCentroCosto: React.FC<SelectorCentroCostoProps> = ({ valor, empresaTangoId, onCambio, catalogo, required, disabled, zIndex = 100 }) => {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const opciones = useMemo(() => opcionesCentroCosto(catalogo, valor), [catalogo, valor]);
  /* La opción exacta es el par (empresa, id). Sin empresa guardada, la primera con ese id. */
  const elegida = (empresaTangoId ? opciones.find((o) => o.id === Number(valor) && o.empresaTangoId === Number(empresaTangoId)) : undefined) || opciones.find((o) => o.id === Number(valor));
  /*
    TODAS las empresas donde existe el código elegido, no sólo la de la fila que se eligió.

    El mismo número vive en varias empresas de Tango, y el campo tiene que decirlo: «662» a secas no
    aclara de qué empresa es, y mostrar una sola haría creer que es exclusivo de ésa.
  */
  const empresasDelElegido = useMemo(() => (elegida ? empresasDelCentroCosto(catalogo, elegida.etiqueta.replace(" (inhabilitado)", "")) : []), [catalogo, elegida]);

  useEffect(() => {
    if (!abierto) return;
    setBusqueda("");
    // El foco va al buscador: se abre para buscar, no para scrollear.
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [abierto]);

  /*
    Se busca sobre el código Y la descripción juntos, en un solo texto: así «682 PEGSA» encuentra el
    mismo registro que «682» o que «pegsa», sin pedirle a quien busca que sepa cuál de los dos está
    cargado de qué lado.
  */
  const filtradas = useMemo(() => {
    const q = busqueda.trim();
    if (!q) return opciones;
    return opciones.filter((o) => fuzzyMatch(`${o.etiqueta} ${o.descripcion} ${o.empresa}`, q));
  }, [opciones, busqueda]);

  const elegir = (id: number, empresa?: number) => {
    onCambio(id, empresa);
    setAbierto(false);
  };

  return (
    <>
      <button type="button" onClick={() => !disabled && setAbierto(true)} disabled={disabled} aria-haspopup="dialog" className="input-field flex w-full items-center justify-between gap-2 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60">
        {elegida ? (
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono font-bold">{elegida.etiqueta}</span>
            {elegida.descripcion && <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{elegida.descripcion}</span>}
            {/* Las empresas a las que pertenece ese centro, en badges. */}
            {empresasDelElegido.map((e) => (
              <span key={e} className="whitespace-nowrap rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                {e}
              </span>
            ))}
          </span>
        ) : (
          <span className="flex-1 text-gray-400 dark:text-gray-500">Seleccionar centro de costo...</span>
        )}
        <FontAwesomeIcon icon={faSearch} className="h-3 w-3 shrink-0 text-gray-400" />
      </button>

      <Modal
        isOpen={abierto}
        onClose={() => setAbierto(false)}
        title="Centro de costo"
        subtitle={`${opciones.length} centros del catálogo de Tango. Buscá por código, descripción o empresa.`}
        size="lg"
        zIndex={zIndex}
        footer={
          <div className="flex w-full items-center justify-between gap-3">
            {/* Quitar sólo donde el campo no es obligatorio: si lo es, vaciarlo no es una opción. */}
            {!required && valor ? (
              <button
                type="button"
                onClick={() => {
                  onCambio(undefined, undefined);
                  setAbierto(false);
                }}
                className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
              >
                <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                Quitar el centro de costo
              </button>
            ) : (
              <span />
            )}
            <button type="button" onClick={() => setAbierto(false)} className="btn-secondary">
              Cerrar
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <FontAwesomeIcon icon={faSearch} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="682, PEGSA, REELSHORT..."
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>

          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            {filtradas.length === opciones.length ? `${opciones.length} centros` : `${filtradas.length} de ${opciones.length}`}
          </p>

          {/*
            Alto fijo con scroll propio: 806 filas no entran en ninguna pantalla, y dejar que la ventana
            crezca haría que el buscador quede fuera de la vista justo cuando hay muchos resultados.
          */}
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {filtradas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-8 text-center">
                <FontAwesomeIcon icon={faPiggyBank} className="h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">Ningún centro coincide con «{busqueda}».</p>
                <p className="text-xs text-gray-400">Probá con el código («682») o con una palabra de la descripción.</p>
              </div>
            ) : (
              filtradas.map((o) => {
                const esLaElegida = o.id === Number(valor);
                return (
                  <button
                    key={o.clave}
                    type="button"
                    onClick={() => elegir(o.id, o.empresaTangoId)}
                    className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-2.5 text-left last:border-0 dark:border-gray-700/60 ${esLaElegida ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-900/40"}`}
                  >
                    <span className="w-24 shrink-0 font-mono text-sm font-bold text-gray-900 dark:text-white">{o.etiqueta}</span>
                    <span className={`min-w-0 flex-1 truncate text-sm ${o.inhabilitado ? "text-gray-400 line-through" : "text-gray-600 dark:text-gray-300"}`}>{o.descripcion || "—"}</span>
                    {/* La empresa: el mismo código existe en las tres y no es el mismo centro. */}
                    {o.empresa && <span className="shrink-0 rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{o.empresa}</span>}
                    {esLaElegida && <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      </Modal>
    </>
  );
};
