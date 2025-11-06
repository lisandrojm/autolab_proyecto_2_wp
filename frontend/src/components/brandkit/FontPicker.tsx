import React, { useState, useRef, useEffect, useMemo } from "react";
import { buildGoogleFontsUrl } from "../../utils/buildGoogleFontsUrl";
import googleFontsData from "../../data/google-fonts.json";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTimes, faSearch } from "@fortawesome/free-solid-svg-icons";

interface GoogleFont {
  family: string;
  category?: string;
}

export interface FontPickerProps {
  value: string[];
  onChange: (families: string[]) => void;
  label?: string;
  placeholder?: string;
  maxVisibleChips?: number;
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase().trim() : "";
}
function isFont(x: any): x is GoogleFont {
  return x && typeof x.family === "string" && x.family.length > 0;
}

export const FontPicker: React.FC<FontPickerProps> = ({ value = [], onChange, label = "Fuentes de marca (Google Fonts)", placeholder = "Buscar fuente…", maxVisibleChips = 6 }) => {
  const [inputValue, setInputValue] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Dataset defensivo
  const fonts: GoogleFont[] = useMemo(() => (Array.isArray(googleFontsData) ? (googleFontsData as unknown[]).filter(isFont) : []), []);

  // Filtrado defensivo
  const filteredFonts = useMemo(() => {
    const q = norm(inputValue);
    if (!q) return fonts;
    return fonts.filter((f) => norm(f.family).includes(q));
  }, [fonts, inputValue]);

  // Evitá sugerir ya seleccionadas
  const availableFonts = useMemo(() => filteredFonts.filter((f) => !value.some((v) => norm(v) === norm(f.family))), [filteredFonts, value]);

  // Inyecta link de preview (sin flicker)
  useEffect(() => {
    if (!value?.length) return;
    const href = buildGoogleFontsUrl(value) || "";
    if (!href) return;
    const linkId = "font-picker-preview-link";
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [value]);

  // Cierra dropdown al click afuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
        setFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addFont = (familyRaw: string) => {
    const trimmed = (familyRaw || "").trim().replace(/["']/g, "");
    if (!trimmed) return;
    if (value.some((v) => norm(v) === norm(trimmed))) return;
    onChange([...value, trimmed]);
    setInputValue("");
    setFocusedIndex(-1);
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  const removeFont = (family: string) => {
    onChange(value.filter((f) => f !== family));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setShowSuggestions(true);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (focusedIndex >= 0 && focusedIndex < availableFonts.length) {
        addFont(availableFonts[focusedIndex].family);
      } else if (norm(inputValue) && availableFonts.length > 0) {
        addFont(availableFonts[0].family);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.min(prev + 1, availableFonts.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setFocusedIndex(-1);
      (e.currentTarget as HTMLInputElement).blur();
    }
  };

  const visibleFonts = value.slice(0, maxVisibleChips);
  const hiddenCount = Math.max(0, value.length - visibleFonts.length);

  return (
    <div className="space-y-2">
      {label && <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>}

      {/* CONTENEDOR RAÍZ (relative) */}
      <div ref={containerRef} className="relative border border-gray-300 dark:border-gray-600 rounded-lg p-3">
        {/* === CHIPS ARRIBA === */}
        {value.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {visibleFonts.map((family) => (
              <div key={`chip-${family}`} className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-700 rounded-lg" style={{ fontFamily: `"${family}", sans-serif` }} title={family}>
                <span className="text-sm font-medium text-primary-700 dark:text-primary-300 max-w-[160px] truncate">{family}</span>
                <button type="button" onClick={() => removeFont(family)} className="text-primary-600 hover:text-primary-800 dark:text-primary-400 dark:hover:text-primary-200 transition-colors" aria-label={`Eliminar ${family}`}>
                  <FontAwesomeIcon icon={faTimes} className="h-3 w-3" />
                </button>
              </div>
            ))}
            {hiddenCount > 0 && (
              <div className="inline-flex items-center px-3 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg">
                <span className="text-sm text-gray-600 dark:text-gray-400">+{hiddenCount} más</span>
              </div>
            )}
          </div>
        )}

        {/* === INPUT ABAJO === */}
        <div className="relative">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(true);
              setFocusedIndex(-1);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="input-field pl-10"
            aria-label={label}
            aria-autocomplete="list"
            aria-expanded={showSuggestions}
            aria-controls="font-suggestions"
          />

          {/* Dropdown */}
          {showSuggestions && availableFonts.length > 0 && (
            <div id="font-suggestions" role="listbox" className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {availableFonts.slice(0, 50).map((font, index) => (
                <button key={`sugg-${font.family}-${index}`} type="button" role="option" aria-selected={index === focusedIndex} onClick={() => addFont(font.family)} onMouseEnter={() => setFocusedIndex(index)} onMouseDown={(e) => e.preventDefault()} className={`w-full text-left px-4 py-2.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${index === focusedIndex ? "bg-gray-100 dark:bg-gray-700" : ""}`} style={{ fontFamily: `"${font.family}", ${font.category || "sans-serif"}` }} title={font.family}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{font.family}</span>
                    {font.category && <span className="text-xs text-gray-500 dark:text-gray-400">{font.category}</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
