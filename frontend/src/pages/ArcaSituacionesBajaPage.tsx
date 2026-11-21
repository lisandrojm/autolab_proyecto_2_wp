import React from "react";
import { faUserMinus } from "@fortawesome/free-solid-svg-icons";
import { encabezadoDeAmbito } from "../config/nomencladoresArca";
import { SimpleCatalogManager } from "../components/catalog/SimpleCatalogManager";
import { createSimpleCatalogApi } from "../api/simpleCatalog";

const api = createSimpleCatalogApi("/arca/situaciones-baja");

/**
 * Situaciones de baja de ARCA: el «motivo de la baja» que pide Relaciones Laborales → Modificaciones y Bajas →
 * Registrar baja. El código se guarda tal cual lo publica ARCA (sin ceros agregados: «0», «7», «21», «99»), porque
 * así viaja en el formulario. La tabla se siembra desde la pantalla relevada (`npm run arca:situaciones-baja`).
 */
export const ArcaSituacionesBajaPage: React.FC = () => (
  <SimpleCatalogManager
    title="Situaciones de Baja"
    {...encabezadoDeAmbito("situaciones-revista")}
    icon={faUserMinus}
    entityLabel="situación de baja"
    api={api}
    templateBaseName="arca_situaciones_baja"
    externalIdLabel="Código"
    externalIdPlaceholder="Ej: 21"
    formatExternalId={(raw) => raw.replace(/\D/g, "")}
    sanitizeExternalId={(v) => v.replace(/\D/g, "")}
  />
);
