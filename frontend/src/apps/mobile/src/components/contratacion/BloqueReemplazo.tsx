import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faExchangeAlt, faSearch, faTimes } from "@fortawesome/free-solid-svg-icons";
import { Modal } from "../Modal";

/*
  EL REEMPLAZO, COMO SE CARGA EN EL ALTA INDIVIDUAL: el interruptor, el motivo y a quién reemplaza.

  Vivía adentro de `UserRegistrationModal`. Las plantillas de equipo lo cargan por puesto y por persona
  con otro dibujo —un switch suelto y pastillas de motivo—, y la misma pregunta se veía distinta según
  la pantalla. Ahora es el mismo bloque.

  EL MOTIVO VA PRIMERO. Es el orden en que se piensa —«falta por vacaciones… ah, sí, falta Fulano»— y
  el que puede cambiar la respuesta al segundo. Sale del mismo catálogo que Novedades y se abre en la
  misma ventana («Configurar Motivo»), para que se reconozca como lo mismo.

  A QUIÉN REEMPLAZA lo elige quien usa el bloque (cada pantalla tiene su buscador sobre el equipo del
  proyecto); acá sólo se muestra y se quita.
*/
interface Props {
  activo: boolean;
  /** Apagar LIMPIA motivo y reemplazado: quien lo usa lo hace al recibir `false`. */
  onActivo: (v: boolean) => void;
  motivos: { _id: string; name: string }[];
  motivoId: string;
  onMotivo: (id: string) => void;
  nombreReemplazado: string;
  onElegirPersona: () => void;
  onQuitarPersona: () => void;
  zIndex?: number;
  /**
   * Qué días cubre el contrato, para decirlo en el aviso del motivo: «las 2 jornadas: 01/10/2026 y
   * 02/10/2026». Sin esto el aviso habla de «todos los días del contrato» en general.
   */
  alcance?: string;
}

export function BloqueReemplazo({ activo, onActivo, motivos, motivoId, onMotivo, nombreReemplazado, onElegirPersona, onQuitarPersona, zIndex = 80, alcance }: Props) {
  const [motivoAbierto, setMotivoAbierto] = useState(false);
  const motivoElegido = motivos.find((m) => m._id === motivoId) || null;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
            <FontAwesomeIcon icon={faExchangeAlt} />
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Reemplazo?</p>
            <p className="text-xs text-slate-500">¿Esta persona reemplaza a alguien?</p>
          </div>
        </div>
        <label className="relative inline-flex cursor-pointer items-center">
          <input type="checkbox" checked={activo} onChange={(e) => onActivo(e.target.checked)} className="peer sr-only" />
          <div className="h-6 w-11 rounded-full bg-slate-300 transition-colors duration-200 ease-in-out after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-blue-600 peer-checked:after:translate-x-5 peer-focus:outline-none dark:bg-slate-700"></div>
          <span className="ml-3 text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">{activo ? "SÍ" : "NO"}</span>
        </label>
      </div>

      {activo && (
        <div className="relative space-y-1">
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <FontAwesomeIcon icon={faClock} className="text-[10px] text-blue-500" />
              Motivo <span className="text-red-500">*</span>
            </label>
            {/* Pedido del 09/10/2026: el reemplazo cubre el contrato entero; uno de un día va en su propio contrato. */}
            <p className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {alcance ? <>El motivo vale para TODO el contrato: {alcance}.</> : "El motivo vale para todos los días del contrato."} Si el reemplazo es sólo por uno de esos días, hacé un contrato aparte para ese día.
            </p>
            {motivoElegido ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <button type="button" onClick={() => setMotivoAbierto(true)} title="Cambiar el motivo" className="max-w-[16rem] truncate text-left">
                    {motivoElegido.name}
                  </button>
                  <button type="button" onClick={() => onMotivo("")} title="Quitar" className="rounded-full p-1 hover:bg-blue-200 dark:hover:bg-blue-800/60">
                    <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => setMotivoAbierto(true)} className="flex h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left font-medium outline-none transition-all hover:border-blue-400 focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900">
                <FontAwesomeIcon icon={faClock} className="shrink-0 text-sm text-slate-400" />
                <span className="truncate text-slate-400">Configurar Motivo…</span>
              </button>
            )}
          </div>
          <div className="space-y-1 pt-3">
            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              <FontAwesomeIcon icon={faSearch} className="text-[10px] text-blue-500" />
              ¿A quién reemplaza? <span className="text-red-500">*</span>
            </label>
            {/* Mismo tratamiento que «Persona»: también se elige a alguien, así que se ve igual. */}
            {nombreReemplazado ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 py-1.5 pl-3 pr-1.5 text-sm font-semibold text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                  <button type="button" onClick={onElegirPersona} title="Cambiar a quién reemplaza" className="max-w-[16rem] truncate text-left">
                    {nombreReemplazado}
                  </button>
                  <button type="button" onClick={onQuitarPersona} title="Quitar" className="rounded-full p-1 hover:bg-blue-200 dark:hover:bg-blue-800/60">
                    <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={onElegirPersona} className="flex h-12 w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left font-medium outline-none transition-all hover:border-blue-400 focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-900">
                <FontAwesomeIcon icon={faSearch} className="shrink-0 text-sm text-slate-400" />
                <span className="truncate text-slate-400">Buscar en el equipo del proyecto…</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* El motivo, en la misma ventana que «Configurar Ausencia» de Novedades: de ahí salen estos motivos. */}
      <Modal
        isOpen={motivoAbierto}
        onClose={() => setMotivoAbierto(false)}
        title="Configurar Motivo"
        size="md"
        zIndex={zIndex}
        footer={
          <div className="flex w-full items-center justify-end gap-3">
            <button type="button" onClick={() => setMotivoAbierto(false)} className="rounded-lg bg-blue-500 px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]">
              Listo
            </button>
          </div>
        }
      >
        <div className="space-y-4 pb-4 pt-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">Motivo</label>
            <select
              className="w-full rounded border border-slate-300 bg-white p-3 text-slate-900 focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
              value={motivoId}
              onChange={(e) => {
                onMotivo(e.target.value);
                if (e.target.value) setMotivoAbierto(false);
              }}
            >
              <option value="">Seleccionar motivo...</option>
              {motivos.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          {motivos.length === 0 && <p className="text-xs text-amber-600 dark:text-amber-400">No hay motivos configurados. Se cargan en Configuración → Novedades.</p>}
          <p className="text-[11px] text-slate-400">Es el motivo por el que falta la persona que se reemplaza. Son los mismos motivos que se usan en Novedades.</p>
        </div>
      </Modal>
    </div>
  );
}
