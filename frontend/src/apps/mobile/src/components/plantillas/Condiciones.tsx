import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { HojaModal } from "./HojaModal";
import { CampoTipoContrato, ModalTipoContrato } from "../contratacion/SelectorTipoContrato";
import { ListaTurnos } from "./DetalleGrupo";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { ChipTurno, CLASE_HORA, DIAS, textoHorario } from "./comun";
import { nombreTurno } from "./equipoUtil";

/*
  LAS CONDICIONES (tipo de contrato, área y turno, horario, días), como las editan el EQUIPO (para
  todos sus puestos) y un PUESTO (sólo lo distinto). Mismas filas en los dos lugares.

  EN EL ORDEN DEL ALTA INDIVIDUAL Y CADA UNA EN SU CAMPO: tipo de contrato, área y turno, horario,
  días. Eran un solo panel («Contrato y turno») que ahorraba un toque, pero mezclaba dos preguntas de
  distinta naturaleza —bajo qué contrato, y dónde y cuándo— en un renglón que no se parecía a ningún
  otro de la app. Quien viene del formulario de a una persona encuentra acá los mismos campos, en el
  mismo orden. El turno sigue completando horario y días al elegirlo.
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

/** Cuál de las dos hojas está abierta. */
export type HojaCondicion = null | "contrato" | "turno";

/**
 * LAS DOS HOJAS, cada una la suya: el tipo de contrato y el área y turno.
 *
 * Elegir cierra la hoja: son elecciones de UNA cosa, y dejarla abierta después de tocar es obligar a
 * buscar la cruz. El turno, además, completa horario y días.
 */
export function HojasCondiciones({ cual, onCerrar, titulo, areas, catalogos, valores, onCambio }: Omit<HojaProps, "abierta"> & { cual: HojaCondicion }) {
  return (
    <>
      {/* El tipo de contrato: la misma ventana del alta individual, con el badge del trámite al lado de cada uno. */}
      <ModalTipoContrato abierto={cual === "contrato"} onCerrar={onCerrar} contratos={catalogos.contratos} contratoId={valores.contratoId || ""} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onElegir={(id) => onCambio(cambiosDeContrato(catalogos, id))} />
      <HojaModal abierta={cual === "turno"} onCerrar={onCerrar} titulo={titulo} subtitulo="Área y turno · completa el horario y los días">
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
      </HojaModal>
    </>
  );
}

interface FilasProps {
  valores: ValoresCondiciones;
  areas: OpcionAreaTurno[] | null;
  catalogos: CatalogosContratacion;
  onAbrirContrato: () => void;
  onAbrirTurno: () => void;
  onCambio: (cambios: Record<string, any>) => void;
  /** Marca las filas que difieren (en un puesto). */
  distintas?: Set<string>;
}

/**
 * Las filas, en el orden del alta individual: tipo de contrato (el campo del individual, con su
 * badge de trámite), y debajo, en su tarjeta, área y turno (abre su hoja), horario y días (se editan
 * acá mismo).
 */
export function FilasCondiciones({ valores, areas, catalogos, onAbrirContrato, onAbrirTurno, onCambio, distintas }: FilasProps) {
  const turno = nombreTurno(areas, valores.areaId, valores.shiftId);
  const sueltos = porDiasSueltos(catalogos, valores.contratoId);
  const dias = valores.diasSemana || [];
  const marca = (k: string) => (distintas?.has(k) ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">distinto</span> : null);
  return (
    <div className="space-y-3">
    <CampoTipoContrato contratos={catalogos.contratos} contratoId={valores.contratoId || ""} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onAbrir={onAbrirContrato} marca={marca("contrato")} />

    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
      <button type="button" onClick={onAbrirTurno} className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Área y turno{marca("turno")}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {turno ? (
              <ChipTurno inicio={valores.inTime} texto={turno} />
            ) : areas === null && valores.shiftId ? (
              <span className="h-5 w-24 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" aria-label="Cargando el turno" />
            ) : (
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Elegí el turno</span>
            )}
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
    </div>
  );
}
