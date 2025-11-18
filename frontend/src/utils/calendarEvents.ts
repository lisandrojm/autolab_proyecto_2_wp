import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faShareNodes, faEnvelope, faBell } from "@fortawesome/free-solid-svg-icons";
import { PostType } from "../types/post";

export type EventType = PostType;

export interface EventTypeConfig {
  icon: IconDefinition;
  label: string;
  bgColor: string;
  description: string;
}

export const eventTypeConfig: Record<EventType, EventTypeConfig> = {
  social: {
    icon: faShareNodes,
    label: "Redes Sociales",
    bgColor: "#3b82f6",
    description: "Publicación en redes sociales",
  },
  email: {
    icon: faEnvelope,
    label: "Email",
    bgColor: "#10b981",
    description: "Campaña de email marketing",
  },
  push: {
    icon: faBell,
    label: "Push App",
    bgColor: "#f59e0b",
    description: "Notificación push para aplicación móvil",
  },
};

export const getEventTypeConfig = (type: EventType): EventTypeConfig => {
  return eventTypeConfig[type];
};

export const formatEventTitle = (type: EventType, title: string): string => {
  return title;
};

export const getAvailableEventTypes = (): EventType[] => {
  return Object.keys(eventTypeConfig) as EventType[];
};

export const isEventTypeEnabled = (type: EventType): boolean => {
  return true;
};
