import React, { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSpinner, faCircleCheck, faTriangleExclamation, faKeyboard, faArrowTurnDown, faDeleteLeft, faRotateRight, faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { dropboxSignBotAPI, type AccionLogin, type EstadoLoginAsistido } from "../../api/dropboxSign";
import { InfoModal } from "../ui/InfoModal";
import { sweetAlert } from "../../utils/sweetAlert";

/*
  «CONECTARSE A DROPBOX SIGN» (23/10/2026, «sin consola»): el navegador del servidor aparece acá como
  capturas que se refrescan solas; los clicks sobre la imagen, el texto y las teclas van al navegador.
  Cuando llega al listado de documentos, el server guarda la sesión cifrada (la misma que usa el bot) y
  cierra el navegador solo. Lo que escribís no se guarda en ningún lado: va directo al campo del login.
*/

const POLL_MS = 900;

export const LoginAsistidoModal: React.FC<{ onClose: () => void; onConectado?: () => void }> = ({ onClose, onConectado }) => {
  const [estado, setEstado] = useState<EstadoLoginAsistido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [ocultar, setOcultar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const ocupadoRef = useRef(false);
  const avisado = useRef(false);
  const img = useRef<HTMLImageElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const aplicar = useCallback(
    (e: EstadoLoginAsistido) => {
      setEstado((prev) => ({ ...e, jpeg: e.jpeg ?? prev?.jpeg }));
      if (e.estado === "conectado" && !avisado.current) {
        avisado.current = true;
        onConectado?.();
      }
    },
    [onConectado],
  );

  useEffect(() => {
    let vivo = true;
    let timer: number | null = null;
    const poll = async () => {
      if (!vivo) return;
      if (!ocupadoRef.current) {
        const e = await dropboxSignBotAPI.pantallaLogin().catch(() => null);
        if (!vivo) return;
        if (e) aplicar(e);
        if (e && e.estado !== "abierto") return;
      }
      timer = window.setTimeout(poll, POLL_MS);
    };
    dropboxSignBotAPI
      .abrirLogin()
      .then((e) => {
        if (!vivo) return;
        aplicar(e);
        if (e.estado === "abierto") void poll();
      })
      .catch((e: any) => vivo && setError(e?.response?.data?.error || e?.message || "No se pudo abrir el navegador del servidor."));
    return () => {
      vivo = false;
      if (timer) window.clearTimeout(timer);
    };
  }, [aplicar]);

  const cerrar = async () => {
    if (estado?.estado === "abierto") await dropboxSignBotAPI.cerrarLogin().catch(() => {});
    onClose();
  };

  const accion = async (a: AccionLogin) => {
    if (ocupadoRef.current || estado?.estado !== "abierto") return;
    ocupadoRef.current = true;
    setOcupado(true);
    try {
      aplicar(await dropboxSignBotAPI.accionLogin(a));
    } catch (e: any) {
      sweetAlert.error("No se pudo", e?.response?.data?.error || e?.message || "");
    } finally {
      ocupadoRef.current = false;
      setOcupado(false);
    }
  };
  const click = (ev: React.MouseEvent<HTMLImageElement>) => {
    const el = img.current;
    if (!el || !estado) return;
    const r = el.getBoundingClientRect();
    void accion({ tipo: "click", x: ((ev.clientX - r.left) / r.width) * estado.viewport.width, y: ((ev.clientY - r.top) / r.height) * estado.viewport.height });
    input.current?.focus();
  };
  const enviarTexto = async (yEnter: boolean) => {
    const t = texto;
    setTexto("");
    if (t) await accion({ tipo: "tipear", texto: t });
    if (yEnter) await accion({ tipo: "tecla", tecla: "Enter" });
  };
  const refrescar = async () => {
    if (ocupadoRef.current) return;
    const e = await dropboxSignBotAPI.pantallaLogin().catch(() => null);
    if (e) aplicar(e);
  };

  const abierto = estado?.estado === "abierto";
  const conectado = estado?.estado === "conectado";
  const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50";

  return (
    <InfoModal isOpen onClose={cerrar} title="Conectarse a Dropbox Sign" subtitle="El navegador del servidor, en tu pantalla. No se envía ningún documento." size="xl" zIndex={70} actions={[{ label: conectado ? "Listo" : "Cerrar sin conectar", onClick: cerrar, variant: conectado ? undefined : "ghost" }]}>
      <div className="space-y-3 text-xs">
        {error ? (
          <p className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" /> {error}
          </p>
        ) : !estado ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <FontAwesomeIcon icon={faSpinner} spin /> Abriendo el navegador del servidor…
          </p>
        ) : (
          <>
            <div className={`rounded-lg border p-3 ${conectado ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20" : abierto ? "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20" : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40"}`}>
              {conectado ? (
                <p className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-300">
                  <FontAwesomeIcon icon={faCircleCheck} /> Conectado. {estado.detalle}
                </p>
              ) : abierto ? (
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Hacé click en un campo de la imagen, escribí abajo y mandalo con Enter.</strong> Si aparece un captcha o un código, resolvelo acá mismo. Cuando el navegador llegue al listado de documentos, la sesión se guarda sola y esto se cierra.
                </p>
              ) : (
                <p className="text-sm text-gray-600 dark:text-gray-300">{estado.detalle || "El navegador se cerró."}</p>
              )}
              {abierto && estado.url && <p className="mt-1 truncate font-mono text-[11px] text-gray-500">{estado.url}</p>}
            </div>

            <div className="relative mx-auto w-full max-w-[960px] overflow-hidden rounded-lg border border-gray-300 bg-gray-100 dark:border-gray-600 dark:bg-gray-900" style={{ aspectRatio: `${estado.viewport.width} / ${estado.viewport.height}` }}>
              {estado.jpeg ? (
                <img
                  ref={img}
                  src={`data:image/jpeg;base64,${estado.jpeg}`}
                  alt="Navegador del servidor"
                  draggable={false}
                  onClick={click}
                  onWheel={(ev) => {
                    if (abierto) void accion({ tipo: "scroll", dy: ev.deltaY });
                  }}
                  className={`block h-full w-full select-none ${abierto ? "cursor-crosshair" : ""}`}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">
                  <FontAwesomeIcon icon={faSpinner} spin />
                </div>
              )}
              {ocupado && (
                <div className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-[11px] text-white">
                  <FontAwesomeIcon icon={faSpinner} spin /> enviando…
                </div>
              )}
            </div>

            {abierto && (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={input}
                  type={ocultar ? "password" : "text"}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void enviarTexto(true);
                    }
                  }}
                  placeholder="Escribí acá (va al campo donde hiciste click) y apretá Enter"
                  className="min-w-[260px] flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button type="button" onClick={() => setOcultar((v) => !v)} className={btn} title={ocultar ? "Mostrar lo que escribo" : "Ocultar lo que escribo (contraseña)"}>
                  <FontAwesomeIcon icon={ocultar ? faEyeSlash : faEye} />
                </button>
                <button type="button" onClick={() => void enviarTexto(false)} disabled={ocupado || !texto} className={btn} title="Escribe el texto sin apretar Enter">
                  <FontAwesomeIcon icon={faKeyboard} /> Escribir
                </button>
                <button type="button" onClick={() => void accion({ tipo: "tecla", tecla: "Enter" })} disabled={ocupado} className={btn}>
                  <FontAwesomeIcon icon={faArrowTurnDown} /> Enter
                </button>
                <button type="button" onClick={() => void accion({ tipo: "tecla", tecla: "Tab" })} disabled={ocupado} className={btn}>
                  Tab
                </button>
                <button type="button" onClick={() => void accion({ tipo: "tecla", tecla: "Backspace" })} disabled={ocupado} className={btn} title="Borra un carácter en el navegador">
                  <FontAwesomeIcon icon={faDeleteLeft} />
                </button>
                <button type="button" onClick={refrescar} disabled={ocupado} className={btn} title="Volver a capturar la pantalla">
                  <FontAwesomeIcon icon={faRotateRight} />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </InfoModal>
  );
};
