import React, { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faCircleCheck, faRotate } from "@fortawesome/free-solid-svg-icons";
import { arcaRelacionesAPI, type AuditoriaArca, type ItemAuditoriaBaja, type ItemDiscrepanciaFrame, type ItemRelacionSinContrato, type ItemRelacionVariosContratos } from "../../api/arcaRelaciones";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { TablaConEncabezadoFijo } from "../ui/TablaConEncabezadoFijo";
import { sweetAlert } from "../../utils/sweetAlert";
import { SincronizarBajasModal } from "./SincronizarBajasModal";

/*
  AUDITORÍA ARCA (etapa 5, 20/11/2026): lo que NO encaja entre WeProdu y ARCA, en un solo lugar, para que
  lo mire una persona. Las bajas con evidencia fuerte ya llegan solas al contrato después de la corrida de
  las 06:00; acá queda lo que no se escribe porque la evidencia no alcanza o porque es un hecho que alguien
  tiene que decidir. Nada de esta pestaña escribe: lista, con las dos fechas y el porqué.
  El contador de la pestaña y del menú lee los totales guardados (se actualizan con cada corrida y cada vez
  que se abre esto).
*/

const fecha = (iso: string | null | undefined) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");
const fechaHora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const CAMPO_FRAME: Record<string, string> = { categoria_sat_id: "Categoría", fecha_baja_contrato: "Fecha de baja" };

const th = "px-2 py-1.5 text-left text-[11px] uppercase tracking-wide text-gray-500 bg-gray-50 dark:bg-gray-900/40";
const tdPersona = (persona: string, detalle: string) => (
  <td className="px-2 py-1.5">
    <div className="font-semibold text-gray-800 dark:text-gray-100">{persona}</div>
    <div className="text-[11px] text-gray-500">{detalle}</div>
  </td>
);

const FilaBaja: React.FC<{ x: ItemAuditoriaBaja }> = ({ x }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 align-top">
    {tdPersona(x.persona, `${x.proyecto} · ${x.empleadora}`)}
    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{x.contrato}<div className="text-[11px] text-gray-500">alta {fecha(x.alta)}</div></td>
    <td className="px-2 py-1.5 whitespace-nowrap">
      <span className="text-gray-700 dark:text-gray-300">{x.bajaContrato ? fecha(x.bajaContrato) : "sin baja"}</span> · ARCA <span className="font-semibold text-gray-900 dark:text-white">{x.finArca ? fecha(x.finArca) : "abierta"}</span>
      {typeof x.diasAntesDelFin === "number" && <div className="text-[11px] text-amber-700 dark:text-amber-400">ARCA termina {x.diasAntesDelFin} días antes que el contrato</div>}
    </td>
    <td className="px-2 py-1.5 text-[11px] text-gray-600 dark:text-gray-400">{x.situacionBaja || "—"}{x.alerta && <div className="mt-0.5 text-amber-700 dark:text-amber-400">{x.alerta}</div>}</td>
  </tr>
);

const FilaRelacion: React.FC<{ x: ItemRelacionSinContrato }> = ({ x }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 align-top">
    {tdPersona(x.persona, x.empleadora)}
    <td className="px-2 py-1.5 whitespace-nowrap">
      <span className="font-semibold text-gray-900 dark:text-white">{fecha(x.inicio)} → {x.fin ? fecha(x.fin) : "abierta"}</span>
      <div className="text-[11px] text-gray-500">{x.situacionBaja || "—"}</div>
    </td>
    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">
      {x.contratos.slice(0, 5).map((c) => (
        <div key={c.contratoKey} className="whitespace-nowrap">
          {c.contrato} · {c.proyecto} · {fecha(c.alta)} → {c.baja ? fecha(c.baja) : "abierto"}
          <span className="ml-1 text-[11px] text-amber-700 dark:text-amber-400">{c.dias === 0 ? "" : c.dias > 0 ? `ARCA empieza ${c.dias} día(s) después` : `ARCA empieza ${-c.dias} día(s) antes`}</span>
        </div>
      ))}
      {x.contratos.length > 5 && <div className="text-[11px] text-gray-500">y {x.contratos.length - 5} más dentro de esa relación</div>}
    </td>
  </tr>
);

const FilaVarios: React.FC<{ x: ItemRelacionVariosContratos }> = ({ x }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 align-top">
    {tdPersona(x.persona, x.empleadora)}
    <td className="px-2 py-1.5 whitespace-nowrap">
      <span className="font-semibold text-gray-900 dark:text-white">{fecha(x.inicio)} → {x.fin ? fecha(x.fin) : "abierta"}</span>
    </td>
    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">
      {x.contratos.map((c) => (
        <div key={`${c.userProjectId}-${c.posicion}`} className="whitespace-nowrap">
          {c.contrato} · {c.proyecto || "(sin proyecto)"} · {fecha(c.alta)} → {c.baja ? fecha(c.baja) : "abierto"}
          {c.contratoKey && <span className="ml-1 text-[11px] text-gray-400 font-mono" title="La clave del contrato: es con lo que se lo nombra para anularlo.">{c.contratoKey}</span>}
        </div>
      ))}
    </td>
  </tr>
);

