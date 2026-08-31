import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { faPlug, faSpinner, faTriangleExclamation, faCheck } from "@fortawesome/free-solid-svg-icons";
import { dropboxAPI, DropboxStatus } from "../../api/dropbox";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * Conectar / desconectar la cuenta de Dropbox de la organización. Es el mismo formulario que usa
 * "Dropbox | Documentos": vive acá para poder ofrecerlo también desde Configuración, donde antes
 * solo se veía el estado y había que ir a la otra pantalla para cambiar la cuenta.
 *
 * Ojo: Dropbox no se conecta con usuario y contraseña sino con las credenciales de la app
 * (App key + App secret + Refresh token), que se generan una vez en la App Console.
 */
export const DropboxConexionCard: React.FC<{ status: DropboxStatus | null; onChanged: () => void | Promise<void> }> = ({ status, onChanged }) => {
  const [form, setForm] = useState({ appKey: "", appSecret: "", refreshToken: "", rootPath: "/HelloSign" });
  const [connecting, setConnecting] = useState(false);
  const [mostrarForm, setMostrarForm] = useState(false);

  const conectar = async () => {
    if (!form.appKey || !form.appSecret || !form.refreshToken) {
      sweetAlert.error("Faltan datos", "Completá App key, App secret y Refresh token.");
      return;
    }
    setConnecting(true);
    try {
      const s = await dropboxAPI.connect(form);
      sweetAlert.success("Dropbox conectado", `Cuenta: ${s.accountEmail || "conectada"}.`);
      setForm({ appKey: "", appSecret: "", refreshToken: "", rootPath: "/HelloSign" });
      setMostrarForm(false);
      await onChanged();
    } catch (e: any) {
      sweetAlert.error("No se pudo conectar", e?.response?.data?.error || "Revisá las credenciales.");
    } finally {
      setConnecting(false);
    }
  };

  const desconectar = async () => {
    const res = await sweetAlert.confirm("¿Desconectar Dropbox?", "Se borrarán las credenciales de esta organización. Los archivos en Dropbox no se tocan.", "Sí, desconectar");
    if (!res.isConfirmed) return;
    try {
      await dropboxAPI.disconnect();
      await onChanged();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo desconectar.");
    }
  };

  const conectado = !!status?.connected;
  // Solo un administrador puede tocar la conexión (lo valida también el backend).
  const puedeGestionar = status?.canManageConnection !== false;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FontAwesomeIcon icon={faDropbox} className="h-6 w-6 text-blue-600" />
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">Cuenta de Dropbox</p>
            {conectado ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-green-500 mr-1" />
                Vinculado a <strong>{status?.accountEmail || "una cuenta"}</strong>
                {/*
                  «CARPETA RAÍZ» ERA MENTIRA Y COSTÓ UN DIAGNÓSTICO.

                  Decía «carpeta raíz /HelloSign» tres líneas arriba de una lista de carpetas de
                  `/WEPRODU`, y se leía como que el token está encerrado en `/HelloSign`. No lo está:
                  la raíz real del espacio tiene `WEPRODU`, `HelloSign` y las carpetas de proyecto
                  como hermanas, y la conexión las ve todas. Este valor es solo dónde ABRE el
                  explorador de acá abajo.

                  Alguien leyó esa etiqueta, concluyó que la app no veía `/WEPRODU/Paritarias` y
                  frenó una entrega entera por un problema que no existía.
                */}
                {status?.rootPath ? (
                  <>
                    {" "}
                    · abre en <span className="font-mono">{status.rootPath}</span>
                    <span className="text-gray-400 dark:text-gray-500" title="No limita el acceso: la conexión ve toda la cuenta. Es solo la carpeta donde arranca el explorador de abajo.">
                      {" "}
                      (no limita el acceso)
                    </span>
                  </>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-amber-600 dark:text-amber-400">Sin conectar — el escaneo automático no funciona hasta vincular una cuenta.</p>
            )}
          </div>
        </div>
        {puedeGestionar && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMostrarForm((v) => !v)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              {mostrarForm ? "Cancelar" : conectado ? "Cambiar cuenta" : "Conectar"}
            </button>
            {conectado && (
              <button type="button" onClick={desconectar} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                Desconectar
              </button>
            )}
          </div>
        )}
      </div>

      {mostrarForm && puedeGestionar && (
        <div className="space-y-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">App key</label>
            <input className="input-field w-full" value={form.appKey} onChange={(e) => setForm({ ...form, appKey: e.target.value })} placeholder="App key de Dropbox" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">App secret</label>
            <input type="password" className="input-field w-full" value={form.appSecret} onChange={(e) => setForm({ ...form, appSecret: e.target.value })} placeholder="App secret" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Refresh token</label>
            <input type="password" className="input-field w-full" value={form.refreshToken} onChange={(e) => setForm({ ...form, refreshToken: e.target.value })} placeholder="Refresh token (offline)" autoComplete="new-password" />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Carpeta donde abre el explorador</label>
            <input className="input-field w-full" value={form.rootPath} onChange={(e) => setForm({ ...form, rootPath: e.target.value })} placeholder="/HelloSign" />
            <p className="mt-1 text-[11px] text-gray-400">Dónde arranca el navegador de carpetas de abajo. No restringe nada: la conexión ve toda la cuenta.</p>
          </div>
          <button type="button" onClick={conectar} disabled={connecting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
            {connecting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPlug} />}
            {connecting ? "Conectando..." : conectado ? "Reconectar con estas credenciales" : "Conectar"}
          </button>
          <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
            <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
            Generá estas credenciales en la App Console de Dropbox (permisos files.content.read/write, con acceso "offline" para obtener el refresh token).
          </p>
        </div>
      )}
    </div>
  );
};
