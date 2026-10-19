import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { faClock } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { projectsAPI, horaTexto, horarioTexto, frecuenciaTexto, type ConfigAltasAutomaticas } from "../api/projects";
import { sweetAlert } from "../utils/sweetAlert";

/*
  CONFIGURACIÓN → ARCA → ALTAS AUTOMÁTICAS: a qué hora corre la presentación automática y con cuánta
  anticipación toma las altas. La pantalla que muestra qué va a salir y cuándo es «A.R.C.A Altas
  Automáticas» (Contratación); acá sólo se fija el horario y se prende o apaga.

  LA ANTICIPACIÓN ES UNA VENTANA, no «exactamente N días antes»: con 2 días, la corrida de hoy presenta
  las altas de hoy, mañana y pasado. Así un contrato cargado tarde sale igual en la primera corrida que
  lo alcanza (ver `horarioAltasAutomaticas.ts` en el server).

  DOS MODOS (pedido del 19/10/2026): «una vez por día» (sólo la corrida de la hora fija) o «frecuente»
  (además, la cola de pendientes cada N minutos). En los dos, a la hora fija las altas de ese día van
  primero y en corridas propias, para que una falla de las atrasadas no las atrase.
*/

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);
const DIAS_ANTES: Array<{ valor: number; texto: string }> = [
  { valor: 0, texto: "El mismo día del alta" },
  { valor: 1, texto: "1 día antes" },
  { valor: 2, texto: "2 días antes" },
  { valor: 3, texto: "3 días antes" },
  { valor: 5, texto: "5 días antes" },
  { valor: 7, texto: "7 días antes" },
  { valor: 10, texto: "10 días antes" },
  { valor: 15, texto: "15 días antes" },
  { valor: 30, texto: "30 días antes" },
];

const FRECUENCIAS = [15, 30, 60, 120, 180, 240, 360];

const rotulo = "block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1";

