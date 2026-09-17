import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faFilter, faSearch, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../ui/Modal";
import { User } from "../../api/users";
import { fuzzyMatch } from "../../utils/searchHelpers";

/*
  ELEGIR A QUIÉN REEMPLAZA, DE ENTRE EL EQUIPO DEL PROYECTO.

  Era un `<select>` nativo: una lista de nombres sin orden útil, sin buscador y sin decir qué hace
  cada uno. Con un equipo de sesenta personas, encontrar a la que se reemplaza es scrollear a ojo
  leyendo nombres parecidos, y no hay forma de contestar «¿cuál de los tres Martínez es el editor?».

  Es la misma ventana que usa la Solicitud de Contratación de la app para elegir a la persona:
  buscador arriba, filtro por rol al lado y la lista con lugar de sobra, cada fila con el email y el
  rol que la persona tiene EN ESTE proyecto —que es lo que la distingue de otra con el mismo nombre—.

  EL FILTRO DE ROL VIVE ACÁ ADENTRO, desplegable, y no en una segunda ventana encima de ésta: filtra
  esta lista y nada más, y abrir una ventana para volver a la anterior es un viaje por cada rol que
  se prueba.
*/

export interface MiembroElegible {
  user: User;
  /** El id de FRAME (`metadata.id`): es lo que el contrato guarda como empleado reemplazado. */
  idFrame: string;
  nombre: string;
  email: string;
  /** El rol que tiene en ESTE proyecto; si no, el primero de su ficha. */
  rolFrame: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Los candidatos, ya sin la persona que se está contratando. */
  miembros: MiembroElegible[];
  /** Lo elegido hoy (id de FRAME). Vacío = todavía nadie. */
  valor: string;
  onElegir: (idFrame: string) => void;
  /** Deja el campo sin nadie. */
  onQuitar: () => void;
  /** Por encima del modal del wizard, que vive en z-90. */
  zIndex?: number;
}

