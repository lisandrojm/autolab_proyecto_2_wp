import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faPlug, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { afipAPI, AfipStatus } from "../api/afip";
import { sweetAlert } from "../utils/sweetAlert";

export function AfipConfigPage() {
  const [status, setStatus] = useState<AfipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [form, setForm] = useState({ cuitRepresentada: "", certificadoPem: "", clavePrivadaPem: "", ambiente: "homologacion" as "homologacion" | "produccion" });

  const cargar = async () => {
    setLoading(true);
    try {
      setStatus(await afipAPI.status());
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo obtener el estado de AFIP.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const handleConnect = async () => {
    if (!form.cuitRepresentada || !form.certificadoPem || !form.clavePrivadaPem) {
      sweetAlert.error("Faltan datos", "Completá CUIT representada, certificado y clave privada.");
      return;
    }
    setConnecting(true);
    try {
      await afipAPI.connect(form);
      sweetAlert.success("AFIP conectado", "Las credenciales se validaron y guardaron correctamente.");
      setForm({ cuitRepresentada: "", certificadoPem: "", clavePrivadaPem: "", ambiente: "homologacion" });
      await cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo conectar", e?.response?.data?.error || "Revisá las credenciales.");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    const res = await sweetAlert.confirm("¿Desconectar AFIP?", "Se borrarán las credenciales de esta organización. Las consultas a AFIP dejarán de funcionar hasta reconectar.", "Sí, desconectar");
    if (!res.isConfirmed) return;
    try {
      await afipAPI.disconnect();
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo desconectar.");
    }
  };

  return (
    <PageLayout title="AFIP" subtitle="Conexión con AFIP/ARCA para consultar el Padrón (estado de CUIT/CUIL)" faIcon={{ icon: faLandmark }} shouldShowInfo={false}>
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
        </div>
      ) : status?.connected ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-xl space-y-4">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faLandmark} className="h-7 w-7 text-blue-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">AFIP conectado</h3>
              <p className="text-xs text-gray-500">CUIT representada: {status.cuitRepresentada}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Ambiente: <strong>{status.ambiente === "produccion" ? "Producción" : "Homologación (testing)"}</strong>
            {status.ambiente === "homologacion" && <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">Los datos que devuelve AFIP en homologación son ficticios, no reales — sirve para probar el flujo, no para uso productivo.</span>}
          </p>
          {status.canManageConnection && (
            <button onClick={handleDisconnect} className="text-sm text-red-500 hover:text-red-600 font-semibold">
              Desconectar
            </button>
          )}
        </div>
      ) : !status?.canManageConnection ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 max-w-xl">
          <FontAwesomeIcon icon={faLandmark} className="h-10 w-10 text-blue-500 mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-200">AFIP no está conectado</p>
          <p className="text-sm mt-1">Pedile a un administrador que conecte el certificado de AFIP de la organización.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <FontAwesomeIcon icon={faLandmark} className="h-7 w-7 text-blue-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conectar AFIP</h3>
              <p className="text-xs text-gray-500">Certificado digital (WSAA) de tu organización — se guarda cifrado.</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">CUIT representada</label>
              <input className="input-field w-full" value={form.cuitRepresentada} onChange={(e) => setForm({ ...form, cuitRepresentada: e.target.value })} placeholder="20123456789" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Ambiente</label>
              <div className="flex gap-2">
                {(["homologacion", "produccion"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setForm({ ...form, ambiente: a })}
                    className={`flex-1 px-3 py-2 rounded-lg border text-sm font-semibold transition-colors ${form.ambiente === a ? "border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/40"}`}
                  >
                    {a === "homologacion" ? "Homologación (testing)" : "Producción"}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Certificado (.crt, formato PEM)</label>
              <textarea className="input-field w-full font-mono text-xs" rows={5} value={form.certificadoPem} onChange={(e) => setForm({ ...form, certificadoPem: e.target.value })} placeholder="-----BEGIN CERTIFICATE-----" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Clave privada (.key, formato PEM)</label>
              <textarea className="input-field w-full font-mono text-xs" rows={5} value={form.clavePrivadaPem} onChange={(e) => setForm({ ...form, clavePrivadaPem: e.target.value })} placeholder="-----BEGIN PRIVATE KEY-----" autoComplete="off" />
            </div>
            <button type="button" onClick={handleConnect} disabled={connecting} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
              {connecting ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faPlug} />}
              {connecting ? "Validando contra AFIP..." : "Conectar"}
            </button>
            <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
              El certificado tiene que estar autorizado en AFIP (WSASS) para el servicio "Consulta Padrón" (ws_sr_padron_a13), además del CUIT que lo representa.
            </p>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default AfipConfigPage;
