import React, { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faGear, faFolderOpen, faSpinner, faCloudArrowUp } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { MongoDbConfig } from "../components/documents/MongoDbConfig";
import { DropboxTab } from "../components/documents/DropboxTab";
import { backupsAPI } from "../api/backups";
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
type Tab = "config" | "backups";

export const MongoDbPage: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("config");
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);
  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);

  const [generandoBackup, setGenerandoBackup] = useState(false);
  /**
   * Cambia después de un backup manual para remontar el listado: el tab lee la carpeta al montarse, y
   * sin esto la copia recién hecha no aparece hasta recargar la página.
   */
  const [recarga, setRecarga] = useState(0);

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
      // El contador es de los archivos de la copia: en la pestaña de configuración no cuenta nada.
      itemCount={tab === "backups" ? itemCount : undefined}
      shouldShowInfo={false}
      infoModal={{ isOpen: false, onOpen: () => {}, onClose: () => {}, title: "MongoDB", content: null }}
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
        </div>
      }
    >
      <div className="animate-in fade-in duration-300">
        {tab === "config" && <MongoDbConfig />}
        {/* La carpeta de Dropbox donde las deja el scheduler. Sin botón de actualizar: el contenido lo
            genera el propio sistema y el listado se recarga solo al terminar un backup. */}
        {tab === "backups" && <DropboxTab key={`ddbb-${recarga}`} fixedRoot="/WEPRODU/DDBB" rootLabel="DDBB" ocultarActualizar onCountChange={handleCountChange} />}
      </div>
    </PageLayout>
  );
};

export default MongoDbPage;
