import { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faDatabase, faSpinner, faCloudArrowUp, faFileSignature } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { DropboxTab } from "../components/documents/DropboxTab";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { backupsAPI } from "../api/backups";
import { sweetAlert } from "../utils/sweetAlert";

type TabKey = "dropbox" | "afip" | "paritarias" | "ddbb";

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dropbox");
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);
  const [showInfo, setShowInfo] = useState(false);
  const helpEntry = getHelp("documents");

  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);

  const [generandoBackup, setGenerandoBackup] = useState(false);
  /**
   * Cambia después de un backup manual para remontar el listado.
   *
   * El tab lee la carpeta de Dropbox al montarse; sin esto, el backup recién hecho no aparece hasta
   * recargar la página, y da la impresión de que el botón no hizo nada.
   */
  const [recargaDdbb, setRecargaDdbb] = useState(0);

  /*
    Sin confirmación: generar un backup no rompe nada y no se puede "deshacer mal". El único costo es la
    espera, y eso ya lo dice el botón —queda deshabilitado y en «Generando…» mientras corre—. Un cartel
    rojo de confirmar acá sería el mismo que aparece para borrar, sobre una acción que no borra nada.
  */
  const forzarBackup = async () => {
    setGenerandoBackup(true);
    try {
      const r = await backupsAPI.ejecutar();
      setRecargaDdbb((n) => n + 1);
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

  return (
    <PageLayout
      // "Documentos" a secas, igual que en el menú: el ícono ya dice que vienen de Dropbox.
      title="Documentos"
      faIcon={{ icon: faDropbox }}
      itemCount={itemCount}
      shouldShowInfo={hasHelp("documents")}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: helpEntry.title, size: helpEntry.size, content: helpEntry.content }}
      searchAndFilters={
        <div className="mx-auto">
          {/* Tabs Header */}
          <div className="flex items-center justify-between gap-3 border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900 overflow-x-auto">
            <div className="flex">
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "dropbox" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("dropbox")}>
                <FontAwesomeIcon icon={faDropbox} className="text-xs" />
                HelloSign (DropboxSign)
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "afip" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("afip")}>
                <FontAwesomeIcon icon={faLandmark} className="text-xs" />
                ARCA
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "paritarias" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("paritarias")} title="Espejo en Dropbox de los archivos de paritarias">
                <FontAwesomeIcon icon={faFileSignature} className="text-xs" />
                Paritarias
              </button>
                            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "ddbb" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("ddbb")} title="Backups automáticos de la base de datos">
                <FontAwesomeIcon icon={faDatabase} className="text-xs" />
                DDBB
              </button>
            </div>
            {/* El botón de backup solo tiene sentido en su propia pestaña. */}
            {activeTab === "ddbb" && (
              <button
                onClick={forzarBackup}
                disabled={generandoBackup}
                title="Generar un backup de la base ahora, sin esperar la corrida automática de cada 12 horas"
                className="mb-2 shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={generandoBackup ? faSpinner : faCloudArrowUp} spin={generandoBackup} className="text-xs" />
                {generandoBackup ? "Generando…" : "Backup ahora"}
              </button>
            )}
            <a
              href="/escaneo-dropbox"
              title="Configuración del escaneo automático (intervalo, carpetas vigiladas)"
              className="mb-2 shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Configurar transición automática
            </a>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === "dropbox" && <DropboxTab onCountChange={handleCountChange} />}
            {/*
              La raíz de esta pestaña estaba fija en «/AFIP», que dejó de existir cuando el árbol se
              movió a «/WEPRODU/ARCA». Es el único lugar del front donde una ruta de Dropbox está
              escrita en el código en vez de resolverse desde la configuración de los Estados — por
              eso el resto sobrevivió a la mudanza y esta pestaña no.
            */}
            {activeTab === "afip" && <DropboxTab key="afip" fixedRoot="/WEPRODU/ARCA" rootLabel="ARCA" onCountChange={handleCountChange} />}
            {/*
              Paritarias: el espejo en Dropbox que arma `espejoDropboxParitaria`. La ruta es la misma
              constante que usa el server (`BASE_POR_DEFECTO`), pero acá va escrita porque el front no
              importa del backend; si allá se mueve el árbol, esto hay que cambiarlo a mano — igual que
              pasó con ARCA cuando «/AFIP» se convirtió en «/WEPRODU/ARCA».
            */}
            {activeTab === "paritarias" && <DropboxTab key="paritarias" fixedRoot="/WEPRODU/Paritarias" rootLabel="Paritarias" onCountChange={handleCountChange} />}
            {/*
              DDBB: los backups automáticos de la base. Los sube el scheduler del server cada 12 horas
              (`services/backupService.ts`), que es también el que borra los viejos y deja los últimos
              14. Acá no hay nada que dispare un backup: esta pestaña solo mira la carpeta, con las
              mismas acciones que las otras dos —descargar, subir, borrar—.
            */}
            {activeTab === "ddbb" && <DropboxTab key={`ddbb-${recargaDdbb}`} fixedRoot="/WEPRODU/DDBB" rootLabel="DDBB" onCountChange={handleCountChange} />}
          </div>
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
