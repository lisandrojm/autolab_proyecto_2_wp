import React from "react";
import { PlanesPorProyectoTab } from "../vacations/plan/PlanesPorProyectoTab";

/** Proyecto › Equipo › Vacaciones: el plan de vacaciones de ESTE proyecto (la misma pantalla que Vacaciones › Plan por proyecto). */
export const TeamVacacionesTab: React.FC<{ projectId: string }> = ({ projectId }) => <PlanesPorProyectoTab projectIdFijo={projectId} />;
