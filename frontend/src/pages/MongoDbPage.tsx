import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faGear, faFolderOpen, faSpinner, faCloudArrowUp, faScaleBalanced } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { InfoModal } from "../components/ui/InfoModal";
import { MongoDbConfig } from "../components/documents/MongoDbConfig";
import { ListaCopiasBackup } from "../components/documents/ListaCopiasBackup";
import { BaseActualVsCopia } from "../components/documents/BaseActualVsCopia";
import { backupsAPI, ConfigBackup, CopiaBackup } from "../api/backups";
import { sweetAlert } from "../utils/sweetAlert";

/**
 * Configuración → DDBB → MongoDB.
 *
 * Las dos mitades del backup, juntas: cómo está configurado y qué copias hay.
 *
 * Las copias vivían en una pestaña de Documentos, al lado de HelloSign, ARCA y Paritarias. Ahí no
 * pertenecían: esas tres son carpetas de documentos del negocio —contratos, altas, paritarias— que la
 * gente abre para leer, y esto es una copia técnica de la base. Compartían pantalla solo porque las
 * dos cosas se guardan en Dropbox, que es un detalle de dónde, no de qué.
 */
type Tab = "config" | "backups" | "base";

/** Bloque de comando, para los ejemplos de `mongoimport`. */
const Comando: React.FC<{ children: string }> = ({ children }) => (
  <pre className="mt-1 overflow-x-auto rounded bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-[11px] leading-relaxed text-gray-800 dark:text-gray-200">{children}</pre>
);

