// components/ButtonLink.tsx
import React from "react";
import { Link } from "react-router-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight } from "@fortawesome/free-solid-svg-icons";

type ButtonVariant = "light" | "dark";

interface ButtonLinkProps {
  text: string;
  to?: string;
  variant?: ButtonVariant; // "light" => blanco, "dark" => tierra-900
  className?: string; // por si querés sumar clases extra
}

export const ButtonLink: React.FC<ButtonLinkProps> = ({ text, to = "/nosotros", variant = "light", className = "" }) => {
  const colorClasses = variant === "light" ? "text-white hover:text-white/80" : "text-tierra-900 hover:text-tierra-700";

  return (
    <div className={className}>
      <Link to={to} className={`inline-flex items-center gap-2 text-lg transition-colors ${colorClasses}`}>
        <FontAwesomeIcon icon={faChevronRight} className="text-sm" />
        <span className="font-rock underline decoration-dotted underline-offset-8">{text}</span>
      </Link>
    </div>
  );
};
