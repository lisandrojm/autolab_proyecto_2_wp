import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleExclamation, faInfoCircle, faScaleBalanced, faSpinner, faToggleOff, faToggleOn, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { LoadingSpinner } from "../ui/LoadingSpinner";
import { vacationConfigAPI, VacationConfig, type AvailableContract } from "../../api/vacationConfig";
import { SelectorTiposContrato } from "./campania/SelectorTiposContrato";
import { sweetAlert } from "../../utils/sweetAlert";
import { hoyISO } from "../../utils/contratoVigencia";
import { normalizarVentana } from "@compartido/ventanaGoce";
import { fechaCorta } from "@compartido/planVacaciones/fechas";
import { alertasDeLanzamiento, fechaLimite, normalizarConfigCampania, ventanaDeLaTemporada, type ConfigCampania } from "@compartido/vacaciones/campania";

/*
  CAMPAÑA DE GOCE DE VACACIONES (15/11/2026): la configuración.

  La campaña invita a cada persona con días disponibles a elegir sus fechas dentro de la ventana anual, con
  una fecha límite; si no elige, la empresa le asigna un tramo único. Acá se fijan los plazos; la campaña
  se lanza desde Vacaciones › Campaña. La ventana es la de «Ventana Anual» (sus fechas, aunque esté
  deshabilitada para las solicitudes sueltas).

  Se guarda sólo `campania`: mandar la configuración entera pisaría lo cambiado en otra sección.
*/

const claseNumero = "w-20 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white";

const Campo: React.FC<{ etiqueta: string; ayuda: string; value: number; min: number; max: number; onChange: (n: number) => void; sufijo?: string }> = ({ etiqueta, ayuda, value, min, max, onChange, sufijo = "días" }) => (
  <label className="flex flex-col gap-1">
    <span className="text-sm font-medium text-gray-800 dark:text-gray-200">{etiqueta}</span>
    <span className="flex items-center gap-2">
      <input type="number" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className={claseNumero} />
      <span className="text-sm text-gray-500 dark:text-gray-400">{sufijo}</span>
    </span>
    <span className="text-xs text-gray-500 dark:text-gray-400">{ayuda}</span>
  </label>
);