const FilaFrame: React.FC<{ x: ItemDiscrepanciaFrame }> = ({ x }) => (
  <tr className="border-t border-gray-100 dark:border-gray-700 align-top">
    {tdPersona(x.persona, `contrato #${x.posicion}`)}
    <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300">{CAMPO_FRAME[x.campo] || x.campo}</td>
    <td className="px-2 py-1.5 whitespace-nowrap">
      WeProdu <span className="font-semibold text-gray-900 dark:text-white">{x.weprodu}</span> · FRAME <span className="font-semibold text-gray-900 dark:text-white">{x.frame}</span>
    </td>
    <td className="px-2 py-1.5 text-[11px] text-gray-600 dark:text-gray-400">{x.veces} vez/veces · última {fechaHora(x.ultimaVezEl)}</td>
  </tr>
);

const Seccion: React.FC<{ titulo: string; n: number; explicacion: string; queHacer: string; abierta: boolean; onToggle: () => void; encabezados: string[]; children: React.ReactNode }> = ({ titulo, n, explicacion, queHacer, abierta, onToggle, encabezados, children }) => (
  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-clip">
    <button type="button" onClick={onToggle} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left">
      <span className="flex items-center gap-2">
        <FontAwesomeIcon icon={abierta ? faChevronDown : faChevronRight} className="h-3 w-3 text-gray-400" />
        <span className="font-semibold text-gray-800 dark:text-gray-100">{titulo}</span>
      </span>
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${n ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"}`}>{n}</span>
    </button>
    {abierta && (
      <div className="px-4 pb-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">{explicacion}</p>
        <p className="mt-1 text-xs font-semibold text-gray-700 dark:text-gray-300">Qué hacer: {queHacer}</p>
        {n ? (
          <TablaConEncabezadoFijo className="mt-3" tabla="min-w-[560px] text-xs">
            <thead>
              <tr>{encabezados.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
            </thead>
            <tbody>{children}</tbody>
          </TablaConEncabezadoFijo>
        ) : (
          <p className="mt-3 text-xs text-green-700 dark:text-green-300"><FontAwesomeIcon icon={faCircleCheck} className="mr-1" />Nada en esta sección.</p>
        )}
      </div>
    )}
  </div>
);

export const AuditoriaArcaTab: React.FC<{ onCountChange?: (n: number | undefined) => void }> = ({ onCountChange }) => {
  const [a, setA] = useState<AuditoriaArca | null>(null);
  const [cargando, setCargando] = useState(true);
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set(["faltaBajaArca", "revisionManual"]));
  const [verBajas, setVerBajas] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await arcaRelacionesAPI.auditoria();
      setA(r);
      onCountChange?.(r.totales.total);
    } catch (err: any) {
      sweetAlert.error("No se pudo calcular la auditoría", err?.response?.data?.error || err?.message || "");
    } finally {
      setCargando(false);
    }
  }, [onCountChange]);

  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => () => onCountChange?.(undefined), [onCountChange]);

  const toggle = (k: string) => setAbiertas((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  if (cargando && !a) return <div className="flex justify-center py-16"><LoadingSpinner message="Cargando datos..." /></div>;
  if (!a) return null;

  return (
    <div className="space-y-4">
      <SincronizarBajasModal isOpen={verBajas} onClose={() => { setVerBajas(false); void cargar(); }} />
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {a.totales.total ? `${a.totales.total} para que mire una persona` : "No hay nada que no encaje entre WeProdu y ARCA"}
          </p>
          <p className="mt-1">Espejo de ARCA al {fechaHora(a.espejoAl)} · calculado {fechaHora(a.calculadoEl)}. Las bajas con evidencia fuerte ya se aplican solas después de la corrida de las 06:00; acá queda lo que no se escribe.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setVerBajas(true)} className="px-3 py-1.5 rounded-md text-xs font-semibold border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700">Sincronizar bajas a contratos</button>
          <button type="button" onClick={() => void cargar()} disabled={cargando} className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            <FontAwesomeIcon icon={faRotate} className={cargando ? "animate-spin" : ""} />Recalcular
          </button>
        </div>
      </div>

      <Seccion titulo="Falta la baja en ARCA" n={a.totales.faltaBajaArca} abierta={abiertas.has("faltaBajaArca")} onToggle={() => toggle("faltaBajaArca")}
        explicacion="El contrato terminó en WeProdu y en ARCA la relación sigue abierta. Es la exposición legal: la persona figura empleada."
        queHacer="presentar la baja en ARCA. Nada se escribe desde acá."
        encabezados={["Persona", "Contrato", "Baja WeProdu · ARCA", "Motivo en ARCA"]}>
        {a.faltaBajaArca.map((x) => <FilaBaja key={x.contratoKey} x={x} />)}
      </Seccion>

      <Seccion titulo="Para revisar a mano" n={a.totales.revisionManual} abierta={abiertas.has("revisionManual")} onToggle={() => toggle("revisionManual")}
        explicacion="ARCA cerró la relación antes que el contrato, pero la evidencia no alcanza para escribirla: tramos de ARCA que ningún contrato explica, un hecho (renuncia, despido) en medio de varios tramos, otro contrato con la misma alta, o recibos de sueldo posteriores a la baja de ARCA. Cada fila dice cuál."
        queHacer="una persona decide; si corresponde, se escribe desde «Sincronizar bajas a contratos» o se corrige el contrato."
        encabezados={["Persona", "Contrato", "Baja WeProdu · ARCA", "Motivo en ARCA"]}>
        {a.revisionManual.map((x) => <FilaBaja key={x.contratoKey} x={x} />)}
      </Seccion>

      <Seccion titulo="ARCA termina más de 15 días antes" n={a.totales.granularidad} abierta={abiertas.has("granularidad")} onToggle={() => toggle("granularidad")}
        explicacion="ARCA declara por jornadas dentro del contrato («vencimiento de plazo»), pero el último tramo termina más de 15 días antes que el contrato: puede ser cómo ARCA registra las jornadas, o que la persona dejó antes."
        queHacer="mirar la sábana de sueldos de ese mes; si dejó antes, corregir la baja del contrato."
        encabezados={["Persona", "Contrato", "Baja WeProdu · ARCA", "Motivo en ARCA"]}>
        {a.granularidad.map((x) => <FilaBaja key={x.contratoKey} x={x} />)}
      </Seccion>

      <Seccion titulo="Relaciones de ARCA que ningún contrato explica exacto" n={a.totales.relacionSinContrato} abierta={abiertas.has("relacionSinContrato")} onToggle={() => toggle("relacionSinContrato")}
        explicacion="Una relación de ARCA cuyo inicio no es el alta exacta de ningún contrato, pero que se solapa con contratos de esa persona y empleadora: la misma relación con otra fecha (Pellegrini: 07/02 en WeProdu, 10/02 en ARCA), o un tramo de ARCA que WeProdu tiene por jornadas (los días que están en ARCA y no en WeProdu). No se alinea sola: ARCA es el registro legal, pero la diferencia puede ser un error de carga de cualquiera de los dos lados."
        queHacer="quien lleve laboral decide cuál es la fecha correcta y corrige el contrato (o ARCA)."
        encabezados={["Persona", "Relación en ARCA", "Contratos de WeProdu que se solapan"]}>
        {a.relacionSinContrato.map((x) => <FilaRelacion key={`${x.cuil}|${x.empleadoraCuit}|${x.inicio}`} x={x} />)}
      </Seccion>

      <Seccion titulo="Relación con varios contratos" n={a.totales.relacionVariosContratos ?? 0} abierta={abiertas.has("relacionVariosContratos")} onToggle={() => toggle("relacionVariosContratos")}
        explicacion="Una relación viva en ARCA (abierta, o con fin de hoy en adelante) que en WeProdu coincide con varios contratos de la misma persona, empleadora y fecha de alta: un contrato duplicado, o el mismo contrato cargado en varios proyectos. Mientras esté así NO se puede dar de baja desde WeProdu: Gestión › Bajas ARCA no la lista, porque no se sabe en qué contrato guardar el resultado."
        queHacer="anular el contrato que sobra (el que no tiene recibos, área ni sueldo cargado), nombrándolo por su clave. Cuando queda uno solo, la relación sale de acá y aparece en Bajas ARCA."
        encabezados={["Persona", "Relación en ARCA", "Contratos de WeProdu con esa alta"]}>
        {(a.relacionVariosContratos || []).map((x) => <FilaVarios key={`${x.cuil}|${x.empleadoraCuit}|${x.inicio}`} x={x} />)}
      </Seccion>

      <Seccion titulo="Discrepancias con FRAME" n={a.totales.discrepanciasFrame} abierta={abiertas.has("discrepanciasFrame")} onToggle={() => toggle("discrepanciasFrame")}
        explicacion="Contratos que FRAME manda con otra categoría u otra fecha de baja que la de WeProdu. El import no pisa nada: queda acá hasta que alguien decida. Mientras el import de FRAME esté pausado, esta lista no cambia."
        queHacer="resolver en el contrato (o en FRAME) y marcarla resuelta desde el historial del import."
        encabezados={["Persona", "Campo", "WeProdu · FRAME", "Vista"]}>
        {a.discrepanciasFrame.map((x) => <FilaFrame key={x._id} x={x} />)}
      </Seccion>
    </div>
  );
};