export const MongoDbPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("config");
  const [showInfo, setShowInfo] = useState(false);
  /** La configuración se lee acá también, para poder mostrar la frecuencia junto a las copias. */
  const [config, setConfig] = useState<ConfigBackup | null>(null);
  /** Las copias se cargan acá también: el comparador necesita la lista para el selector. */
  const [copias, setCopias] = useState<CopiaBackup[]>([]);
  useEffect(() => {
    backupsAPI.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  const [generandoBackup, setGenerandoBackup] = useState(false);
  /** Segundos que lleva la corrida. Un overlay sin nada que se mueva se lee como «se colgó». */
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!generandoBackup) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);

    /*
      Aviso del navegador si intentan cerrar la pestaña. El overlay tapa los clicks de la app, pero no
      la cruz del browser ni un Cmd+W: si se corta a la mitad, la copia queda incompleta en Dropbox —una
      carpeta sin `_backup.json`— y hay que borrarla a mano.
    */
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avisar);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", avisar);
    };
  }, [generandoBackup]);
  /**
   * Cambia después de un backup manual para remontar el listado: el tab lee la carpeta al montarse, y
   * sin esto la copia recién hecha no aparece hasta recargar la página.
   */
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    backupsAPI
      .copias()
      .then((r) => setCopias(r.copias))
      .catch(() => setCopias([]));
  }, [recarga]);

  /*
    Sin confirmación: generar un backup no rompe nada y no se puede "deshacer mal". El único costo es la
    espera, y eso ya lo dice el botón —queda deshabilitado y en «Generando…» mientras corre—.
  */
  const forzarBackup = async () => {
    setGenerandoBackup(true);
    try {
      const r = await backupsAPI.ejecutar();
      setRecarga((n) => n + 1);
      setTab("backups");
      sweetAlert.success("Backup generado", `${r.carpeta} · ${r.colecciones} colecciones · ${r.documentos.toLocaleString("es-AR")} documentos · ${(r.bytes / 1024 / 1024).toFixed(1)} MB`);
    } catch (e: any) {
      const status = e?.response?.status;
      // El 409 no es un error del usuario: ya hay uno corriendo (el automático, o alguien más).
      if (status === 409) sweetAlert.warningAlert("Ya hay un backup en curso", "Esperá a que termine y volvé a intentar.");
      else sweetAlert.error("No se pudo generar el backup", String(e?.response?.data?.error || e?.message || "Probá de nuevo en un momento."));
    } finally {
      setGenerandoBackup(false);
    }
  };

  const claseTab = (activa: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activa ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`;

  return (
    <PageLayout
      title="MongoDB"
      subtitle="Copia automática de la base de datos y cómo restaurarla"
      faIcon={{ icon: faDatabase }}
      onBack={() => navigate("/documents")}
      shouldShowInfo
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: "MongoDB", content: null }}
      headerActions={
        <button
          onClick={forzarBackup}
          disabled={generandoBackup}
          title="Generar un backup de la base ahora, sin esperar la corrida automática"
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FontAwesomeIcon icon={generandoBackup ? faSpinner : faCloudArrowUp} spin={generandoBackup} className="h-4 w-4" />
          {generandoBackup ? "Generando…" : "Backup ahora"}
        </button>
      }
      searchAndFilters={
        <div className="flex border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
          <button className={claseTab(tab === "config")} onClick={() => setTab("config")}>
            <FontAwesomeIcon icon={faGear} className="text-xs" />
            Configuración
          </button>
          <button className={claseTab(tab === "backups")} onClick={() => setTab("backups")}>
            <FontAwesomeIcon icon={faFolderOpen} className="text-xs" />
            DDBB Backup
          </button>
          {/* La base viva, para comparar contra una copia: es lo único que dice si un backup sirve. */}
          <button className={claseTab(tab === "base")} onClick={() => setTab("base")}>
            <FontAwesomeIcon icon={faScaleBalanced} className="text-xs" />
            Base actual
          </button>
        </div>
      }
    >
      <div className="animate-in fade-in duration-300">
        {tab === "config" && <MongoDbConfig />}
        {tab === "backups" && <ListaCopiasBackup recarga={recarga} frecuenciaHoras={config?.intervaloHoras} retener={config?.retener} />}
        {tab === "base" && <BaseActualVsCopia copias={copias} />}
      </div>

      {/*
        MIENTRAS CORRE, LA PANTALLA SE BLOQUEA.

        La corrida recorre la base entera y sube 58 archivos: puede tardar minutos. Con la pantalla
        libre se puede navegar a otra sección, y ahí el componente se desmonta: la petición sigue viva en
        el servidor —el backup igual termina— pero nadie ve si salió bien ni el error si falló, y el
        siguiente click en «Backup ahora» choca con un 409 sin explicación.

        `z-[100]` para quedar por encima del navbar, que es `z-20`/`z-30`.
      */}
      {generandoBackup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/70 backdrop-blur-sm" role="alertdialog" aria-busy="true" aria-live="polite">
          <div className="mx-4 max-w-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-xl px-6 py-5 text-center">
            <FontAwesomeIcon icon={faSpinner} spin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            <p className="mt-3 font-semibold text-gray-900 dark:text-gray-100">Generando el backup…</p>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Se está recorriendo la base entera y subiendo una copia. Puede tardar varios minutos.</p>
            {/* Barra indeterminada + contador: dos señales de que sigue vivo. Con el spinner solo, a los
                treinta segundos parece colgado y alguien recarga la página a mitad de la subida. */}
            <div className="mt-4 h-1 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
              <div className="h-full w-1/3 rounded bg-blue-600 animate-[indeterminado_1.4s_ease-in-out_infinite]" style={{ animationName: "indeterminado" }} />
            </div>
            <style>{`@keyframes indeterminado { 0% { margin-left: -35%; } 100% { margin-left: 100%; } }`}</style>
            <p className="mt-3 text-xs text-gray-500 tabular-nums">
              {Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, "0")} transcurridos
            </p>
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No cierres esta pestaña: si se corta, la copia queda incompleta.</p>
          </div>
        </div>
      )}

      <InfoModal isOpen={showInfo} onClose={() => setShowInfo(false)} title="Cómo funciona el backup" size="lg" zIndex={60} actions={[{ label: "Entendido", onClick: () => setShowInfo(false), variant: "primary" }]}>
        <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
          <p>
            Cada cierta cantidad de horas —lo elegís en <strong>Configuración</strong>— el servidor recorre la base entera y arma una copia. La corrida también se puede disparar a mano
            con <strong>Backup ahora</strong>.
          </p>

          <div>
            <p className="font-semibold mb-1">Qué se guarda</p>
            <p>
              Un archivo <code>.json</code> por colección, en JSON extendido y <strong>sin comprimir</strong>: se abre y se lee tal cual. Va en formato canónico, o sea que cada valor
              lleva su tipo — un <code>ObjectId</code> vuelve <code>ObjectId</code> y una fecha vuelve fecha. Con el formato "relajado", un número largo vuelve con un dígito cambiado
              y la copia deja de ser fiel.
            </p>
            <p className="mt-1">
              Se suma un <code>_backup.json</code> con de qué base salió, cuándo, y cuántos documentos tiene cada colección. Va <strong>último</strong>: si está, la copia quedó
              completa; si falta, la subida se cortó a la mitad.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">Dónde queda: dos destinos</p>
            <ul className="space-y-1 list-disc pl-5">
              <li>
                <strong>Dropbox</strong> — en <code>/WEPRODU/DDBB</code>, una carpeta por copia. Se conservan las últimas que digas en Configuración.
              </li>
              <li>
                <strong>Dentro de Mongo</strong> — la base se <strong>clona</strong> en una base nueva llamada <code>&lt;base&gt;_&lt;fecha&gt;_&lt;hora&gt;</code>. Se abre desde
                Atlas y se consulta como cualquier base: no hay que importar nada. Se conserva solo la última.
                <br />
                Por defecto va en el <strong>mismo cluster</strong>, que resuelve el caso común —alguien borró una colección, un script escribió mal— pero <strong>no</strong>{" "}
                protege si el cluster se cae o se pierde. Para eso está la copia en Dropbox.
              </li>
            </ul>
            <p className="mt-1 text-xs text-gray-500">
              Si un destino falla, el otro igual guarda la copia, y ninguno borra lo viejo si lo suyo falló. El error queda registrado y se muestra en Configuración.
            </p>
          </div>

          <div>
            <p className="font-semibold mb-1">Cómo se recupera</p>
            <p>Desde el clon en Atlas, mirando la base directamente. O desde Dropbox: bajás la copia con el botón de descarga, la descomprimís y, parada en la carpeta:</p>
            <Comando>{`mongoimport --uri "mongodb+srv://<usuario>:<clave>@<cluster>/<base>" \\
  --collection users --file users.json`}</Comando>
            <p className="mt-2">Para importar la carpeta entera, una colección por archivo:</p>
            <Comando>{`for f in *.json; do
  [ "$f" = "_backup.json" ] && continue   # el manifiesto no es una colección
  mongoimport --uri "mongodb+srv://<usuario>:<clave>@<cluster>/<base>" \\
    --collection "\${f%.json}" --file "$f"
done`}</Comando>
            <p className="mt-2 text-xs text-gray-500">
              <strong>Importá siempre sobre una base vacía</strong>, no sobre una con datos: <code>mongoimport</code> no borra lo que ya está, y los documentos con el mismo{" "}
              <code>_id</code> se rechazan mientras el resto entra — quedaría una base mezclada.
            </p>
            <p className="mt-1 text-xs text-gray-500">
              Sin <code>mongoimport</code> a mano, en el repo está <code>npm run restaurar:backup</code>, que hace lo mismo con la carpeta entera y arranca en modo simulación.
            </p>
          </div>

          <p className="text-xs text-gray-500">
            La copia tiene <strong>todos</strong> los datos de la base, incluidos CUITs, CBUs, domicilios y teléfonos, en texto plano. Quien pueda entrar a esa carpeta de Dropbox o a
            ese cluster se lleva la base entera.
          </p>
        </div>
      </InfoModal>
    </PageLayout>
  );
};

export default MongoDbPage;
