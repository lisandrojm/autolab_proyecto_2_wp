// sweetAlert.ts
import Swal from "sweetalert2";
import { icon } from "@fortawesome/fontawesome-svg-core";
import { faThumbtack, faThumbtackSlash } from "@fortawesome/free-solid-svg-icons";

const svgHtml = (isFavorite: boolean) => {
  const def = isFavorite ? faThumbtack : faThumbtackSlash;
  const i = icon(def);
  const svg = i ? i.html[0] : "";
  return `
  <span style="
    display:inline-flex;
    align-items:center;
    justify-content:center;
    font-size:0.9rem;
    line-height:1;
    border:none !important;
    color:${isFavorite ? "#f59e0b" : "#6b7280"};
    transform:${isFavorite ? "rotate(45deg)" : "none"};
  ">
    ${svg}
  </span>
`;
};
export const sweetAlert = {
  success: (title: string, text?: string) => {
    return Swal.fire({
      icon: "success",
      title,
      text,
      timer: 2000,
      showConfirmButton: false,
      toast: true,
      position: "top-end",
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  },

  error: (title: string, text?: string) => {
    return Swal.fire({
      icon: "error",
      title,
      text,
    });
  },

  confirm: (title: string, text: string, confirmText = "Sí, eliminar", cancelText = "Cancelar") => {
    return Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      reverseButtons: true,
      focusCancel: true,
    });
  },

  /**
   * Pide un texto y confirma en el mismo paso — reemplazo de `window.prompt`, que no se puede
   * estilar y queda fuera del look del resto de la app.
   * `validar` devuelve el mensaje de error a mostrar, o null si el valor está bien.
   */
  prompt: (
    title: string,
    opts: { text?: string; valorInicial?: string; placeholder?: string; confirmText?: string; cancelText?: string; validar?: (valor: string) => string | null } = {},
  ) => {
    return Swal.fire({
      title,
      text: opts.text,
      icon: "question",
      input: "text",
      inputValue: opts.valorInicial ?? "",
      inputPlaceholder: opts.placeholder,
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#6b7280",
      confirmButtonText: opts.confirmText || "Guardar",
      cancelButtonText: opts.cancelText || "Cancelar",
      reverseButtons: true,
      inputValidator: (valor) => {
        const v = String(valor || "").trim();
        if (!v) return "Escribí un nombre.";
        return opts.validar ? opts.validar(v) : null;
      },
    });
  },

  info: (title: string, text: string, timer = 1800) => {
    return Swal.fire({
      icon: "info",
      title,
      text,
      timer,
      showConfirmButton: false,
    });
  },

  warning: (title: string, text?: string) => {
    return Swal.fire({
      icon: "warning",
      title,
      text,
      timer: 3000,
      showConfirmButton: false,
      toast: true,
      position: "top-end",
      timerProgressBar: true,
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  },

  warningAlert: (title: string, text: string, confirmText = "Entendido") => {
    return Swal.fire({
      title,
      text,
      icon: "warning",
      confirmButtonText: confirmText,
      confirmButtonColor: "#f59e0b",
      focusConfirm: false,
    });
  },

  favoriteToggle: (isFavorite: boolean, itemName?: string) => {
    return Swal.fire({
      toast: true,
      position: "top-end",
      iconHtml: svgHtml(isFavorite),
      title: isFavorite ? `${itemName ? itemName + " " : ""}Agregado a favoritos` : `${itemName ? itemName + " " : ""}Removido de favoritos`,
      showConfirmButton: false,
      timer: 2000,
      customClass: {
        icon: "swal2-icon-custom",
      },
    });
  },
  loading: (title: string) => {
    return Swal.fire({
      title,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  },
};
