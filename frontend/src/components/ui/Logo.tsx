import React from "react";
import { Link } from "react-router-dom";

type LogoProps = {
  /** Tailwind size para el <h1>. Ej: "text-2xl" | "text-3xl" */
  sizeClass?: string;
  /** Clases para el contenedor <Link> (posicionamiento/hover) */
  wrapperClassName?: string;
  /** Ruta destino del logo */
  to?: string;
};

export const Logo: React.FC<LogoProps> = ({ sizeClass = "text-3xl", wrapperClassName = "flex items-center cursor-pointer hover:opacity-80 transition-opacity", to = "/users" }) => {
  const appFirstName = import.meta.env.VITE_APP_FIRST_NAME;
  const appLastName = import.meta.env.VITE_APP_LAST_NAME;

  return (
    <Link to={to} className={wrapperClassName}>
      <h1 className={`${sizeClass} font-bold text-gray-900 dark:text-white`}>
        <span className="text-primary-600 dark:text-primary-400">{appFirstName}</span>
        <span className="text-gray-900 dark:text-white">{appLastName}</span>
      </h1>
    </Link>
  );
};
