import React from "react";

interface LoadingSpinnerProps {
  message?: string;
  size?: "xs" | "sm" | "md" | "lg";
  naked?: boolean;
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message = "Cargando...", size = "md", naked = false, className = "" }) => {
  const getSizeClasses = () => {
    switch (size) {
      case "xs":
        return "h-4 w-4";
      case "sm":
        return "h-6 w-6";
      case "lg":
        return "h-16 w-16";
      default:
        return "h-12 w-12";
    }
  };

  const spinner = (
    <svg className={`animate-spin ${getSizeClasses()} ${className || (naked ? "" : "text-blue-600 dark:text-blue-400")}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  if (naked) return spinner;

  return (
    <div className="min-h-[200px] w-full flex flex-col items-center justify-center p-8">
      {spinner}
      {message && <p className="mt-4 text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">{message}</p>}
    </div>
  );
};