export const CampaniaGoceConfigTab: React.FC = () => {
  const [config, setConfig] = useState<VacationConfig | null>(null);
  const [borrador, setBorrador] = useState<ConfigCampania>(normalizarConfigCampania(undefined));
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tiposDeContrato, setTiposDeContrato] = useState<AvailableContract[]>([]);

  useEffect(() => {
    // El catálogo de tipos de contrato: si no llega, la sección de tipos no se muestra y el resto funciona igual.
    vacationConfigAPI
      .getAvailableContracts()
      .then((t) => setTiposDeContrato(t.filter((x) => x.id !== null && x.id !== undefined)))
      .catch(() => setTiposDeContrato([]));
  }, []);

  useEffect(() => {
    vacationConfigAPI
      .getConfig()
      .then((c) => {
        setConfig(c);
        setBorrador(normalizarConfigCampania(c?.campania));
      })
      .catch(() => sweetAlert.error("Error", "No se pudo cargar la configuración de vacaciones."))
      .finally(() => setCargando(false));
  }, []);

  const guardado = normalizarConfigCampania(config?.campania);
  const tiposSinVacaciones = (config?.contractRules || []).filter((r) => r.vacationsEnabled === false).map((r) => r.contractId);
  const cambio = JSON.stringify(guardado) !== JSON.stringify(borrador);

  const guardar = async (nueva: ConfigCampania) => {
    setGuardando(true);
    try {
      const respuesta = await vacationConfigAPI.updateConfig({ campania: nueva });
      if (!respuesta?.campania) {
        sweetAlert.warning("No se guardó", "El servidor todavía no admite la campaña de goce: hay que publicar la versión nueva.");
        return;
      }
      setConfig(respuesta);
      setBorrador(normalizarConfigCampania(respuesta.campania));
      sweetAlert.success("Guardado", "Configuración de la campaña actualizada");
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  // La vista previa: si se lanzara hoy, con la ventana de la temporada en curso o la próxima.
  const hoy = hoyISO();
  const ventanaAnual = normalizarVentana(config?.ventanaGoce);
  const ventana = useMemo(() => ventanaDeLaTemporada(hoy, ventanaAnual), [hoy, ventanaAnual.inicio, ventanaAnual.fin]);
  const alertas = alertasDeLanzamiento({ hoy, plazoDias: borrador.plazoParaDefinirDias, avisoDias: borrador.avisoMinimoDias, ventana, diasMasLargo: 21 });

  if (cargando) return <LoadingSpinner message="Cargando configuración..." />;

  return (
    <div className="bg-white dark:bg-gray-800 rounded shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Campaña de goce de vacaciones</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Se invita a cada persona con días disponibles a elegir sus fechas dentro de la ventana anual, con una fecha límite. Si no elige a tiempo, <strong>la empresa le asigna un tramo único</strong>. En los dos casos queda el aviso por escrito y el acuse de recibo. La campaña se lanza desde <strong>Vacaciones › Campaña</strong>.
        </p>
      </div>

      {/* Lo que el sistema hace y no hace, por ley (LCT 20.744; a confirmar con el asesor). */}
      <div className="text-xs bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 p-3 rounded border border-amber-200 dark:border-amber-800 space-y-1">
        <p className="flex items-center gap-2 font-semibold">
          <FontAwesomeIcon icon={faScaleBalanced} /> Reglas que la campaña respeta siempre
        </p>
        <p>· El aviso por escrito sale con al menos los días de anticipación configurados antes del inicio (LCT art. 154: 30; el convenio puede pedir más).</p>
        <p>· La persona puede fraccionar en tramos del mínimo configurado o más, y eso es un acuerdo que aprueba la empresa. Si asigna la empresa, es <strong>un tramo único continuo</strong>: no fracciona sola.</p>
        <p>· <strong>Nunca se paga en lugar de gozar</strong> con la relación vigente (art. 156): esa opción no existe. El pago de vacaciones no gozadas corresponde sólo al egreso.</p>
        <p>· La campaña no se cierra mientras quede alguien con días sin el otorgamiento notificado: la obligación de otorgarlas es de la empresa (art. 157).</p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded border border-blue-100 dark:border-blue-800 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => guardar({ ...guardado, activa: !guardado.activa })}
            disabled={guardando}
            className={`px-3 py-1.5 rounded border text-sm font-medium flex items-center gap-2 transition-colors ${guardado.activa ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300" : "bg-gray-50 border-gray-200 text-gray-600 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-400"}`}
          >
            {guardando ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={guardado.activa ? faToggleOn : faToggleOff} />}
            {guardado.activa ? "Activa" : "Desactivada (no se pueden lanzar campañas)"}
          </button>
          <span className="text-sm text-blue-900 dark:text-blue-100">
            Ventana de la temporada: <strong>{fechaCorta(ventana.desde)} al {fechaCorta(ventana.hasta)}</strong> <span className="text-xs text-gray-500 dark:text-gray-400">(de Ventana Anual)</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Campo etiqueta="Plazo para elegir" ayuda="Desde que se la invita. Pasado el plazo, asigna la empresa." value={borrador.plazoParaDefinirDias} min={1} max={120} onChange={(n) => setBorrador({ ...borrador, plazoParaDefinirDias: n })} />
          <Campo etiqueta="Aviso por escrito" ayuda="Mínimo entre el aviso y el inicio de las vacaciones." value={borrador.avisoMinimoDias} min={0} max={180} onChange={(n) => setBorrador({ ...borrador, avisoMinimoDias: n })} sufijo="días antes" />
          <Campo etiqueta="Tramo mínimo al fraccionar" ayuda="Cada parte, cuando la persona las divide." value={borrador.minDiasPorTramo} min={1} max={60} onChange={(n) => setBorrador({ ...borrador, minDiasPorTramo: n })} />
        </div>

        {tiposDeContrato.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Tipos de contrato que se invitan</p>
            <SelectorTiposContrato tipos={tiposDeContrato} deshabilitados={tiposSinVacaciones} seleccion={borrador.tiposContratoInvitar.filter((t) => !tiposSinVacaciones.includes(t))} onChange={(tiposContratoInvitar) => setBorrador({ ...borrador, tiposContratoInvitar })} disabled={guardando} />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Con qué selección arranca cada campaña nueva (después se puede cambiar en la campaña, antes de lanzarla). Se invita a quien tiene de ese tipo su contrato vigente en la empresa de cómputo. Los tachados no tienen vacaciones (Visibilidad por tipo de Contrato) y no se invitan nunca.
            </p>
          </div>
        )}

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => guardar(normalizarConfigCampania(borrador))} disabled={!cambio || guardando} className="btn-primary disabled:opacity-50">
            {guardando ? "Guardando..." : "Guardar"}
          </button>
          {cambio && (
            <button type="button" onClick={() => setBorrador(guardado)} className="btn-secondary">
              Descartar
            </button>
          )}
        </div>
      </div>

      {/* Si se lanzara hoy: cuándo vence el plazo y si el peor caso llega a otorgarse dentro de la ventana. */}
      <div className="rounded border border-gray-200 dark:border-gray-700 p-4 space-y-2">
        <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
          <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500" /> Si se lanzara hoy ({fechaCorta(hoy)})
        </p>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Podrían elegir hasta el <strong>{fechaCorta(fechaLimite(hoy, borrador.plazoParaDefinirDias))}</strong>. A quien no elija, la empresa le asigna desde el {fechaCorta(fechaLimite(hoy, borrador.plazoParaDefinirDias + borrador.avisoMinimoDias))} (el aviso corre desde que se asigna).
        </p>
        {alertas.length === 0 ? (
          <p className="text-sm text-green-700 dark:text-green-400">Los plazos alcanzan para otorgar en término.</p>
        ) : (
          alertas.map((a) => (
            <p key={a.codigo} className={`text-sm flex items-start gap-2 ${a.nivel === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
              <FontAwesomeIcon icon={a.nivel === "error" ? faCircleExclamation : faTriangleExclamation} className="mt-0.5" />
              {a.mensaje}
            </p>
          ))
        )}
        <p className="text-xs text-gray-500 dark:text-gray-400">La cuenta toma 21 días para el que más tiene; al lanzar se hace con los días reales de cada persona.</p>
      </div>
    </div>
  );
};