export const SelectorMiembroModal: React.FC<Props> = ({ isOpen, onClose, miembros, valor, onElegir, onQuitar, zIndex = 110 }) => {
  const [busqueda, setBusqueda] = useState("");
  const [rolesElegidos, setRolesElegidos] = useState<string[]>([]);
  const [verRoles, setVerRoles] = useState(false);

  // Se abre para buscar: el texto de la vez anterior sólo esconde gente sin decir por qué.
  useEffect(() => {
    if (!isOpen) return;
    setBusqueda("");
    setVerRoles(false);
  }, [isOpen]);

  /** Los roles que EXISTEN en este equipo. Ofrecer el catálogo entero llenaría el filtro de opciones vacías. */
  const roles = useMemo(() => [...new Set(miembros.map((m) => m.rolFrame).filter((r) => r && r !== "-"))].sort((a, b) => a.localeCompare(b)), [miembros]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim();
    return miembros.filter((m) => {
      const coincideTexto = !q || fuzzyMatch(`${m.nombre} ${m.email} ${m.rolFrame}`, q);
      const coincideRol = rolesElegidos.length === 0 || rolesElegidos.includes(m.rolFrame);
      return coincideTexto && coincideRol;
    });
  }, [miembros, busqueda, rolesElegidos]);

  const elegido = miembros.find((m) => m.idFrame && String(m.idFrame) === String(valor));

  const alternarRol = (rol: string) => setRolesElegidos((prev) => (prev.includes(rol) ? prev.filter((r) => r !== rol) : [...prev, rol]));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Empleado reemplazado"
      subtitle={elegido ? elegido.nombre : "Del equipo del proyecto: buscá por nombre, email o rol"}
      size="lg"
      zIndex={zIndex}
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {/* Quitar sólo si hay alguien: el botón que no hace nada es ruido. */}
          {elegido ? (
            <button
              type="button"
              onClick={() => {
                onQuitar();
                onClose();
              }}
              className="inline-flex items-center gap-2 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
              Quitar el reemplazado
            </button>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose} className="btn-secondary">
            Cerrar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <FontAwesomeIcon icon={faSearch} className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, email o rol"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            />
          </div>
          {roles.length > 1 && (
            <button
              type="button"
              onClick={() => setVerRoles((v) => !v)}
              aria-expanded={verRoles}
              className={`inline-flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${rolesElegidos.length > 0 ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300"}`}
            >
              <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
              Rol {rolesElegidos.length > 0 && `(${rolesElegidos.length})`}
            </button>
          )}
        </div>

        {/* Los roles del equipo, para tildar. Se despliegan acá y no en otra ventana. */}
        {verRoles && roles.length > 1 && (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-gray-200 p-2.5 dark:border-gray-700">
            {roles.map((rol) => {
              const activo = rolesElegidos.includes(rol);
              return (
                <button
                  key={rol}
                  type="button"
                  onClick={() => alternarRol(rol)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${activo ? "border-blue-500 bg-blue-500 text-white" : "border-gray-200 bg-gray-50 text-gray-600 hover:border-blue-300 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300"}`}
                >
                  {rol}
                </button>
              );
            })}
          </div>
        )}

        {/*
          QUÉ SE ESTÁ FILTRANDO, ESCRITO.

          El botón dice «Rol (2)»: avisa que hay un filtro pero no cuál, así que para saber por qué
          falta alguien en la lista habría que volver a desplegarlo. Cada uno se saca desde su X.
        */}
        {rolesElegidos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {rolesElegidos.map((rol) => (
              <span key={rol} className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1 pl-2.5 pr-1.5 text-[11px] font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                {rol}
                <button type="button" onClick={() => alternarRol(rol)} title={`Quitar el filtro ${rol}`} className="rounded-full p-0.5 hover:bg-blue-200 dark:hover:bg-blue-800/60">
                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
            {rolesElegidos.length > 1 && (
              <button type="button" onClick={() => setRolesElegidos([])} className="px-1 text-[11px] font-semibold text-gray-500 transition-colors hover:text-red-500">
                Quitar todos
              </button>
            )}
          </div>
        )}

        <p className="text-[11px] text-gray-500 dark:text-gray-400">{filtrados.length === miembros.length ? `${miembros.length} ${miembros.length === 1 ? "persona" : "personas"} en el equipo` : `${filtrados.length} de ${miembros.length}`}</p>

        <div className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200 dark:divide-gray-700/60 dark:border-gray-700">
          {filtrados.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-center">
              <FontAwesomeIcon icon={faUsers} className="h-8 w-8 text-gray-300" />
              <p className="text-sm text-gray-500">{busqueda.trim() ? `Nadie del equipo coincide con «${busqueda.trim()}»` : "El proyecto no tiene a nadie más en el equipo"}</p>
              {rolesElegidos.length > 0 && <p className="text-xs text-gray-400">Probá quitando el filtro de rol.</p>}
            </div>
          ) : (
            filtrados.map((m) => {
              const esElElegido = !!m.idFrame && String(m.idFrame) === String(valor);
              return (
                <button
                  key={m.user._id}
                  type="button"
                  // Sin id de FRAME no se puede guardar: el contrato referencia ese número.
                  disabled={!m.idFrame}
                  onClick={() => {
                    onElegir(String(m.idFrame));
                    onClose();
                  }}
                  title={m.idFrame ? m.nombre : `${m.nombre} no tiene id de FRAME: no se puede referenciar como reemplazado`}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50 ${esElElegido ? "bg-blue-50 dark:bg-blue-900/20" : "hover:bg-gray-50 dark:hover:bg-gray-900/40"}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{m.nombre}</span>
                    {m.email && <span className="block truncate text-[11px] text-gray-500 dark:text-gray-400">{m.email}</span>}
                  </span>
                  {m.rolFrame && m.rolFrame !== "-" && <span className="shrink-0 rounded bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">{m.rolFrame}</span>}
                  {esElElegido && <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
};