export const ArcaAltasAutomaticasConfigPage: React.FC = () => {
  const [info, setInfo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [activa, setActiva] = useState(false);
  const [guardada, setGuardada] = useState<ConfigAltasAutomaticas | null>(null);
  const [form, setForm] = useState<ConfigAltasAutomaticas>({ hora: 14, minuto: 0, diasAntes: 0, modo: "diaria", cadaMinutos: 60 });
  const [frecuencias, setFrecuencias] = useState<number[]>(FRECUENCIAS);

  useEffect(() => {
    projectsAPI
      .presentacionAutomatica({ soloConfig: true })
      .then((e) => {
        setActiva(e.activa);
        // Un servidor anterior no manda modo ni frecuencia: se completa con los de siempre.
        const cfg: ConfigAltasAutomaticas = { ...e.config, modo: e.config.modo || "diaria", cadaMinutos: e.config.cadaMinutos || 60 };
        setGuardada(cfg);
        setForm(cfg);
        if (Array.isArray(e.frecuencias) && e.frecuencias.length > 0) setFrecuencias(e.frecuencias);
      })
      .catch((err: any) => sweetAlert.error("No se pudo cargar", err?.response?.data?.error || err?.message || ""))
      .finally(() => setCargando(false));
  }, []);

  const hayCambios = !!guardada && (guardada.hora !== form.hora || guardada.minuto !== form.minuto || guardada.diasAntes !== form.diasAntes || guardada.modo !== form.modo || guardada.cadaMinutos !== form.cadaMinutos);
  // Si el minuto guardado no es múltiplo de 5 (se guardó por otro camino), el select igual lo ofrece.
  const minutos = MINUTOS.includes(form.minuto) ? MINUTOS : [...MINUTOS, form.minuto].sort((a, b) => a - b);
  const diasAntes = DIAS_ANTES.some((d) => d.valor === form.diasAntes) ? DIAS_ANTES : [...DIAS_ANTES, { valor: form.diasAntes, texto: `${form.diasAntes} días antes` }].sort((a, b) => a.valor - b.valor);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await projectsAPI.setPresentacionAutomatica(form);
      setGuardada(r.config);
      setForm(r.config);
      sweetAlert.success("Horario guardado", `${horarioTexto(r.config).replace(/^t/, "T")}.`);
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActiva = async (valor: boolean) => {
    if (valor) {
      const r = await sweetAlert.confirm(
        "Activar las Altas Automáticas",
        `Se van a presentar en ARCA, sin que nadie apriete nada, las altas completas: ${horarioTexto(guardada)}. No se deshace.`,
        "Sí, activar",
        "Cancelar",
      );
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      const r = await projectsAPI.setPresentacionAutomatica({ activa: valor });
      setActiva(r.activa);
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <PageLayout
      title="ARCA | Altas Automáticas"
      subtitle="A qué hora, con cuánta anticipación y con qué frecuencia se presentan solas las altas tempranas"
      faIcon={{ icon: faClock }}
      infoModal={{
        isOpen: info,
        onOpen: () => setInfo(true),
        onClose: () => setInfo(false),
        title: "Cómo se decide cuándo sale cada alta",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Todos los días a la hora elegida (hora argentina) corre la corrida del día: presenta primero, en corridas propias, las altas de ese día, y después las pendientes atrasadas. Así una falla con las atrasadas no atrasa las del día.</p>
            <p>
              <strong>Una vez por día</strong>: sólo esa corrida. <strong>Frecuente</strong>: además, cada tanto (15 minutos a 6 horas) corre la cola de pendientes: lo que ya tuvo su turno y no salió. Si
              llega la hora del día mientras la cola corre, la cola corta y le deja el paso.
            </p>
            <p>
              <strong>El mismo día del alta</strong>: la corrida de cada día toma sólo las altas que empiezan ese día.
            </p>
            <p>
              <strong>N días antes</strong>: la corrida toma las altas que empiezan ese día o en los próximos N días. Es una ventana, no una fecha exacta: un contrato cargado tarde sale igual en la
              primera corrida que lo alcanza, y a más tardar en la de su propio día.
            </p>
            <p>
              Nada queda fuera: las atrasadas de cualquier fecha, los contratos cuya baja ya pasó y las rechazadas por ARCA siguen en la cola hasta que salgan. Una rechazada se vuelve a intentar
              recién al día siguiente, para no insistir con lo mismo cada pocos minutos.
            </p>
            <p>Si se activa después de la hora, empieza al día siguiente.</p>
          </div>
        ),
      }}
    >
      {cargando ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" className="sr-only peer" checked={activa} disabled={guardando} onChange={(e) => cambiarActiva(e.target.checked)} />
              <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Altas Automáticas {activa ? "activadas" : "desactivadas"}</span>
            </label>
            <p className="mt-2 text-xs text-gray-500">
              Qué va a salir y cuándo, con la cuenta regresiva de cada alta, se ve en{" "}
              <Link to="/admin/presentaciones-arca" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                A.R.C.A Altas Automáticas
              </Link>
              .
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Horario</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(
                [
                  ["diaria", "Una vez por día", "Sólo a la hora elegida."],
                  ["frecuente", "Frecuente", "A la hora elegida, las del día primero; y la cola de pendientes cada tanto."],
                ] as const
              ).map(([valor, titulo, texto]) => (
                <label
                  key={valor}
                  className={`cursor-pointer rounded-lg border px-3 py-2.5 ${form.modo === valor ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"}`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="modo" checked={form.modo === valor} onChange={() => setForm({ ...form, modo: valor })} className="text-blue-600 focus:ring-blue-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{titulo}</span>
                  </span>
                  <span className="block mt-1 ml-6 text-xs text-gray-500">{texto}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={rotulo}>Hora</label>
                <select value={form.hora} onChange={(e) => setForm({ ...form, hora: Number(e.target.value) })} className="input-field w-full text-sm">
                  {HORAS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={rotulo}>Minutos</label>
                <select value={form.minuto} onChange={(e) => setForm({ ...form, minuto: Number(e.target.value) })} className="input-field w-full text-sm">
                  {minutos.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={rotulo}>Cuándo se presenta</label>
                <select value={form.diasAntes} onChange={(e) => setForm({ ...form, diasAntes: Number(e.target.value) })} className="input-field w-full text-sm">
                  {diasAntes.map((d) => (
                    <option key={d.valor} value={d.valor}>
                      {d.texto}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {form.modo === "frecuente" && (
              <div className="sm:w-1/3">
                <label className={rotulo}>Pendientes, cada</label>
                <select value={form.cadaMinutos} onChange={(e) => setForm({ ...form, cadaMinutos: Number(e.target.value) })} className="input-field w-full text-sm">
                  {frecuencias.map((m) => (
                    <option key={m} value={m}>
                      {frecuenciaTexto(m).replace(/^cada /, "")}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="text-sm text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 space-y-1">
              <p>
                Todos los días a las <strong>{horaTexto(form)}</strong> (hora argentina) se presentan primero las altas completas{" "}
                {form.diasAntes === 0 ? (
                  <>
                    que empiezan <strong>ese mismo día</strong>
                  </>
                ) : (
                  <>
                    que empiezan ese día o en los <strong>próximos {form.diasAntes} día{form.diasAntes === 1 ? "" : "s"}</strong>
                  </>
                )}
                , y después las pendientes atrasadas.
              </p>
              {form.modo === "frecuente" && (
                <p>
                  Además, <strong>{frecuenciaTexto(form.cadaMinutos)}</strong> se presentan las pendientes que ya tuvieron su turno y no salieron (atrasadas, rechazadas, cargadas tarde).
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={guardar} disabled={!hayCambios || guardando} className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                {guardando ? "Guardando…" : "Guardar horario"}
              </button>
              {hayCambios && (
                <button type="button" onClick={() => guardada && setForm(guardada)} disabled={guardando} className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 font-semibold">
                  Deshacer
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
};

export default ArcaAltasAutomaticasConfigPage;
