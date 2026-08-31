import { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { DropboxTab } from "../components/documents/DropboxTab";
import { getHelp, hasHelp } from "../data/help/helpContent";

type TabKey = "dropbox" | "afip";

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("dropbox");
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);
  const [showInfo, setShowInfo] = useState(false);
  const helpEntry = getHelp("documents");

  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);

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
                HelloSign
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "afip" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("afip")}>
                <FontAwesomeIcon icon={faLandmark} className="text-xs" />
                ARCA
              </button>
            </div>
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
          </div>
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
