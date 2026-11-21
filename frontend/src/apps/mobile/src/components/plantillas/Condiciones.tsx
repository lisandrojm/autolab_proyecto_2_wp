import type { ReactNode } from "react";
import { LoadingSpinner } from "../../../../../components/ui/LoadingSpinner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { SelectorHora } from "../../../../../components/contratacion/SelectorHora";
import { HojaModal } from "./HojaModal";
import { CampoTipoContrato, ModalTipoContrato } from "../contratacion/SelectorTipoContrato";
import { ListaTurnos } from "./DetalleGrupo";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { CLASE_HORA, DIAS, textoHorario } from "./comun";
import { AIRE_DOS_LINEAS_SIN_CRUZ, MARGEN, pastillaDe } from "./piezas";
import { textoDeDias } from "../../../../../utils/jerarquiaTurnos";
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

/*
  CON UN CONTRATO DE ARCA EN ESAS FECHAS, SÓLO SERVICIOS (17/11/2026; la regla del alta individual del
  05/11). `soloServicios` es el mensaje del server (`mensajeSoloServicios`) o vacío: con él, la ventana
  del tipo ofrece SÓLO los tipos de Servicios (pedido del usuario, 19/11: «si sólo podría pedir Servicios,
  no debería mostrar los de ARCA»), en la fila de la persona y en el puesto. El tipo general («para
  todos») no se acota: si es de ARCA, la fila lo muestra marcado y el server lo devuelve como AVISO que
  no frena (`planDeLote`, decisión del 19/11); al tocar la fila sólo se puede pasar a Servicios.
*/
export const contratosParaElegir = (catalogos: CatalogosContratacion, soloServicios?: string | null) => (soloServicios ? catalogos.contratos.filter((c) => catalogos.tramitePorContrato.get(c._id) === "constancia_cuit") : catalogos.contratos);

export function AvisoSoloServicios({ mensaje, contratoId, catalogos }: { mensaje?: string | null; contratoId?: string | null; catalogos: CatalogosContratacion }) {
  if (!mensaje) return null;
  const esArca = !!contratoId && catalogos.tramitePorContrato.get(contratoId) === "alta_temprana_afip";
  return (
    <p className={`rounded-lg p-2 text-xs font-semibold ${esArca ? "bg-red-50 text-red-800 dark:bg-red-500/10 dark:text-red-200" : "bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"}`}>
      {mensaje}
      {esArca && " Tocá el tipo de contrato para pasarlo a Servicios; si se envía así, va como aviso."}
    </p>
  );
}

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
export function HojasCondiciones({ cual, onCerrar, titulo, areas, catalogos, valores, onCambio, soloServicios }: Omit<HojaProps, "abierta"> & { cual: HojaCondicion; soloServicios?: string | null }) {
  return (
    <>
      {/* El tipo de contrato: la misma ventana del alta individual, con el badge del trámite al lado de cada uno. */}
      <ModalTipoContrato abierto={cual === "contrato"} onCerrar={onCerrar} contratos={contratosParaElegir(catalogos, soloServicios)} contratoId={valores.contratoId || ""} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onElegir={(id) => onCambio(cambiosDeContrato(catalogos, id))} />
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
  /**
   * SIN LA FILA DEL HORARIO: en el EQUIPO. El horario es de cada persona —el que trae el turno es el
   * valor por defecto, y se cambia en la hoja de la persona o en el puesto—, así que un horario
   * «general del equipo» era un dato que parecía mandar y no mandaba. En el puesto la fila sigue: ahí
   * sí es de esa persona.
   */
  sinHorario?: boolean;
  /** Algo al lado del rótulo «Tipo de contrato» (el ⓘ del equipo: es el valor por defecto de cada puesto). */
  infoContrato?: ReactNode;
  /** La persona tiene un contrato de ARCA vigente: el mensaje (ver `AvisoSoloServicios`). */
  soloServicios?: string | null;
  /** Un alta que PODRÍA trabar según las fechas (todavía no hay): sólo se avisa, no recorta los tipos. */
  avisoAlta?: string | null;
}

/**
 * Las filas, en el orden del alta individual: tipo de contrato (el campo del individual, con su
 * badge de trámite), y debajo, en su tarjeta, área y turno (abre su hoja), horario y días (se editan
 * acá mismo).
 */
export function FilasCondiciones({ valores, areas, catalogos, onAbrirContrato, onAbrirTurno, onCambio, distintas, sinHorario, infoContrato, soloServicios, avisoAlta }: FilasProps) {
  const turno = nombreTurno(areas, valores.areaId, valores.shiftId);
  const sueltos = porDiasSueltos(catalogos, valores.contratoId);
  const dias = valores.diasSemana || [];
  const marca = (k: string) => (distintas?.has(k) ? <span className="ml-1.5 rounded bg-amber-100 px-1 text-[11px] font-bold text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">distinto</span> : null);
  return (
    <div className="space-y-3">
    <CampoTipoContrato contratos={catalogos.contratos} contratoId={valores.contratoId || ""} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onAbrir={onAbrirContrato} marca={<>{marca("contrato")}{infoContrato && <span className="font-normal normal-case tracking-normal">{infoContrato}</span>}</>} />
    <AvisoSoloServicios mensaje={soloServicios} contratoId={valores.contratoId} catalogos={catalogos} />
    {!soloServicios && avisoAlta && <p className="rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{avisoAlta}</p>}

    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
      <button type="button" onClick={onAbrirTurno} className="flex min-h-[56px] w-full items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Área y turno{marca("turno")}</span>
          {/*
            EL MISMO BADGE QUE EN LA TARJETA DEL GRUPO: el área y el turno arriba, y debajo el horario y los
            días que trae ese turno. Antes decía sólo «Libertador · Mañana», y con el horario fuera del equipo
            (es por persona) no quedaba en ningún lado a qué hora entra y qué días trabaja el turno elegido:
            es el valor por defecto de cada persona, y tiene que verse donde se elige.
          */}
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {turno ? (
              <span className={`${pastillaDe("azul")} ${AIRE_DOS_LINEAS_SIN_CRUZ} ${MARGEN} min-w-0`}>
                <span className="min-w-0">
                  <span className="block truncate uppercase tracking-wide">{turno}</span>
                  <span className="block truncate text-[10px] font-normal opacity-80">{[textoHorario(valores.inTime, valores.outTime), textoDeDias(valores.diasSemana)].filter(Boolean).join(" · ")}</span>
                </span>
              </span>
            ) : areas === null && valores.shiftId ? (
              <span aria-label="Cargando el turno"><LoadingSpinner naked size="xs" /></span>
            ) : (
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Elegí el turno</span>
            )}
          </span>
        </span>
        <FontAwesomeIcon icon={faChevronRight} className="shrink-0 text-slate-500" />
      </button>

      {!sinHorario && (
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
      )}

      {/*
        SIEMPRE, también por jornada: ahí las fechas se eligen al contratar y estos días quedan de
        referencia (los del turno, los que muestra el badge). Escondida, un turno que trajo «Lun a Dom»
        no se podía corregir desde ningún lado.
      */}
      <div className="px-3 py-2">
        <span className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Días{marca("dias")}</span>
        {sueltos && <p className="mb-1.5 text-xs text-slate-500 dark:text-slate-400">Las fechas exactas se eligen al contratar; estos días son los del turno.</p>}
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
      </div>
    </div>
    </div>
  );
}
