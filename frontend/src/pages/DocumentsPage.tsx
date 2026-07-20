import { useCallback, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileText } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { DropboxTab } from "../components/documents/DropboxTab";

export function DocumentsPage() {
  const [activeTab, setActiveTab] = useState<"dropbox">("dropbox");
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);

  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);

  return (
    <PageLayout
      title="Documentos RRHH"
      faIcon={{ icon: faFileText }}
      itemCount={itemCount}
      shouldShowInfo={false}
      searchAndFilters={
        <div className="mx-auto">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "dropbox" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("dropbox")}>
              <FontAwesomeIcon icon={faDropbox} className="text-xs" />
              Dropbox
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === "dropbox" && <DropboxTab onCountChange={handleCountChange} />}
          </div>
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
