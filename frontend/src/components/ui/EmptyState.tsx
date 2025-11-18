import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/fontawesome-svg-core";

interface EmptyStateProps {
  icon: IconDefinition;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: IconDefinition;
  };
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => {
  return (
    <div className="flex justify-center items-center flex-col py-12">
      <FontAwesomeIcon icon={icon} className="h-12 w-12 text-gray-400 mx-auto mb-4" />
      <div className="inline-block w-fit px-2 py-1 text-lg font-medium text-gray-900 dark:text-white mb-2">{title}</div>
      <div>
        <p className="dark:text-gray-400 mb-6">{description}</p>
      </div>
      <div>
        {action && (
          <button onClick={action.onClick} className="btn-primary flex items-center justify-center text-md">
            {action.icon && <FontAwesomeIcon icon={action.icon} className="h-4 w-4 mr-2" />}
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
};
