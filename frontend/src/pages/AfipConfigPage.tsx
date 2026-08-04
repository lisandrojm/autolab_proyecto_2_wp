import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faPlug, faSpinner, faTriangleExclamation, faCalendarDays, faFingerprint, faHourglassHalf } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { afipAPI, AfipStatus } from "../api/afip";
import { sweetAlert } from "../utils/sweetAlert";

const GUIA_AFIP = (
  <div className="space-y-5 text-gray-400">
    <p>
      La app usa el certificado para autenticarse contra AFIP (WSAA) y consultar el <strong>Padrón</strong> (estado de CUIT/CUIL, servicio <code>ws_sr_padron_a13</code>). Hacen falta dos cosas de AFIP:
      un <strong>certificado digital</strong> (par clave privada + certificado firmado por AFIP) y que ese certificado esté <strong>autorizado</strong> específicamente para el servicio de Padrón.
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
        <code>MiClavePrivada.key</code> nunca se comparte ni se sube a ningún lado (ni a git, ni por chat) — es lo único que demuestra que sos vos. <code>MiPedido.csr</code> sí se puede compartir, es el "pedido" que se lleva a AFIP.
      </p>
      <p className="text-sm">
        Importante: el CSR (encabezado <code>-----BEGIN CERTIFICATE REQUEST-----</code>) no es lo mismo que el certificado firmado que te va a devolver AFIP más adelante (encabezado <code>-----BEGIN CERTIFICATE-----</code>). Son dos archivos distintos y solo el segundo sirve para conectar la app.
      </p>
    </div>

    <div className="space-y-2">
      <h4 className="text-white font-medium">2) Cargar el CSR en AFIP y generar el certificado</h4>
      <ol className="text-sm list-decimal list-inside space-y-1">
        <li>
          Entrar a WSASS con Clave Fiscal — homologación: <code>wsass-homo.afip.gob.ar</code>. Producción: <code>auth.afip.gob.ar</code> → "Administrador de Certificados Digitales".
        </li>
        <li>Cargar el archivo <code>MiPedido.csr</code> y ponerle un alias corto (sin guiones ni espacios problemáticos).</li>
        <li>AFIP devuelve el certificado firmado (.crt) — guardarlo junto a la clave privada.</li>
      </ol>
      <p className="text-sm">
        Tené en cuenta: los alias son únicos por CUIT en todo AFIP, no por ambiente. Si ya usaste un alias en homologación (por ejemplo "miAlias"), no vas a poder reutilizarlo en producción — da error
        "El ALIAS ya existe. Debe utilizar otro nombre". Usá algo distinto y descriptivo, como "miAlias-prod".
      </p>
      <p className="text-sm">
        También puede pasar que AFIP muestre una pantalla de error genérico ("Internal Server Error") justo al subir el CSR, aunque el certificado se haya generado igual del lado del servidor. Antes de
        asumir que falló, volvé a la lista de certificados y fijate si el alias ya aparece con estado "VALIDO".
      </p>
    </div>

    <div className="space-y-2">
      <h4 className="text-white font-medium">3) Autorizar el alias para "Consulta Padrón"</h4>
      <p className="text-sm">
        Tener el certificado NO alcanza: además hay que autorizar ese alias para el servicio puntual. Esto se hace en una sección aparte de AFIP, distinta de donde generaste el certificado:
        "Administrador de Relaciones" (accesible desde el portal principal de AFIP/ARCA, ícono "Administrador de relaciones").
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
        elegir el ambiente correspondiente, y "Conectar" — valida en el momento pidiendo un ticket real a AFIP antes de guardar nada.
      </p>
    </div>

    <div className="space-y-2 pt-2 border-t border-gray-700">
      <h4 className="text-white font-medium">Para pasar a Producción</h4>
      <p className="text-sm">Es el mismo procedimiento (pasos 1 a 3), pero:</p>
      <ul className="text-sm list-disc list-inside space-y-1">
        <li>
          Se hace en el portal de <strong>producción</strong> de AFIP (<code>auth.afip.gob.ar</code>), no en el de homologación — y con la Clave Fiscal real de la organización, no una de prueba.
        </li>
        <li>Hay que generar un certificado nuevo con un alias distinto al de homologación (no se puede reutilizar el mismo alias) — son ambientes separados con sus propias autorizaciones.</li>
        <li>Autorizar ese alias nuevo para <code>ws_sr_padron_a13</code> en el "Administrador de Relaciones" de producción (la autorización de homologación no se traslada).</li>
        <li>
          Conectar acá con ese certificado/clave, eligiendo <strong>"Producción"</strong> como ambiente — ahí la app apunta a los servidores reales de AFIP en vez de a los de testing, y los datos que
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
  const [showInfoModal, setShowInfoModal] = useState(false);
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
    <PageLayout
      title="AFIP"
      subtitle="Conexión con AFIP/ARCA para consultar el Padrón (estado de CUIT/CUIL)"
      faIcon={{ icon: faLandmark }}
      infoModal={{
        isOpen: showInfoModal,
        onOpen: () => setShowInfoModal(true),
        onClose: () => setShowInfoModal(false),
        title: "Cómo conectar AFIP",
        content: GUIA_AFIP,
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
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">AFIP conectado</h3>
              <p className="text-xs text-gray-500">CUIT representada: {status.cuitRepresentada}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Ambiente: <strong>{status.ambiente === "produccion" ? "Producción" : "Homologación (testing)"}</strong>
            {status.ambiente === "homologacion" && <span className="block text-[11px] text-amber-600 dark:text-amber-400 mt-1">Los datos que devuelve AFIP en homologación son ficticios, no reales — sirve para probar el flujo, no para uso productivo.</span>}
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
