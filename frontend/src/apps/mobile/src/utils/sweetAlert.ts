import Swal from "sweetalert2";

export const sweetAlert = {
  success: (title: string, text?: string) => {
    return Swal.fire({
      icon: "success",
      title,
      text,
      timer: 2500,
      showConfirmButton: false,
      toast: true,
      position: "top",
      timerProgressBar: true,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  },

  error: (title: string, text?: string, confirmButtonText = "Entendido") => {
    return Swal.fire({
      icon: "error",
      title,
      text,
      confirmButtonText,
      confirmButtonColor: "#3b82f6",
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
    });
  },

  alert: (title: string, text: string, icon: "warning" | "info" = "warning", confirmButtonText = "Entendido") => {
    return Swal.fire({
      icon,
      title,
      text,
      confirmButtonText,
      confirmButtonColor: "#3b82f6",
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
    });
  },

  confirm: (title: string, text: string, confirmText = "Confirmar", cancelText = "Cancelar") => {
    return Swal.fire({
      title,
      text,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#6b7280",
      confirmButtonText: confirmText,
      cancelButtonText: cancelText,
      reverseButtons: true,
      focusCancel: true,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
    });
  },

  info: (title: string, text: string, timer = 2000) => {
    return Swal.fire({
      icon: "info",
      title,
      text,
      timer,
      showConfirmButton: false,
      toast: true,
      position: "top",
      timerProgressBar: true,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
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
      position: "top",
      timerProgressBar: true,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
      },
    });
  },

  /**
   * Un aviso que NO se va solo: para cuando lo que se dice hay que leerlo, no alcanza con verlo pasar.
   *
   * Los `success`/`warning` de arriba son toasts de 2-3 segundos, bien para "listo" y mal para
   * explicar algo: con un link de registro el mensaje incluye qué es, cuánto dura y qué hacer con él, y
   * en 3 segundos no se llega a leer. Acá hay que tocar un botón para cerrarlo, y tocar afuera no lo
   * cierra —con un dedo en el celular es muy fácil hacerlo sin querer—.
   *
   * `onDeny` es un segundo botón que hace algo SIN cerrar el aviso (por ejemplo, volver a copiar):
   * devuelve si salió bien, y el botón lo dice por un momento.
   */
  persistente: (opts: { icon: "success" | "warning" | "info"; title: string; html: string; confirmButtonText?: string; denyButtonText?: string; onDeny?: () => Promise<boolean> | boolean }) => {
    return Swal.fire({
      icon: opts.icon,
      title: opts.title,
      html: opts.html,
      confirmButtonText: opts.confirmButtonText || "Entendido",
      confirmButtonColor: "#3b82f6",
      showDenyButton: !!opts.onDeny,
      denyButtonText: opts.denyButtonText,
      denyButtonColor: "#64748b",
      allowOutsideClick: false,
      preDeny: opts.onDeny
        ? async () => {
            const ok = await opts.onDeny!();
            const boton = Swal.getDenyButton();
            if (boton) {
              const original = opts.denyButtonText || "";
              boton.textContent = ok ? "¡Copiado!" : "No se pudo";
              setTimeout(() => {
                boton.textContent = original;
              }, 1500);
            }
            return false; // no cierra el aviso
          }
        : undefined,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
    });
  },

  loading: (title: string, text?: string) => {
    return Swal.fire({
      title,
      text,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
      didOpen: () => {
        Swal.showLoading();
      },
    });
  },

  close: () => {
    Swal.close();
  },

  confirmOrder: (informacion: string) => {
    return Swal.fire({
      title: "Confirmación del Pedido",
      html: informacion.replace(/\n/g, "<br>"),
      icon: "info",
      showCancelButton: true,
      confirmButtonColor: "#3b82f6",
      cancelButtonColor: "#6b7280",
      confirmButtonText: "Aceptar",
      cancelButtonText: "Cancelar",
      reverseButtons: true,
      customClass: {
        popup: "mobile-swal-popup",
        title: "mobile-swal-title",
      },
    });
  },
};
