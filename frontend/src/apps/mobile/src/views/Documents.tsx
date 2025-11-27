import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileAlt, faDownload, faFile, faAward } from "@fortawesome/free-solid-svg-icons";
import { sweetAlert } from "../utils/sweetAlert";

export default function Documents() {
  const documents = [
    {
      id: 1,
      name: "Contrato Laboral 2024",
      type: "contract" as const,
      date: "2024-01-01",
      size: "2.4 MB",
    },
    {
      id: 2,
      name: "Nómina Enero 2024",
      type: "payslip" as const,
      date: "2024-01-31",
      size: "156 KB",
    },
    {
      id: 3,
      name: "Nómina Diciembre 2023",
      type: "payslip" as const,
      date: "2023-12-31",
      size: "152 KB",
    },
    {
      id: 4,
      name: "Certificado de Empresa",
      type: "certificate" as const,
      date: "2023-11-15",
      size: "890 KB",
    },
    {
      id: 5,
      name: "Nómina Noviembre 2023",
      type: "payslip" as const,
      date: "2023-11-30",
      size: "148 KB",
    },
  ];

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case "contract":
        return <FontAwesomeIcon icon={faFileAlt} className="w-6 h-6 text-blue-600 dark:text-blue-400" />;
      case "payslip":
        return <FontAwesomeIcon icon={faFile} className="w-6 h-6 text-green-600 dark:text-green-400" />;
      case "certificate":
        return <FontAwesomeIcon icon={faAward} className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />;
      default:
        return <FontAwesomeIcon icon={faFile} className="w-6 h-6 text-slate-600 dark:text-slate-400" />;
    }
  };

  const getDocumentType = (type: string) => {
    switch (type) {
      case "contract":
        return "Contrato";
      case "payslip":
        return "Nómina";
      case "certificate":
        return "Certificado";
      default:
        return "Documento";
    }
  };

  const getDocumentBg = (type: string) => {
    switch (type) {
      case "contract":
        return "bg-blue-100 dark:bg-blue-900/50";
      case "payslip":
        return "bg-green-100 dark:bg-green-900/50";
      case "certificate":
        return "bg-cyan-100 dark:bg-cyan-900/50";
      default:
        return "bg-slate-100 dark:bg-slate-800";
    }
  };

  const handleDownload = async (documentName: string) => {
    await sweetAlert.info("Descargando...", `Iniciando descarga de ${documentName}`);
  };

  const documentTypes = [
    { label: "Todos", value: "all", count: documents.length },
    { label: "Contratos", value: "contract", count: documents.filter((d) => d.type === "contract").length },
    { label: "Nóminas", value: "payslip", count: documents.filter((d) => d.type === "payslip").length },
    {
      label: "Certificados",
      value: "certificate",
      count: documents.filter((d) => d.type === "certificate").length,
    },
  ];

  return (
    <div className="flex-1 pb-24">
      <div className="px-4 pt-6">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-6">Mis Documentos</h1>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {documentTypes.map((type) => (
            <button key={type.value} className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.98]">
              <div className="text-2xl font-bold text-primary">{type.count}</div>
              <div className="text-sm font-medium text-slate-700 dark:text-slate-300">{type.label}</div>
            </button>
          ))}
        </div>

        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-4">Documentos Recientes</h3>

        <div className="space-y-3">
          {documents.map((doc) => (
            <div key={doc.id} className="bg-white dark:bg-slate-900/70 rounded-xl p-4 shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${getDocumentBg(doc.type)}`}>{getDocumentIcon(doc.type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 dark:text-slate-100 mb-1 truncate">{doc.name}</p>
                  <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span>{getDocumentType(doc.type)}</span>
                    <span>•</span>
                    <span>{doc.size}</span>
                  </div>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {new Date(doc.date).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </p>
                </div>
                <button onClick={() => handleDownload(doc.name)} className="flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <FontAwesomeIcon icon={faDownload} className="w-5 h-5 text-primary" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
