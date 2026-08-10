import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileSignature, faArrowUpRightFromSquare, faSpinner, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { DropboxTab } from "../components/documents/DropboxTab";
import { firmaDigitalAPI } from "../api/firmaDigital";
import { dropboxAPI } from "../api/dropbox";

/**
 * "Dropbox | Firmas": todo lo que ya se envió a firmar y está esperando la firma del destinatario,
 * o sea el contenido de la carpeta "Pendbox" de Dropbox.
 *
 * Es la misma carpeta que alimenta la bandeja "Enviado a la firma" de Gestión de Contratos, pero
 * acá se ve como explorador (con descarga, filtro y navegación), más el acceso directo a la carpeta
 * en Dropbox para quien prefiera trabajar allá.
 */
export function FirmasPendientesPage() {
  const [carpeta, setCarpeta] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [itemCount, setItemCount] = useState<number | undefined>(undefined);

  const handleCountChange = useCallback((count: number | undefined) => setItemCount(count), []);

  useEffect(() => {
    (async () => {
      try {
        const [cfg, status] = await Promise.all([firmaDigitalAPI.config(), dropboxAPI.status().catch(() => null)]);
        setCarpeta(cfg?.pendienteFirmaCarpeta || null);
        setRootPath(status?.rootPath || "");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Link a la carpeta en Dropbox: /home + el path completo abre esa carpeta en la cuenta conectada.
  const linkDropbox = carpeta ? `https://www.dropbox.com/home${carpeta.split("/").map(encodeURIComponent).join("/")}` : null;

  return (
    <PageLayout
      title="Dropbox | Firmas"
      subtitle="Contratos que ya se enviaron a firmar y esperan la firma del destinatario"
      faIcon={{ icon: faFileSignature }}
      itemCount={itemCount}
      shouldShowInfo={false}
      searchAndFilters={
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Carpeta <span className="font-mono">{carpeta || "Pendbox"}</span> de Dropbox. Los archivos llegan acá al detectarse el envío a firmar, y salen solos cuando vuelven firmados.
          </p>
          {linkDropbox && (
            <a
              href={linkDropbox}
              target="_blank"
              rel="noopener noreferrer"
              title="Abrir la carpeta Pendbox en Dropbox"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shrink-0 whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
              Abrir Pendbox en Dropbox
            </a>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center py-16 text-gray-400">
          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Cargando...
        </div>
      ) : !carpeta ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 px-4 text-center">
          <FontAwesomeIcon icon={faTriangleExclamation} className="h-8 w-8 text-amber-500" />
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">No se encontró la carpeta "Pendbox"</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md">
            Hay que crearla en Dropbox con ese nombre exacto, como hermana de "Outbox" dentro de la estructura de Dropbox Sign{rootPath ? ` (${rootPath})` : ""}.
          </p>
        </div>
      ) : (
        <DropboxTab onCountChange={handleCountChange} fixedRoot={carpeta} rootLabel="Pendbox" />
      )}
    </PageLayout>
  );
}

export default FirmasPendientesPage;
