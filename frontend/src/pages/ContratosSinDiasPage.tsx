import React, { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarXmark, faSpinner, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import axios from "../api/axiosConfig";
import { PageLayout } from "../components/ui/PageLayout";
import { SearchAndFilters } from "../components/ui/SearchAndFilters";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { sweetAlert } from "../utils/sweetAlert";
import { faltaDefinirDias } from "@compartido/diasDeTrabajo";

/*
  CONTRATOS SIN DÍAS: los vigentes o futuros que no dicen qué días de la semana trabaja la persona.

  Casi todos vienen de FRAME, que no manda los días. Sin ellos no se puede saber si un contrato se
  superpone con otro (lo que avisa el alta de solicitudes) ni si un feriado le cae en día laborable. Se
  completan acá, fila por fila; si el contrato tiene turno, los días del turno vienen marcados y «Usar
  los del turno en todos» guarda de una vez todos los que tienen esa sugerencia. Server:
  `routes/contratosSinDias.ts`, con la misma regla de días que el wizard (`compartido/diasDeTrabajo.ts`).
*/
interface Fila {
  userProjectId: string;
  indice: number;
  persona: string;
  proyecto: string;
  fechaAlta: string;
  fechaBaja: string;
  horario: string;
  contrato: string;
  rol: string;
  jornadas: number | null;
  turno: string;
  diasSugeridos: number[];
}

const DIAS = [
  { i: 1, t: "Lu" },
  { i: 2, t: "Ma" },
  { i: 3, t: "Mi" },
  { i: 4, t: "Ju" },
  { i: 5, t: "Vi" },
  { i: 6, t: "Sá" },
  { i: 0, t: "Do" },
];
const clave = (f: Fila) => `${f.userProjectId}::${f.indice}`;
const corta = (iso: string) => {
  const [y, m, d] = (iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

export const ContratosSinDiasPage: React.FC = () => {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [dias, setDias] = useState<Record<string, number[]>>({});
  const [rotativos, setRotativos] = useState<Record<string, { on: boolean; porSemana: number }>>({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [enLote, setEnLote] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [ayuda, setAyuda] = useState(false);

  const cargar = () => {
    setFilas(null);
    axios
      .get("/contratos-sin-dias")
      .then(({ data }) => {
        const lista: Fila[] = data?.contratos || [];
        setFilas(lista);
        setDias(Object.fromEntries(lista.map((f) => [clave(f), f.diasSugeridos])));
        setRotativos({});
      })
      .catch(() => setFilas([]));
  };
  useEffect(cargar, []);

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (filas || []).filter((f) => !q || `${f.persona} ${f.proyecto} ${f.contrato}`.toLowerCase().includes(q));
  }, [filas, busqueda]);
  const conSugerencia = visibles.filter((f) => f.diasSugeridos.length > 0);

  const problema = (f: Fila) => {
    const r = rotativos[clave(f)];
    const d = dias[clave(f)] || [];
    return faltaDefinirDias(r?.on ? r.porSemana : d.length, !!r?.on, d);
  };

  /** `forzarDias`: los del turno, en el guardado de todos (sin depender del estado de la pantalla). */
  const guardar = async (f: Fila, silencioso = false, forzarDias?: number[]): Promise<boolean> => {
    const r = forzarDias ? undefined : rotativos[clave(f)];
    const d = forzarDias || dias[clave(f)] || [];
    setGuardando(clave(f));
    try {
      await axios.put("/contratos-sin-dias", { userProjectId: f.userProjectId, indice: f.indice, fechaAlta: f.fechaAlta, dias_semana: d, dias_rotativos: !!r?.on, dias_por_semana: r?.on ? r.porSemana : d.length });
      setFilas((prev) => (prev || []).filter((x) => clave(x) !== clave(f)));
      return true;
    } catch (e: any) {
      if (!silencioso) sweetAlert.error("No se pudo guardar", e?.response?.data?.error || "Probá de nuevo.");
      return false;
    } finally {
      setGuardando(null);
    }
  };

  const usarTurnoEnTodos = async () => {
    const r: any = await sweetAlert.confirm("¿Usar los días del turno?", `Se guardan los días de su turno en ${conSugerencia.length} contrato(s). Los que no tienen turno quedan para completar a mano.`, "Guardar", "Cancelar");
    if (!(r === true || r?.isConfirmed)) return;
    setEnLote(true);
    let ok = 0;
    for (const f of conSugerencia) {
      if (await guardar(f, true, f.diasSugeridos)) ok++;
    }
    setEnLote(false);
    sweetAlert.success("Listo", `Se completaron ${ok} de ${conSugerencia.length}.`);
  };

  return (
    <PageLayout
      title="Contratos sin días"
      subtitle="Vigentes o futuros que no dicen qué días de la semana se trabaja."
      faIcon={{ icon: faCalendarXmark }}
      itemCount={filas?.length ?? 0}
      infoModal={{
        isOpen: ayuda,
        onOpen: () => setAyuda(true),
        onClose: () => setAyuda(false),
        title: "Contratos sin días",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Todo contrato tiene que decir qué días trabaja la persona: sin eso no se puede avisar si una solicitud nueva se superpone con lo que ya tiene, ni saber si un feriado le cae en día laborable.</p>
            <p>Los contratos que vienen de FRAME no traen los días. Acá están los vigentes o futuros que faltan; si el contrato tiene turno, vienen marcados los días del turno.</p>
            <p>Desde la plataforma ya no se puede guardar un contrato sin días.</p>
          </div>
        ),
      }}
      shouldShowInfo
      searchAndFilters={<SearchAndFilters searchTerm={busqueda} onSearchChange={setBusqueda} searchPlaceholder="Buscar por persona, proyecto o contrato..." />}
    >
      {filas === null ? (
        <LoadingSpinner />
      ) : filas.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-800">
          <FontAwesomeIcon icon={faCalendarXmark} className="mb-3 h-10 w-10 opacity-10" />
          <p className="text-sm font-medium">Todos los contratos vigentes tienen sus días</p>
        </div>
      ) : (
        <div className="space-y-3">
          {conSugerencia.length > 0 && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              <span>{conSugerencia.length} tienen turno: se pueden completar con los días del turno.</span>
              <button type="button" onClick={() => void usarTurnoEnTodos()} disabled={enLote} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                <FontAwesomeIcon icon={enLote ? faSpinner : faWandMagicSparkles} spin={enLote} />
                Usar los del turno en todos
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-800/50">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50 text-xs font-bold uppercase tracking-widest text-gray-400 dark:border-gray-800 dark:bg-gray-900/30">
                  <th className="px-4 py-3">Persona</th>
                  <th className="px-4 py-3">Contrato</th>
                  <th className="px-4 py-3">Días que trabaja</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {visibles.map((f) => {
                  const k = clave(f);
                  const d = dias[k] || [];
                  const r = rotativos[k];
                  const falta = problema(f);
                  return (
                    <tr key={k} className="align-top">
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{f.persona}</p>
                        <p className="text-xs text-gray-500">{f.proyecto}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                        <p>{f.contrato || "Sin tipo"}{f.rol ? ` · ${f.rol}` : ""}</p>
                        <p>
                          {corta(f.fechaAlta)} → {f.fechaBaja ? corta(f.fechaBaja) : "sin baja"} {f.horario ? `· ${f.horario}` : ""}
                        </p>
                        {f.jornadas != null && <p className="text-gray-400">{f.jornadas} jornadas</p>}
                        {f.turno && <p className="text-blue-600 dark:text-blue-400">Turno: {f.turno}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {DIAS.map((x) => {
                            const on = d.includes(x.i);
                            return (
                              <button
                                key={x.i}
                                type="button"
                                onClick={() => setDias((p) => ({ ...p, [k]: on ? d.filter((y) => y !== x.i) : [...d, x.i].sort() }))}
                                className={`h-8 w-9 rounded-md text-xs font-bold ${on ? "bg-blue-600 text-white" : "border border-gray-200 text-gray-500 dark:border-gray-700"}`}
                              >
                                {x.t}
                              </button>
                            );
                          })}
                        </div>
                        <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                          <input type="checkbox" checked={!!r?.on} onChange={(e) => setRotativos((p) => ({ ...p, [k]: { on: e.target.checked, porSemana: p[k]?.porSemana || d.length || 1 } }))} />
                          Rotativos
                          {r?.on && (
                            <>
                              · por semana
                              <input type="number" min={1} max={7} value={r.porSemana} onChange={(e) => setRotativos((p) => ({ ...p, [k]: { on: true, porSemana: Number(e.target.value) || 1 } }))} className="w-14 rounded border border-gray-200 px-1 py-0.5 dark:border-gray-700 dark:bg-gray-900" />
                            </>
                          )}
                        </label>
                        {falta && d.length > 0 && <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{falta}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => void guardar(f)} disabled={!!falta || guardando === k || enLote} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">
                          {guardando === k && <FontAwesomeIcon icon={faSpinner} spin />}
                          Guardar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ContratosSinDiasPage;
