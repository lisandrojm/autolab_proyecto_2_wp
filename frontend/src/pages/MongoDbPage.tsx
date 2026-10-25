import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faGear, faFolderOpen, faSpinner, faCloudArrowUp, faScaleBalanced } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { InfoModal } from "../components/ui/InfoModal";
import { MongoDbConfig } from "../components/documents/MongoDbConfig";
import { ListaCopiasBackup } from "../components/documents/ListaCopiasBackup";
import { BaseActualVsCopia } from "../components/documents/BaseActualVsCopia";
import { backupsAPI, ConfigBackup, CopiaBackup, ProgresoBackup } from "../api/backups";
import { sweetAlert } from "../utils/sweetAlert";
import { mensajeErrorApi } from "../utils/errorApi";
import { usePuedeAbrir } from "../hooks/usePuedeAbrir";

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

const mb = (b: number) => `${(b / 1024 / 1024).toLocaleString("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;

/**
 * La barra de la copia en curso: en qué paso va, cuánto lleva de ese paso y qué está haciendo ahora.
 * Paso 1 se mide en colecciones (no se sabe cuánto pesa la base hasta leerla); paso 2, en MB subidos.
 */
function BarraDeAvance({ p, ahora }: { p: ProgresoBackup; ahora: number }) {
  const seg = Math.max(0, Math.floor((ahora - new Date(p.inicio).getTime()) / 1000));
  const reloj = `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
  const pct =
    p.paso === "limpiando" ? 100 : p.paso === "subiendo" && p.bytesTotal ? Math.round((p.bytes / p.bytesTotal) * 100) : p.total ? Math.round((p.hechas / p.total) * 100) : 0;
  const titulo = p.paso === "leyendo" ? "Paso 1 de 2 · Leyendo la base" : p.paso === "subiendo" ? "Paso 2 de 2 · Subiendo a Dropbox" : "Terminando · Borrando las copias viejas";
  const detalle =
    p.paso === "leyendo"
      ? `${p.hechas} de ${p.total} colecciones · ${mb(p.bytes)} leídos${p.actual ? ` · ahora: ${p.actual}` : ""}`
      : p.paso === "subiendo"
        ? `${p.hechas} de ${p.total} archivos · ${mb(p.bytes)} de ${mb(p.bytesTotal || 0)}${p.actual ? ` · ahora: ${p.actual}` : ""}`
        : "Se conservan las últimas según la configuración.";
  return (
    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/60 dark:bg-blue-950/30" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
          <FontAwesomeIcon icon={faSpinner} spin className="h-3.5 w-3.5" />
          Backup en curso ({p.disparador === "manual" ? "manual" : "automático"}) · {titulo}
        </p>
        <span className="text-xs tabular-nums text-blue-800/80 dark:text-blue-300/80">
          {pct}% · {reloj} transcurridos
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded bg-blue-100 dark:bg-blue-900/50">
        <div className="h-full rounded bg-blue-600 transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 truncate text-xs text-blue-900/80 dark:text-blue-200/80" title={detalle}>
        {detalle}
      </p>
      <p className="mt-0.5 text-[11px] text-blue-900/60 dark:text-blue-300/60">Tarda unos 15 minutos. Corre en el servidor: podés cerrar esta pantalla, la copia sigue.</p>
    </div>
  );
}

