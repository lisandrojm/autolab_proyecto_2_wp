import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBriefcase, faCircleInfo, faPlus, faSearch, faTrash } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";
import type { RoleFrameItem } from "../../../../../api/roleFrames";

/*
  ROL/ES EMPRESA, EL CAMPO Y LA VENTANA «OTRO ROL» (21/11/2026): los de la Solicitud de Contratación,
  sacados a un componente para que los puestos de los Equipos usen exactamente lo mismo.

  Los roles van uno debajo del otro y se marca UNO; el tacho, afuera de la opción, lo saca de las
  opciones de acá (la ficha de la persona no cambia); «+ Otro rol» abre la ventana con buscador y la
  grilla del catálogo (acotado a las áreas del proyecto), y tocar uno lo elige y cierra.
*/

export const CampoRolesEmpresa: React.FC<{
  opciones: RoleFrameItem[];
  elegidos: string[];
  /** Los de la ficha de la persona: los demás llevan el rótulo «nuevo». Sin persona, ninguno lo lleva. */
  rolesDeLaFicha: string[] | null;
  onElegir: (id: string) => void;
  onQuitar: (rf: RoleFrameItem) => void;
  onOtro: () => void;
  /** El «i» al lado del rótulo (qué roles se ofrecen y por qué). */
  onInfo?: () => void;
  /** Texto cuando no hay opciones. */
  vacio: string;
  /** No se ofrece el tacho en el elegido (un puesto no puede quedarse sin rol). */
  sinQuitarElegido?: boolean;
  /** Algo para decir debajo (p. ej. «se le agrega a la ficha»). */
  nota?: React.ReactNode;
  marca?: React.ReactNode;
}> = ({ opciones, elegidos, rolesDeLaFicha, onElegir, onQuitar, onOtro, onInfo, vacio, sinQuitarElegido, nota, marca }) => (
  <div className="space-y-1">
    <div className="flex items-center gap-2">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
        <FontAwesomeIcon icon={faBriefcase} className="text-blue-500 text-[10px]" />
        Rol/es Empresa*
      </label>
      {marca}
      {onInfo && (
        <button type="button" onClick={onInfo} title="Qué roles se ofrecen y por qué" className="text-blue-500 hover:text-blue-600 shrink-0">
          <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
    {opciones.length === 0 ? (
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{vacio}</p>
    ) : (
      <div className="space-y-1.5">
        {opciones.map((rf) => {
          const elegido = elegidos.includes(rf._id);
          const nuevo = !!rolesDeLaFicha && !rolesDeLaFicha.includes(rf._id);
          return (
            <div key={rf._id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onElegir(rf._id)}
                aria-pressed={elegido}
                className={`flex flex-1 min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${elegido ? "border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/20 dark:bg-blue-900/20 dark:text-blue-300" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-200"}`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${elegido ? "border-blue-600 bg-blue-600" : "border-slate-400"}`}>{elegido && <span className="h-1.5 w-1.5 rounded-full bg-white" />}</span>
                <span className="flex-1 truncate font-semibold">{rf.name}</span>
                {nuevo && <span className="shrink-0 rounded-full border border-amber-300 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 dark:border-amber-700 dark:text-amber-400">nuevo</span>}
              </button>
              {!(sinQuitarElegido && elegido) ? (
                <button type="button" onClick={() => onQuitar(rf)} title={`Quitar ${rf.name}`} aria-label={`Quitar ${rf.name}`} className="shrink-0 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-400 active:bg-red-50 hover:text-red-500 dark:border-slate-700">
                  <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="h-10 w-10 shrink-0" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
    )}
    <button type="button" onClick={onOtro} title="Buscar otro rol empresa" className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">
      <FontAwesomeIcon icon={faPlus} className="h-3 w-3" /> Otro rol
    </button>
    {nota}
  </div>
);

/** La ventana «Otro rol empresa»: buscador arriba y la grilla del catálogo; tocar uno lo elige y cierra. */
export const ModalOtroRol: React.FC<{
  abierto: boolean;
  onCerrar: () => void;
  subtitulo: string;
  /** El recuadro azul de arriba (qué roles se ofrecen); tocarlo abre la explicación. */
  aviso?: string | null;
  onAviso?: () => void;
  busqueda: string;
  onBusqueda: (v: string) => void;
  roles: RoleFrameItem[];
  onElegir: (id: string) => void;
  zIndex?: number;
}> = ({ abierto, onCerrar, subtitulo, aviso, onAviso, busqueda, onBusqueda, roles, onElegir, zIndex = 80 }) => (
  <Modal
    isOpen={abierto}
    onClose={onCerrar}
    title="Otro rol empresa"
    subtitle={subtitulo}
    size="lg"
    zIndex={zIndex}
    footer={
      <div className="flex w-full justify-between items-center gap-3">
        <span />
        <button type="button" onClick={onCerrar} className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 font-bold text-sm text-slate-600 dark:text-slate-300">
          Cancelar
        </button>
      </div>
    }
  >
    <div className="space-y-3">
      {aviso && (
        <button type="button" onClick={onAviso} className="w-full text-left rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] text-blue-700 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-300 flex items-start gap-2">
          <FontAwesomeIcon icon={faCircleInfo} className="mt-0.5 shrink-0" />
          <span>{aviso}</span>
        </button>
      )}
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors pointer-events-none">
          <FontAwesomeIcon icon={faSearch} className="text-sm" />
        </div>
        <input
          type="text"
          autoFocus
          value={busqueda}
          onChange={(e) => onBusqueda(e.target.value)}
          autoComplete="off"
          className="w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-11 pr-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white"
          placeholder="Buscar especialidad..."
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[45vh] overflow-y-auto pr-1">
        {roles.length === 0 ? (
          <p className="col-span-full py-8 text-center text-xs text-slate-400 italic">{busqueda ? `No se encontraron especialidades que coincidan con "${busqueda}"` : "No hay roles para ofrecer."}</p>
        ) : (
          roles.map((rf) => (
            <button
              key={rf._id}
              type="button"
              onClick={() => onElegir(rf._id)}
              className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left text-sm text-slate-700 transition-all hover:border-blue-400 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
            >
              {rf.name}
            </button>
          ))
        )}
      </div>
    </div>
  </Modal>
);
