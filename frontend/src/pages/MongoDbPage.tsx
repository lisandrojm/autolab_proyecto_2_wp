import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { faDatabase } from "@fortawesome/free-solid-svg-icons";
import { PageLayout } from "../components/ui/PageLayout";
import { MongoDbConfig } from "../components/documents/MongoDbConfig";

/**
 * Configuración → DDBB → MongoDB.
 *
 * La copia automática de la base: cada cuánto se hace, cuántas se guardan y cómo se importa una a
 * Atlas. Las copias en sí se miran en Documentos → DDBB, que es donde vive la carpeta; de acá se sale
 * hacia allá con la flecha.
 */
export const MongoDbPage: React.FC = () => {
  const navigate = useNavigate();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <PageLayout
      title="MongoDB"
      subtitle="Copia automática de la base de datos y cómo restaurarla"
      faIcon={{ icon: faDatabase }}
      onBack={() => navigate("/documents")}
      shouldShowInfo={false}
      infoModal={{ isOpen: showInfo, onOpen: () => setShowInfo(true), onClose: () => setShowInfo(false), title: "MongoDB", content: null }}
    >
      <MongoDbConfig />
    </PageLayout>
  );
};

export default MongoDbPage;
