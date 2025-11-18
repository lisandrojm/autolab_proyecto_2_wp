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
