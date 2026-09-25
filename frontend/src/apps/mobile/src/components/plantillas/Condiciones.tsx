import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { HojaInferior } from "./HojaInferior";
import { ListaTurnos } from "./DetalleGrupo";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { ChipTurno, CLASE_HORA, DIAS, textoHorario } from "./comun";
import { nombreTurno } from "./equipoUtil";

/*
  LAS CONDICIONES (tipo de contrato, área y turno, horario, días), como las editan el EQUIPO (para
  todos sus puestos) y un PUESTO (sólo lo distinto). Mismas filas en los dos lugares.

  «Contrato y turno» es UN panel: se toca el contrato y después el turno, y el turno cierra el panel
  y completa horario y días. Así, poner un equipo entero en «Técnica · Noche · Jornada» son 3 toques.
*/

export interface ValoresCondiciones {
  contratoId?: string | null;
  nombreContrato?: string | null;
  areaId?: string | null;
  shiftId?: string | null;
  inTime?: string | null;
  outTime?: string | null;
  diasSemana?: number[];
  diasRotativos?: boolean;
}

/** Lo que manda elegir un turno: su área y turno, su horario y sus días. */
export const cambiosDeTurno = (o: OpcionAreaTurno) => ({ areaId: o.areaId, shiftId: o.shiftId, inTime: o.inicio || null, outTime: o.fin || null, ...(o.dias.length ? { diasSemana: o.dias, diasPorSemana: o.dias.length } : {}) });

/** Lo que manda elegir un tipo de contrato: el id, su nombre y su trámite (como el alta individual). */
export const cambiosDeContrato = (catalogos: CatalogosContratacion, contratoId: string) => ({
  contratoId: contratoId || null,
  nombreContrato: catalogos.contratos.find((c) => c._id === contratoId)?.name || null,
  tipoImpositivo: catalogos.tramitePorContrato.get(contratoId) || null,
});

export const porDiasSueltos = (catalogos: CatalogosContratacion, contratoId?: string | null) => (catalogos.contratos.find((c) => c._id === contratoId) as any)?.data?.modoFechas === "dias";

interface HojaProps {
  abierta: boolean;
  onCerrar: () => void;
  titulo: string;
  areas: OpcionAreaTurno[] | null;
  catalogos: CatalogosContratacion;
  valores: ValoresCondiciones;
  onCambio: (cambios: Record<string, any>) => void;
}

export function HojaContratoYTurno({ abierta, onCerrar, titulo, areas, catalogos, valores, onCambio }: HojaProps) {
  return (
    <HojaInferior abierta={abierta} onCerrar={onCerrar} titulo={titulo} subtitulo="Elegí el contrato y después el turno">
      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Tipo de contrato</p>
          <div className="flex flex-wrap gap-2">
            {catalogos.contratos.map((c) => {
              const on = c._id === valores.contratoId;
              return (
                <button key={c._id} type="button" aria-pressed={on} onClick={() => onCambio(cambiosDeContrato(catalogos, c._id))} className={`min-h-[44px] rounded-full px-4 text-sm font-semibold ${on ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-800 dark:border-slate-600 dark:text-slate-100"}`}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">Área y turno</p>
          <ListaTurnos
            areas={areas}
            valor={valores.areaId && valores.shiftId ? `${valores.areaId}::${valores.shiftId}` : ""}
            onElegir={(v) => {
              const o = (areas || []).find((x) => `${x.areaId}::${x.shiftId}` === v);
              if (!o) return;
              onCambio(cambiosDeTurno(o));
              onCerrar();
            }}
          />
        </div>
      </div>
    </HojaInferior>
  );
}

interface FilasProps {
  valores: ValoresCondiciones;
  areas: OpcionAreaTurno[] | null;
  catalogos: CatalogosContratacion;
  onAbrirContratoYTurno: () => void;
  onCambio: (cambios: Record<string, any>) => void;
  /** Marca las filas que difieren (en un puesto). */
  distintas?: Set<string>;
}

/** Las filas: «Contrato y turno» (abre el panel), horario y días (se editan acá mismo). */
export function FilasCondiciones({ valores, areas, catalogos, onAbrirContratoYTurno, onCambio, distintas }: FilasProps) {
  const turno = nombreTurno(areas, valores.areaId, valores.shiftId);
  const contrato = valores.contratoId ? catalogos.contratos.find((c) => c._id === valores.contratoId)?.name || valores.nombreContrato || "Contrato" : "";
  const sueltos = porDiasSueltos(catalogos, valores.contratoId);
  const dias = valores.diasSemana || [];
  const marca = (k: string) => (distintas?.has(k) ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">distinto</span> : null);
  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
      <button type="button" onClick={onAbrirContratoYTurno} className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Contrato y turno{marca("turno")}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {turno ? (
              <ChipTurno inicio={valores.inTime} texto={turno} />
            ) : areas === null && valores.shiftId ? (
              <span className="h-5 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" aria-label="Cargando el turno" />
            ) : (
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Elegí el turno</span>
            )}
            {contrato ? <span className="text-sm font-semibold text-slate-900 dark:text-white">{contrato}</span> : <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Elegí el contrato</span>}
          </span>
        </span>
        <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />
      </button>

      <div className="px-3 py-2">
        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Horario{marca("horario")}</span>
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <SelectorHora valor={valores.inTime || ""} onCambio={(h) => onCambio({ inTime: h || null })} etiqueta="Entrada" placeholder="Entrada" className={CLASE_HORA} zIndex={120} />
          </div>
          <FontAwesomeIcon icon={faArrowRight} className="text-xs text-slate-500" aria-hidden />
          <div className="flex-1">
            <SelectorHora valor={valores.outTime || ""} onCambio={(h) => onCambio({ outTime: h || null })} etiqueta="Salida" placeholder="Salida" desde={valores.inTime || ""} className={CLASE_HORA} zIndex={120} />
          </div>
        </div>
        <span className="sr-only">{textoHorario(valores.inTime, valores.outTime)}</span>
      </div>

      <div className="px-3 py-2">
        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Días{marca("dias")}</span>
        {sueltos ? (
          <p className="text-sm text-slate-700 dark:text-slate-200">Por jornada: los días se eligen al contratar.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {DIAS.map((d) => {
                const on = dias.includes(d.i);
                return (
                  <button key={d.i} type="button" aria-pressed={on} onClick={() => { const nuevos = on ? dias.filter((x) => x !== d.i) : [...dias, d.i].sort(); onCambio({ diasSemana: nuevos, diasPorSemana: nuevos.length || null }); }} className={`h-11 w-11 rounded-xl text-sm font-bold ${on ? "bg-blue-600 text-white" : "border border-slate-300 text-slate-700 dark:border-slate-600 dark:text-slate-200"}`}>
                    {d.corto}
                  </button>
                );
              })}
            </div>
            <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm text-slate-800 dark:text-slate-100">
              <input type="checkbox" checked={!!valores.diasRotativos} onChange={(e) => onCambio({ diasRotativos: e.target.checked })} className="h-5 w-5" />
              Días rotativos
            </label>
          </>
        )}
      </div>
    </div>
  );
}
