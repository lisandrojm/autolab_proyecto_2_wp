import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { faFileArrowDown } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { LoadingSpinner } from "../components/ui/LoadingSpinner";
import { projectsAPI, horaTexto, type ConfigDescargaConstancias, type EstadoDescargaConstancias } from "../api/projects";
import { sweetAlert } from "../utils/sweetAlert";

/*
  CONFIGURACIÓN → ARCA → DESCARGA DE CONSTANCIAS (pedido del 18/10/2026): a qué hora, una vez por día,
  el servidor baja de ARCA las constancias de las altas tempranas ya presentadas y las manda a donde va
  cada una (Outbox si se firma, «No firmar» si no). Es el botón «Descargar altas tempranas» del registro
  de Altas Masivas, sin que nadie lo apriete. Misma pantalla que Altas Automáticas: interruptor y horario.
*/

const HORAS = Array.from({ length: 24 }, (_, i) => i);
const MINUTOS = Array.from({ length: 12 }, (_, i) => i * 5);
const rotulo = "block text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1";
const fechaCorta = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : iso || "—");

export const ArcaDescargaConstanciasConfigPage: React.FC = () => {
  const [info, setInfo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<EstadoDescargaConstancias | null>(null);
  const [form, setForm] = useState<ConfigDescargaConstancias>({ hora: 15, minuto: 0 });

  const cargar = () =>
    projectsAPI
      .descargaConstanciasAutomatica()
      .then((e) => {
        setEstado(e);
        setForm(e.config);
      })
      .catch((err: any) => sweetAlert.error("No se pudo cargar", err?.response?.data?.error || err?.message || ""))
      .finally(() => setCargando(false));
  useEffect(() => {
    void cargar();
  }, []);

  const guardada = estado?.config || null;
  const hayCambios = !!guardada && (guardada.hora !== form.hora || guardada.minuto !== form.minuto);
  const minutos = MINUTOS.includes(form.minuto) ? MINUTOS : [...MINUTOS, form.minuto].sort((a, b) => a - b);

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await projectsAPI.setDescargaConstanciasAutomatica(form);
      setEstado((prev) => (prev ? { ...prev, activa: r.activa, config: r.config } : prev));
      setForm(r.config);
      sweetAlert.success("Horario guardado", `Todos los días a las ${horaTexto(r.config)} se bajan las constancias pendientes.`);
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const cambiarActiva = async (valor: boolean) => {
    if (valor) {
      const r = await sweetAlert.confirm("Activar la descarga automática", `Todos los días a las ${horaTexto(guardada)} el servidor va a entrar a ARCA con las credenciales del tenant, bajar las constancias de las altas presentadas que todavía no la tienen y mandarlas al Outbox o a «No firmar», según el tipo de contrato. Sólo lee en ARCA.`, "Sí, activar", "Cancelar");
      if (!r.isConfirmed) return;
    }
    setGuardando(true);
    try {
      const r = await projectsAPI.setDescargaConstanciasAutomatica({ activa: valor });
      setEstado((prev) => (prev ? { ...prev, activa: r.activa } : prev));
    } catch (err: any) {
      sweetAlert.error("No se pudo guardar", err?.response?.data?.error || err?.message || "");
    } finally {
      setGuardando(false);
    }
  };

  const u = estado?.ultimaCorrida;

  return (
    <PageLayout
      title="ARCA | Descarga de constancias"
      subtitle="A qué hora se bajan solas, cada día, las constancias de las altas tempranas ya presentadas"
      faIcon={{ icon: faFileArrowDown }}
      infoModal={{
        isOpen: info,
        onOpen: () => setInfo(true),
        onClose: () => setInfo(false),
        title: "Cómo baja las constancias",
        content: (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
            <p>Una vez por día, a la hora elegida (hora argentina), el servidor entra a ARCA como cada empleadora y baja la constancia de alta de cada alta presentada que todavía no la tiene. Es lo mismo que «Descargar altas tempranas» en el registro de Altas Masivas, empleadora por empleadora y sin que nadie lo apriete.</p>
            <p>Cada constancia se valida contra el contrato (que sea la de ALTA de esa relación) y sigue su camino: al Outbox si el tipo de contrato se firma, o a «Alta temprana de Arca / No firmar» si no. Si ARCA entrega la de baja o la de otra persona, no se guarda y queda dicho por qué.</p>
            <p>
              <strong>Para no colgar a ARCA</strong>: va de a una persona, con pausa entre cada una y una pestaña nueva por descarga; lo que ARCA no entrega a tiempo se vuelve a pedir al final, hasta tres veces; y hay un tope de {estado?.maxPorEmpleadora ?? 40} constancias por empleadora y por día: lo que sobra sale al día siguiente. Las empleadoras van en fila, y si hay otra corrida de ARCA en curso (altas, obras sociales) se espera a que termine.
            </p>
            <p>Conviene ponerla después de las Altas Automáticas (14:00): así baja las constancias de lo que se presentó ese mismo día. Si se activa después de la hora, empieza mañana.</p>
          </div>
        ),
      }}
    >
      {cargando || !estado ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="max-w-2xl space-y-6">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
            <label className="inline-flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" className="sr-only peer" checked={estado.activa} disabled={guardando} onChange={(e) => cambiarActiva(e.target.checked)} />
              <span className="relative w-11 h-6 rounded-full bg-gray-300 dark:bg-gray-600 peer-checked:bg-green-600 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Descarga automática {estado.activa ? "activada" : "desactivada"}</span>
            </label>
            <p className="mt-2 text-xs text-gray-500">
              Las constancias bajadas y dónde quedó cada una se ven en Contratos (registro de «Alta Temprana A.R.C.A») y en{" "}
              <Link to="/admin/presentaciones-arca" className="text-blue-600 hover:text-blue-700 dark:text-blue-400 font-semibold">
                A.R.C.A Altas Automáticas › Presentadas
              </Link>
              .
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-5">
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Horario</h2>
            <div className="grid grid-cols-2 gap-4 max-w-sm">
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
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-300 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2">
              Todos los días a las <strong>{horaTexto(form)}</strong> (hora argentina) se bajan de ARCA las constancias de las altas presentadas que todavía no la tienen, hasta <strong>{estado.maxPorEmpleadora}</strong> por empleadora.
            </p>
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

          {u && (
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-2">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Última descarga: {fechaCorta(u.dia)} · {new Date(u.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} h
              </p>
              {u.error && <p className="text-xs text-red-600 dark:text-red-400">{u.error}</p>}
              {u.empresas.length === 0 && !u.error && <p className="text-xs text-gray-500">No había constancias pendientes ese día.</p>}
              {u.empresas.map((e) => (
                <p key={e.empresa} className={`text-xs ${e.error ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"}`}>
                  {e.empresa}: {e.listas} de {e.pedidas} bajada(s){e.pendientes > e.pedidas ? ` (${e.pendientes - e.pedidas} quedaron para mañana por el tope)` : ""}
                  {e.error ? ` · ${e.error}` : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
};

export default ArcaDescargaConstanciasConfigPage;
