import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLandmark, faFileSignature, faIdCard, faHourglassHalf, faUserPlus, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { faDropbox } from "@fortawesome/free-brands-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { DropboxTab } from "../components/documents/DropboxTab";
import { AntiguedadArcaTab } from "../components/arca/AntiguedadArcaTab";
import { AuditoriaArcaTab } from "../components/arca/AuditoriaArcaTab";
import { arcaRelacionesAPI } from "../api/arcaRelaciones";
import { getHelp, hasHelp } from "../data/help/helpContent";
import { usePuedeAbrir } from "../hooks/usePuedeAbrir";

type TabKey = "dropbox" | "afip" | "paritarias" | "registros" | "solicitudes" | "antiguedad" | "auditoria";

export function DocumentsPage() {
  const puedeAbrir = usePuedeAbrir();
  // `?carpeta=…&buscar=…`: el «ver documento» del Registro de ARCA abre la carpeta donde está HOY la constancia, filtrada por su código.
  const [params] = useSearchParams();
  const carpetaInicial = params.get("carpeta") || undefined;
  const busquedaInicial = params.get("buscar") || undefined;
  // `?tab=antiguedad`: el link de Vacaciones › Gestión por Usuario (modal de antigüedad) abre directo en Antigüedad ARCA.
  const tabInicial = params.get("tab");
  const [activeTab, setActiveTab] = useState<TabKey>(tabInicial === "antiguedad" || tabInicial === "auditoria" ? tabInicial : carpetaInicial?.startsWith("/WEPRODU/ARCA") ? "afip" : "dropbox");
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);
  const [showInfo, setShowInfo] = useState(false);
  const helpEntry = getHelp("documents");
  // El contador de «Auditoría ARCA» (etapa 5): los totales guardados, sin recalcular nada.
  const [auditoriaTotal, setAuditoriaTotal] = useState<number | null>(null);
  useEffect(() => {
    arcaRelacionesAPI.auditoriaResumen().then((r) => setAuditoriaTotal(r.totales?.total ?? null)).catch(() => {});
  }, []);

  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);
  const handleAuditoriaCount = useCallback((count: number | undefined) => { setItemCount(count); if (count !== undefined) setAuditoriaTotal(count); }, []);

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
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "registros" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("registros")} title="Lo que ARCA contestó al registrarse cada persona: un JSON por CUIT">
                <FontAwesomeIcon icon={faIdCard} className="text-xs" />
                Registros
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "solicitudes" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("solicitudes")} title="Lo que se pidió en cada solicitud de contratación: un JSON por solicitud">
                <FontAwesomeIcon icon={faUserPlus} className="text-xs" />
                Solicitudes
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "antiguedad" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("antiguedad")} title="La antigüedad de cada persona según las relaciones laborales que ARCA tiene registradas, sincronizadas todos los días">
                <FontAwesomeIcon icon={faHourglassHalf} className="text-xs" />
                Antigüedad ARCA
              </button>
              <button className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${activeTab === "auditoria" ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"}`} onClick={() => setActiveTab("auditoria")} title="Lo que no encaja entre WeProdu y ARCA (bajas que faltan en ARCA, casos para revisar, altas con fecha distinta, discrepancias con FRAME): lo mira una persona">
                <FontAwesomeIcon icon={faTriangleExclamation} className="text-xs" />
                Auditoría ARCA
                {auditoriaTotal !== null && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${auditoriaTotal ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-200" : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"}`}>{auditoriaTotal}</span>}
              </button>
            </div>
              {puedeAbrir("/escaneo-dropbox") && (
                <a
                  href="/escaneo-dropbox"
                  title="Configuración del escaneo automático (intervalo, carpetas vigiladas)"
                  className="mb-2 shrink-0 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Configurar transición automática
                </a>
              )}
          </div>

          {/* Tab Content */}
          <div className="animate-in fade-in duration-300">
            {activeTab === "dropbox" && <DropboxTab onCountChange={handleCountChange} carpetaInicial={carpetaInicial?.startsWith("/WEPRODU/ARCA") ? undefined : carpetaInicial} busquedaInicial={busquedaInicial} />}
            {/*
              La raíz de esta pestaña estaba fija en «/AFIP», que dejó de existir cuando el árbol se
              movió a «/WEPRODU/ARCA». Es el único lugar del front donde una ruta de Dropbox está
              escrita en el código en vez de resolverse desde la configuración de los Estados — por
              eso el resto sobrevivió a la mudanza y esta pestaña no.
            */}
            {activeTab === "afip" && <DropboxTab key="afip" fixedRoot="/WEPRODU/ARCA" rootLabel="ARCA" onCountChange={handleCountChange} carpetaInicial={carpetaInicial?.startsWith("/WEPRODU/ARCA") ? carpetaInicial : undefined} busquedaInicial={busquedaInicial} />}
            {/*
              Paritarias: el espejo en Dropbox que arma `espejoDropboxParitaria`. La ruta es la misma
              constante que usa el server (`BASE_POR_DEFECTO`), pero acá va escrita porque el front no
              importa del backend; si allá se mueve el árbol, esto hay que cambiarlo a mano — igual que
              pasó con ARCA cuando «/AFIP» se convirtió en «/WEPRODU/ARCA».
            */}
            {activeTab === "paritarias" && <DropboxTab key="paritarias" fixedRoot="/WEPRODU/Paritarias" rootLabel="Paritarias" onCountChange={handleCountChange} />}
            {/*
              Registros: lo que ARCA contestó al registrarse cada persona por el link público, un .json
              por CUIT (lo escribe `espejoDropboxRegistros`, misma constante `BASE_REGISTROS`). Los .json
              se abren en pantalla desde la tabla, sin bajarlos.
            */}
            {activeTab === "registros" && <DropboxTab key="registros" fixedRoot="/WEPRODU/Registros" rootLabel="Registros" onCountChange={handleCountChange} />}
            {activeTab === "solicitudes" && <DropboxTab key="solicitudes" fixedRoot="/WEPRODU/Solicitudes" rootLabel="Solicitudes" onCountChange={handleCountChange} />}
            {/*
              Antigüedad ARCA: no es Dropbox. Es la copia local de las relaciones laborales de
              Simplificación Registral (sembrada desde los TXT de /WEPRODU/ARCA/Contratos y
              sincronizada a diario) y la antigüedad calculada sobre ella.
            */}
            {activeTab === "antiguedad" && <AntiguedadArcaTab key="antiguedad" onCountChange={handleCountChange} />}
            {activeTab === "auditoria" && <AuditoriaArcaTab key="auditoria" onCountChange={handleAuditoriaCount} />}
          </div>
        </div>
      }
      children={undefined}
    ></PageLayout>
  );
}
