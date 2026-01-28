import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGear, faFilePdf } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { VacationConfigTab } from "../components/vacations/VacationConfigTab";
import { VacationOverlapRules } from "../components/vacations/VacationOverlapRules";

import { ProjectVacationConfigTab } from "../components/vacations/ProjectVacationConfigTab";
import { ConsecutiveDaysConfigTab } from "../components/vacations/ConsecutiveDaysConfigTab";
import { UserVacationConfigTab } from "../components/vacations/UserVacationConfigTab";

import { ContractConfigTab } from "../components/vacations/ContractConfigTab";

const HELP_KEY = "vacationsRules" as const;

export function VacationsRulesPage() {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);
  const [openInfo, setOpenInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<"global" | "overlap" | "projects" | "consecutive_days" | "users" | "contracts">("global");

  return (
    <PageLayout
      title="Vacaciones | Configuración"
      faIcon={{ icon: faGear }}
      onBack={() => navigate("/vacations")}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
      searchAndFilters={
        <div className="mx-auto">
          {/* Tabs Header */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6 sticky top-[140px] z-20 bg-white dark:bg-gray-900 overflow-x-auto">
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "global" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("global")}>
              Configuración Global
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "projects" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("projects")}>
              Fraccionamiento
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "consecutive_days" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("consecutive_days")}>
              Días Corridos
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "overlap" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("overlap")}>
              Solapamiento
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "users" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("users")}>
              Usuarios (Días Extra)
            </button>
            <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === "contracts" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("contracts")}>
              Vacaciones por tipo de Contrato
            </button>
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === "global" && <VacationConfigTab />}
            {activeTab === "projects" && <ProjectVacationConfigTab />}
            {activeTab === "consecutive_days" && <ConsecutiveDaysConfigTab />}
            {activeTab === "overlap" && <VacationOverlapRules />}
            {activeTab === "users" && <UserVacationConfigTab />}
            {activeTab === "contracts" && <ContractConfigTab />}
          </div>
        </div>
      }
      //headerActions={}
      headerActions={
        <div>
          <button onClick={() => navigate("/pdfs")} className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
            <FontAwesomeIcon icon={faFilePdf} />
            <span className="hidden lg:block">Plantillas PDF</span>
          </button>
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
