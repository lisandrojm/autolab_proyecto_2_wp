import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faPlug, faSpinner, faTriangleExclamation, faCalendarDays, faFingerprint, faHourglassHalf, faCheck, faRotate, faListUl, faXmark } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { Modal } from "../components/ui/Modal";
import { afipAPI, AfipStatus, AfipLogEntry } from "../api/afip";
import { sweetAlert } from "../utils/sweetAlert";

const GUIA_ARCA = (
  <div className="space-y-5 text-gray-400">
    <p>
      La app usa el certificado para autenticarse contra ARCA (WSAA) y consultar el <strong>Padrón</strong> (estado de CUIT/CUIL, servicio <code>ws_sr_padron_a13</code>). Hacen falta dos cosas de ARCA:
      un <strong>certificado digital</strong> (par clave privada + certificado firmado por ARCA) y que ese certificado esté <strong>autorizado</strong> específicamente para el servicio de Padrón.
    </p>

    <div className="space-y-2">
      <h4 className="text-white font-medium">1) Generar el par clave privada + pedido de certificado (CSR)</h4>
      <p className="text-sm">En una terminal, con OpenSSL (ya instalado en Mac/Linux):</p>
      <pre className="text-[11px] bg-gray-900 text-gray-300 rounded-lg p-3 overflow-x-auto">
{`openssl genrsa -out MiClavePrivada.key 2048
openssl req -new -key MiClavePrivada.key \\
  -subj "/CN=unAliasCorto/serialNumber=CUIT 20XXXXXXXXX" \\
  -out MiPedido.csr`}
      </pre>
      <p className="text-sm">
        <code>MiClavePrivada.key</code> nunca se comparte ni se sube a ningún lado (ni a git, ni por chat) — es lo único que demuestra que sos vos. <code>MiPedido.csr</code> sí se puede compartir, es el "pedido" que se lleva a ARCA.
      </p>
      <p className="text-sm">
        Importante: el CSR (encabezado <code>-----BEGIN CERTIFICATE REQUEST-----</code>) no es lo mismo que el certificado firmado que te va a devolver ARCA más adelante (encabezado <code>-----BEGIN CERTIFICATE-----</code>). Son dos archivos distintos y solo el segundo sirve para conectar la app.
      </p>
    </div>

    <div className="space-y-2">
      <h4 className="text-white font-medium">2) Cargar el CSR en ARCA y generar el certificado</h4>
      <ol className="text-sm list-decimal list-inside space-y-1">
        <li>
          Entrar a WSASS con Clave Fiscal — homologación: <code>wsass-homo.afip.gob.ar</code>. Producción: <code>auth.afip.gob.ar</code> → "Administrador de Certificados Digitales".
        </li>
        <li>Cargar el archivo <code>MiPedido.csr</code> y ponerle un alias corto (sin guiones ni espacios problemáticos).</li>
        <li>ARCA devuelve el certificado firmado (.crt) — guardarlo junto a la clave privada.</li>
      </ol>
      <p className="text-sm">
        Tené en cuenta: los alias son únicos por CUIT en todo ARCA, no por ambiente. Si ya usaste un alias en homologación (por ejemplo "miAlias"), no vas a poder reutilizarlo en producción — da error
        "El ALIAS ya existe. Debe utilizar otro nombre". Usá algo distinto y descriptivo, como "miAlias-prod".
      </p>
      <p className="text-sm">
        También puede pasar que ARCA muestre una pantalla de error genérico ("Internal Server Error") justo al subir el CSR, aunque el certificado se haya generado igual del lado del servidor. Antes de
        asumir que falló, volvé a la lista de certificados y fijate si el alias ya aparece con estado "VALIDO".
      </p>
    </div>

    <div className="space-y-2">
      <h4 className="text-white font-medium">3) Autorizar el alias para "Consulta Padrón"</h4>
      <p className="text-sm">
        Tener el certificado NO alcanza: además hay que autorizar ese alias para el servicio puntual. Esto se hace en una sección aparte de ARCA, distinta de donde generaste el certificado:
        "Administrador de Relaciones" (accesible desde el portal principal de ARCA, ícono "Administrador de relaciones").
      </p>
      <p className="text-sm">
        Ahí el camino es: "Nueva Relación" → Representado: tu propio CUIT → "Buscar" servicio → categoría "ARCA" → "WebServices" → buscar y elegir "Servicio Consulta Padrón A13". El sistema te va a pedir
        el "Representante", que es el Computador Fiscal identificado por el alias de tu certificado — se completa automáticamente si ya lo cargaste. Por último, "Confirmar".
      </p>
      <p className="text-sm">
        Si el alias ya estaba autorizado para otro servicio (por ejemplo Facturación Electrónica, <code>wsfe</code>), esa autorización es independiente — hay que agregar esta aparte. Sin completar este
        paso, aunque el certificado esté válido, la conexión falla con errores como "Request failed with status code 500".
      </p>
    </div>

    <div className="space-y-2">
      <h4 className="text-white font-medium">4) Conectar acá</h4>
      <p className="text-sm">
        Con el certificado y la clave privada ya autorizados, pegarlos en el formulario de esta página (contenido completo, incluyendo las líneas <code>-----BEGIN...-----</code>/<code>-----END...-----</code>),
        elegir el ambiente correspondiente, y "Conectar" — valida en el momento pidiendo un ticket real a ARCA antes de guardar nada.
      </p>
    </div>

    <div className="space-y-2 pt-2 border-t border-gray-700">
      <h4 className="text-white font-medium">Para pasar a Producción</h4>
      <p className="text-sm">Es el mismo procedimiento (pasos 1 a 3), pero:</p>
      <ul className="text-sm list-disc list-inside space-y-1">
        <li>
          Se hace en el portal de <strong>producción</strong> de ARCA (<code>auth.afip.gob.ar</code>), no en el de homologación — y con la Clave Fiscal real de la organización, no una de prueba.
        </li>
        <li>Hay que generar un certificado nuevo con un alias distinto al de homologación (no se puede reutilizar el mismo alias) — son ambientes separados con sus propias autorizaciones.</li>
        <li>Autorizar ese alias nuevo para <code>ws_sr_padron_a13</code> en el "Administrador de Relaciones" de producción (la autorización de homologación no se traslada).</li>
        <li>
          Conectar acá con ese certificado/clave, eligiendo <strong>"Producción"</strong> como ambiente — ahí la app apunta a los servidores reales de ARCA en vez de a los de testing, y los datos que
          devuelva van a ser de contribuyentes reales.
        </li>
      </ul>
    </div>
  </div>
);