export const MongoDbPage: React.FC = () => {
  const navigate = useNavigate();
  const puedeAbrir = usePuedeAbrir();
  const [tab, setTab] = useState<Tab>("config");
  const [showInfo, setShowInfo] = useState(false);
  /** La configuración se lee acá también, para poder mostrar la frecuencia junto a las copias. */
  const [config, setConfig] = useState<ConfigBackup | null>(null);
  /** Las copias se cargan acá también: el comparador necesita la lista para el selector. */
  const [copias, setCopias] = useState<CopiaBackup[]>([]);
  useEffect(() => {
    backupsAPI.config().then(setConfig).catch(() => setConfig(null));
  }, []);

  /**
   * Cambia después de un backup para remontar el listado y la configuración: los dos leen al montarse,
   * y sin esto la copia recién hecha (o el error) no aparece hasta recargar la página.
   */
  const [recarga, setRecarga] = useState(0);

  /*
    EL AVANCE DE LA COPIA EN CURSO (25/10/2026). La copia corre en el servidor (~14 minutos) y la
    pantalla pregunta cada 2 s cómo va: paso, cuántas colecciones o archivos lleva, cuál, cuántos MB.
    Sirve igual para la manual y para la automática —antes, con la automática corriendo, «Backup ahora»
    sólo decía «Ya hay un backup en curso» y nada más—. Ya no se bloquea la pantalla: cerrar la pestaña
    no corta nada, la copia es del servidor.
  */
  const [estado, setEstado] = useState<{ enCurso: boolean; progreso: ProgresoBackup | null } | null>(null);
  const [seguir, setSeguir] = useState(0);
  const enCurso = !!estado?.enCurso;
  /** Para saber, al terminar, si salió bien: el `ultimoBackupAt` que había cuando se la vio corriendo. */
  const ultimoAlEmpezar = useRef<string | null | undefined>(undefined);
  /** Si en la lectura anterior había una en curso: el paso de «sí» a «no» es que terminó. */
  const estabaEnCurso = useRef(false);
  const [ahora, setAhora] = useState(Date.now());

  useEffect(() => {
    let vivo = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const leer = async () => {
      try {
        const p = await backupsAPI.progreso();
        if (!vivo) return;
        if (p.enCurso && ultimoAlEmpezar.current === undefined) ultimoAlEmpezar.current = config?.ultimoBackupAt ?? null;
        const termino = estabaEnCurso.current && !p.enCurso;
        estabaEnCurso.current = p.enCurso;
        setEstado(p);
        if (termino) void alTerminar();
        if (p.enCurso) t = setTimeout(leer, 2000);
      } catch {
        // Sin respuesta (red, 403): se deja de seguir; la pantalla queda como estaba.
      }
    };
    void leer();
    return () => {
      vivo = false;
      if (t) clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seguir]);

  useEffect(() => {
    if (!enCurso) return;
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enCurso]);

  /** La copia terminó: se recarga todo y se dice cómo salió (leyendo lo que quedó guardado). */
  const alTerminar = async () => {
    const previo = ultimoAlEmpezar.current;
    ultimoAlEmpezar.current = undefined;
    setRecarga((n) => n + 1);
    try {
      const c = await backupsAPI.config();
      setConfig(c);
      const salioBien = !!c.ultimoBackupAt && c.ultimoBackupAt !== previo && !c.ultimoError;
      if (salioBien) {
        setTab("backups");
        sweetAlert.success("Backup generado", "La copia nueva ya está en DDBB Backup.");
      } else sweetAlert.error("El backup falló", c.ultimoError || "No se pudo generar la copia.");
    } catch {
      /* la pantalla se recarga igual con `recarga` */
    }
  };

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
    ultimoAlEmpezar.current = config?.ultimoBackupAt ?? null;
    try {
      await backupsAPI.ejecutar();
    } catch (e: any) {
      // El 409 no es un error del usuario: ya hay uno corriendo (el automático, o alguien más). En vez
      // de un cartel, se muestra el avance de ése.
      if (e?.response?.status !== 409) {
        ultimoAlEmpezar.current = undefined;
        const m = mensajeErrorApi(e, "No se pudo arrancar el backup");
        sweetAlert.error(m.titulo, m.detalle);
        return;
      }
    }
    setSeguir((n) => n + 1);
  };

  const claseTab = (activa: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activa ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`;

  return (
    <PageLayout
      title="MongoDB"
      subtitle="Copia automática de la base de datos y cómo restaurarla"
      faIcon={{ icon: faDatabase }}
      onBack={puedeAbrir("/documents") ? () => navigate("/documents") : undefined}
      shouldShowInfo
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: "MongoDB", content: null }}
      headerActions={
        <button
          onClick={forzarBackup}
          disabled={enCurso}
          title={enCurso ? "Hay una copia en curso: el avance está abajo" : "Generar un backup de la base ahora, sin esperar la corrida automática"}
          className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FontAwesomeIcon icon={enCurso ? faSpinner : faCloudArrowUp} spin={enCurso} className="h-4 w-4" />
          {enCurso ? "Backup en curso…" : "Backup ahora"}
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
      {/* La barra va arriba de las pestañas, sin tapar nada: se puede seguir mirando mientras corre. */}
      {enCurso && estado?.progreso && <BarraDeAvance p={estado.progreso} ahora={ahora} />}
      <div className="animate-in fade-in duration-300">
        {tab === "config" && <MongoDbConfig key={recarga} />}
        {tab === "backups" && <ListaCopiasBackup recarga={recarga} frecuenciaHoras={config?.intervaloHoras} retener={config?.retener} />}
        {tab === "base" && <BaseActualVsCopia copias={copias} />}
      </div>

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
