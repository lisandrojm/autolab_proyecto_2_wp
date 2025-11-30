import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { STATUS_CONFIG, StatusType } from "../../config/statusConfig";

interface StatusBadgeProps {
  type: StatusType | null | undefined;
  hideIcon?: boolean;
  hidePrefix?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
  overrideStyle?: boolean;
}

export function StatusBadge({
  type,
  hideIcon = false,
  hidePrefix = false,
  className = "",
  size = "md",
  overrideStyle = false,
}: StatusBadgeProps) {
  if (!type || !STATUS_CONFIG[type]) return null;

  const cfg = STATUS_CONFIG[type];

  const finalBgClass = overrideStyle ? "bg-gray-50 dark:bg-gray-600/20" : cfg.bgClass;
  const finalTextClass = overrideStyle ? "text-gray-600 dark:text-gray-400" : cfg.textClass;

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs gap-1",
    md: "px-3 py-1 text-sm gap-1.5",
    lg: "px-4 py-1.5 text-base gap-2",
  };

  const iconSizes = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-4 w-4",
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses[size]} ${finalBgClass} ${finalTextClass} ${cfg.borderClass || ""} ${className}`}
    >
      {!hideIcon && cfg.icon && (
        <FontAwesomeIcon icon={cfg.icon} className={iconSizes[size]} />
      )}
      {!hidePrefix && cfg.prefix && <span>{cfg.prefix}</span>}
      <span>{cfg.label}</span>
    </span>
  );
}