/** Días hasta el vencimiento del certificado → clase de color (rojo si ya venció, ámbar si está por vencer). */
function claseVencimiento(vencimiento: string | null): string {
  if (!vencimiento) return "text-gray-500";
  const dias = (new Date(vencimiento).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (dias < 0) return "text-red-500 font-semibold";
  if (dias < 30) return "text-amber-500 font-semibold";
  return "text-gray-500";
}

export function AfipConfigPage() {
  const [status, setStatus] = useState<AfipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [form, setForm] = useState({ cuitRepresentada: "", certificadoPem: "", clavePrivadaPem: "", ambiente: "homologacion" as "homologacion" | "produccion" });
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<AfipLogEntry[] | null>(null);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logExpandido, setLogExpandido] = useState<string | null>(null);

  const cargar = async () => {
    setLoading(true);
    try {
      setStatus(await afipAPI.status());
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo obtener el estado de ARCA.");
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
      const resultado = await afipAPI.connect(form);
      if (resultado.servicioPadronOk) {
        sweetAlert.success("ARCA conectado", "Las credenciales se validaron y el servicio Consulta Padrón A13 quedó verificado.");
      } else {
        sweetAlert.warning("Conectado a WSAA, pero el servicio no está autorizado", resultado.servicioPadronDetalle || "El certificado es válido, pero ARCA no autoriza el servicio Consulta Padrón A13 para él todavía.");
      }
      setForm({ cuitRepresentada: "", certificadoPem: "", clavePrivadaPem: "", ambiente: "homologacion" });
      await cargar();
    } catch (e: any) {
      sweetAlert.error("No se pudo conectar", e?.response?.data?.error || "Revisá las credenciales.");
    } finally {
      setConnecting(false);
    }
  };

  const handleVerificarServicio = async () => {
    setVerificando(true);
    try {
      const resultado = await afipAPI.verificarServicio();
      if (resultado.ok) {
        sweetAlert.success("Servicio verificado", "La autoconsulta contra Consulta Padrón A13 respondió correctamente.");
      } else {
        sweetAlert.warning("Servicio no autorizado", resultado.detalle);
      }
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo revalidar el servicio.");
    } finally {
      setVerificando(false);
    }
  };

  const handleDisconnect = async () => {
    const res = await sweetAlert.confirm("¿Desconectar ARCA?", "Se borrarán las credenciales de esta organización. Las consultas a ARCA dejarán de funcionar hasta reconectar.", "Sí, desconectar");
    if (!res.isConfirmed) return;
    try {
      await afipAPI.disconnect();
      await cargar();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo desconectar.");
    }
  };

  const handleVerLogs = async () => {
    setShowLogs(true);
    setLoadingLogs(true);
    try {
      setLogs(await afipAPI.logs());
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron cargar los logs de ARCA.");
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  };

  return (
    <PageLayout
      title="ARCA | Conexión · Constancia de CUIT"
      subtitle="El certificado con el que se consulta el padrón: estado del CUIT, denominación y la constancia"
      faIcon={{ icon: faLandmark }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: "Cómo conectar ARCA",
        content: GUIA_ARCA,
      }}
    >
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
        </div>
      ) : status?.connected ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-xl space-y-4">
          <div className="flex items-center gap-3">
            <FontAwesomeIcon icon={faLandmark} className="h-7 w-7 text-blue-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">ARCA conectado</h3>
              <p className="text-xs text-gray-500">CUIT representada: {status.cuitRepresentada}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Ambiente: <strong>{status.ambiente === "produccion" ? "Producción" : "Homologación (testing)"}</strong>
            {status.ambiente === "homologacion" && <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">Los datos que devuelve ARCA en homologación son ficticios, no reales — sirve para probar el flujo, no para uso productivo.</span>}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm border-t border-gray-100 dark:border-gray-700 pt-3">
            {status.certificadoAlias && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <FontAwesomeIcon icon={faFingerprint} className="text-gray-400 w-3.5" />
                Alias: <span className="font-mono text-xs">{status.certificadoAlias}</span>
              </div>
            )}
            {status.connectedAt && (
              <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                <FontAwesomeIcon icon={faCalendarDays} className="text-gray-400 w-3.5" />
                Conectado el {new Date(status.connectedAt).toLocaleDateString("es-AR")}
              </div>
            )}
            {status.certificadoVencimiento && (
              <div className={`flex items-center gap-2 ${claseVencimiento(status.certificadoVencimiento)}`}>
                <FontAwesomeIcon icon={faHourglassHalf} className="w-3.5" />
                {new Date(status.certificadoVencimiento).getTime() < Date.now() ? "Certificado vencido el " : "Certificado vence el "}
                {new Date(status.certificadoVencimiento).toLocaleDateString("es-AR")}
              </div>
            )}
          </div>

          {/* "Conectado" (arriba) solo prueba que el certificado/clave son válidos (login WSAA). Esto
              prueba, con una autoconsulta real, que el servicio Consulta Padrón A13 esté además
              autorizado en ARCA para ese certificado — son cosas distintas. */}
          {status.servicioPadronEstado === "ok" ? (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800">
              <FontAwesomeIcon icon={faCheck} className="w-3.5 shrink-0" />
              Servicio Consulta Padrón A13 verificado{status.servicioPadronVerificadoAt && ` — ${new Date(status.servicioPadronVerificadoAt).toLocaleDateString("es-AR")}`}
            </div>
          ) : status.servicioPadronEstado === "no_autorizado" ? (
            <div className="space-y-1.5 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 font-semibold">
                <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 shrink-0" />
                Conectado a WSAA, pero el servicio Consulta Padrón A13 no está autorizado
              </div>
              <p>{status.servicioPadronDetalle}</p>
              {(status.servicioPadronFaultCode || status.servicioPadronFaultString) && (
                <p className="font-mono text-[10px] opacity-80 break-words">
                  {status.servicioPadronFaultCode} {status.servicioPadronFaultString}
                </p>
              )}
            </div>
          ) : status.servicioPadronEstado === "error" ? (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 shrink-0" />
              No se pudo verificar el servicio ({status.servicioPadronDetalle || "error de comunicación"}) — probá "Revalidar servicio".
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-gray-50 text-gray-500 dark:bg-gray-900/40 dark:text-gray-400 border border-gray-200 dark:border-gray-700">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-3.5 shrink-0" />
              Servicio Consulta Padrón A13 sin verificar todavía.
            </div>
          )}

          {status.canManageConnection && (
            <div className="flex items-center gap-4">
              <button onClick={handleDisconnect} className="text-sm text-red-500 hover:text-red-600 font-semibold">
                Desconectar
              </button>
              <button onClick={handleVerificarServicio} disabled={verificando} className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-semibold disabled:opacity-50">
                <FontAwesomeIcon icon={verificando ? faSpinner : faRotate} spin={verificando} className="h-3.5 w-3.5" />
                {verificando ? "Revalidando..." : "Revalidar servicio"}
              </button>
              <button onClick={handleVerLogs} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-semibold">
                <FontAwesomeIcon icon={faListUl} className="h-3.5 w-3.5" />
                Logs
              </button>
            </div>
          )}
        </div>
      ) : !status?.canManageConnection ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-8 text-center text-gray-500 max-w-xl">
          <FontAwesomeIcon icon={faLandmark} className="h-10 w-10 text-blue-500 mb-3" />
          <p className="font-semibold text-gray-700 dark:text-gray-200">ARCA no está conectado</p>
          <p className="text-sm mt-1">Pedile a un administrador que conecte el certificado de ARCA de la organización.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 max-w-xl">
          <div className="flex items-center gap-3 mb-4">
            <FontAwesomeIcon icon={faLandmark} className="h-7 w-7 text-blue-600" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Conectar ARCA</h3>
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
              {connecting ? "Validando contra ARCA..." : "Conectar"}
            </button>
            <p className="text-[11px] text-gray-400 flex items-start gap-1.5">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5" />
              El certificado tiene que estar autorizado en ARCA (WSASS) para el servicio "Consulta Padrón" (ws_sr_padron_a13), además del CUIT que lo representa.
            </p>
          </div>
        </div>
      )}

      {showLogs && (
        <Modal isOpen={showLogs} onClose={() => setShowLogs(false)} title="Logs de ARCA" subtitle="Últimos 50 llamados reales al webservice (Consulta Padrón / Revalidar servicio)" size="xl" zIndex={80}>
          {loadingLogs ? (
            <div className="flex justify-center py-10 text-gray-400">
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
            </div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">Todavía no hay ningún llamado registrado.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/60 max-h-[65vh] overflow-y-auto custom-scrollbar">
              {logs.map((log) => {
                const ok = !log.error && (log.tipo === "servicio_test" ? log.encontrado : log.estado === "activo" || log.estado === "inactivo");
                const expandido = logExpandido === log._id;
                return (
                  <li key={log._id} className="py-2.5">
                    <button type="button" onClick={() => setLogExpandido(expandido ? null : log._id)} className="w-full flex items-start justify-between gap-3 text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${log.tipo === "servicio_test" ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-400" : "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400"}`}>
                            {log.tipo === "servicio_test" ? "Revalidar servicio" : "Consulta Padrón"}
                          </span>
                          <FontAwesomeIcon icon={ok ? faCheck : faXmark} className={`h-3 w-3 ${ok ? "text-green-500" : "text-red-500"}`} />
                          <span className="text-sm font-mono text-gray-700 dark:text-gray-200">{log.cuitConsultado}</span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">{log.error ? "error" : `encontrado=${String(log.encontrado)} · estado=${log.estado || "—"}`}</span>
                        </div>
                        {(log.faultCode || log.faultString || log.error) && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5 truncate">{log.error || `${log.faultCode || ""} ${log.faultString || ""}`.trim()}</p>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-400 whitespace-nowrap shrink-0">{new Date(log.createdAt).toLocaleString("es-AR")}</span>
                    </button>
                    {expandido && (
                      <pre className="mt-2 text-[11px] bg-gray-900 text-gray-300 rounded-lg p-3 overflow-auto max-h-[40vh] whitespace-pre-wrap break-words">
                        {JSON.stringify({ cuitRepresentada: log.cuitRepresentada, ambiente: log.ambiente, faultCode: log.faultCode, faultString: log.faultString, error: log.error, raw: log.raw }, null, 2)}
                      </pre>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Modal>
      )}
    </PageLayout>
  );
}

export default AfipConfigPage;
