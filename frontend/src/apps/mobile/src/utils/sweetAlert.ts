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
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
      },
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
      confirmButtonText: "Entendido",
      confirmButtonColor: "#3b82f6",
      customClass: {
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
      },
    });
  },

  confirm: (
    title: string,
    text: string,
    confirmText = "Confirmar",
    cancelText = "Cancelar"
  ) => {
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
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
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
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
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
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
      },
      didOpen: (toast) => {
        toast.addEventListener("mouseenter", Swal.stopTimer);
        toast.addEventListener("mouseleave", Swal.resumeTimer);
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
        popup: 'mobile-swal-popup',
        title: 'mobile-swal-title',
      },
      didOpen: () => {
        Swal.showLoading();
      },
    });
  },

  close: () => {
    Swal.close();
  },
};
