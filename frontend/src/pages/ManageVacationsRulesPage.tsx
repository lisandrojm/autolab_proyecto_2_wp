import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { faGear } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { GlobalVacationConfigTab } from "../components/vacations/GlobalVacationConfigTab";
import { VacationOverlapRules } from "../components/vacations/VacationOverlapRules";

const HELP_KEY = "vacationsRules" as const;

export function ManageVacationsRulesPage() {
  const navigate = useNavigate();
  const helpEntry = getHelp(HELP_KEY);
  const [openInfo, setOpenInfo] = useState(false);
  const [activeTab, setActiveTab] = useState<"global" | "overlap">("global");

  return (
    <PageLayout
      title="Vacaciones | Configuración"
      faIcon={{ icon: faGear }}
      onBack={() => navigate("/hr/vacations")}
      infoModal={{
        isOpen: openInfo,
        onOpen: () => setOpenInfo(true),
        onClose: () => setOpenInfo(false),
        title: helpEntry.title,
        size: helpEntry.size,
        content: helpEntry.content,
      }}
      shouldShowInfo={hasHelp(HELP_KEY)}
    >
      <div className="mx-auto">
        {/* Tabs Header */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6">
          <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "global" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("global")}>
            Configuración Global
          </button>
          <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "overlap" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("overlap")}>
            Solapamiento
          </button>
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in duration-300">
          {activeTab === "global" && <GlobalVacationConfigTab />}
          {activeTab === "overlap" && <VacationOverlapRules />}
        </div>
      </div>
    </PageLayout>
  );
}
