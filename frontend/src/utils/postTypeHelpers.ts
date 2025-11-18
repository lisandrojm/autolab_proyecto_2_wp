import { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { faShareNodes, faEnvelope, faBell } from "@fortawesome/free-solid-svg-icons";

export type PostType = "social" | "email" | "push";

export interface PostTypeDisplay {
  icon: IconDefinition;
  label: string;
  colorClass: string;
}

export function getPostTypeDisplay(postType?: PostType): PostTypeDisplay {
  switch (postType) {
    case "email":
      return {
        icon: faEnvelope,
        label: "Email",
        colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      };
    case "push":
      return {
        icon: faBell,
        label: "Push App",
        colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      };
    case "social":
    default:
      return {
        icon: faShareNodes,
        label: "Redes Sociales",
        colorClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
      };
  }
}
