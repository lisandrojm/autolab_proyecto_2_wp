import { useEffect, useRef } from "react";

/*
  VOLVER A PREGUNTAR CUANDO LA APP ESTÁ A LA VISTA.

  Los números de las tarjetas y de la campanita se pedían UNA vez, al abrir la app. En un teléfono eso
  es casi siempre «una vez y nunca más»: la app queda abierta en segundo plano días enteros, así que
  un rechazo, una aprobación o un contrato por vencer aparecían recién cuando alguien la cerraba y la
  volvía a abrir —y el aviso llegaba tarde o no llegaba—.

  Refresca al volver a primer plano, que es cuando la persona va a mirar, y cada tanto mientras la
  pantalla está encendida. En segundo plano no pide nada: sería gastar batería y datos por un número
  que nadie está viendo.

  `refrescar` se guarda en una ref para que una función nueva en cada render no reinstale los
  listeners ni reinicie el intervalo en cada pasada.
*/
export const useRefrescoEnFoco = (refrescar: () => void, intervaloMs = 60_000) => {
  const ultima = useRef(refrescar);
  ultima.current = refrescar;

  useEffect(() => {
    const aLaVista = () => typeof document === "undefined" || document.visibilityState === "visible";
    const refrescarSiSeVe = () => {
      if (aLaVista()) ultima.current();
    };

    document.addEventListener("visibilitychange", refrescarSiSeVe);
    window.addEventListener("focus", refrescarSiSeVe);
    const intervalo = window.setInterval(refrescarSiSeVe, intervaloMs);

    return () => {
      document.removeEventListener("visibilitychange", refrescarSiSeVe);
      window.removeEventListener("focus", refrescarSiSeVe);
      window.clearInterval(intervalo);
    };
  }, [intervaloMs]);
};
