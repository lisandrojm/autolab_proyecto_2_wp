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
    /** `html` es para cuando el texto necesita un enlace — con `text` el link se ve como texto pelado y no se puede clickear. */
    opts: { text?: string; html?: string; valorInicial?: string; placeholder?: string; confirmText?: string; cancelText?: string; validar?: (valor: string) => string | null; /** Para textos largos (un motivo, una observación): una línea los recorta a la vista. */ multilinea?: boolean; /** Qué decir si lo dejan vacío; por defecto pide un nombre, que es el uso original. */ mensajeVacio?: string } = {},
  ) => {
    return Swal.fire({
      title,
      text: opts.html ? undefined : opts.text,
      html: opts.html,
      icon: "question",
      input: opts.multilinea ? "textarea" : "text",
      inputValue: opts.valorInicial ?? "",
      inputPlaceholder: opts.placeholder,
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#6b7280",
      confirmButtonText: opts.confirmText || "Guardar",
      cancelButtonText: opts.cancelText || "Cancelar",
      reverseButtons: true,
      inputValidator: (valor: string) => {
        const v = String(valor || "").trim();
        if (!v) return opts.mensajeVacio || "Escribí un nombre.";
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

  /**
   * Aviso corto de que un filtro cambió.
   *
   * Los filtros de "Filtros Avanzados" se aplican solos al tocarlos —no hay que confirmar—, y eso
   * hace que sea fácil mover uno sin registrar qué quedó puesto. El toast dice exactamente qué valor
   * tomó, y se va solo.
   */
  filtro: (texto: string, icono: "success" | "info" = "success") => {
    return Swal.fire({
      icon: icono,
      title: texto,
      // Mismo formato que `success`: toast arriba a la derecha, con barra de progreso y pausa al pasar
      // el mouse. Solo cambia el tiempo —un filtro se toca en serie y 2s se encimaban entre sí.
      toast: true,
      position: "top-end",
      showConfirmButton: false,
      timer: 1600,
      timerProgressBar: true,
      didOpen: (t) => {
        t.addEventListener("mouseenter", Swal.stopTimer);
        t.addEventListener("mouseleave", Swal.resumeTimer);
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
  /**
   * Bloqueante y a propósito: se usa para lo que TARDA y no muestra nada mientras tanto.
   *
   * El caso son los PDF, que se arman con un navegador headless del lado del server: entre que se
   * hace click y que abre la pestaña pasan varios segundos sin ninguna señal, y lo que pasa es que
   * la gente vuelve a hacer click. Sin `allowOutsideClick` se puede cerrar sin querer y se pierde el
   * aviso justo cuando hace falta.
   *
   * SIEMPRE cerrar con `sweetAlert.close()` en un `finally`: si la promesa falla y nadie lo cierra,
   * la pantalla queda tapada por un spinner que no termina nunca.
   */
  loading: (title: string, text?: string) => {
    return Swal.fire({
      title,
      text,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });
  },

  /** Cierra el aviso abierto (el de `loading`). Existe para no tener que importar Swal en cada página. */
  close: () => Swal.close(),
};
