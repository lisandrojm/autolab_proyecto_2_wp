import React from 'react';
import { Link, LinkProps } from 'react-router-dom';
import { usePuedeAbrir } from '../hooks/usePuedeAbrir';

/**
 * Un `Link` que sólo es link si quien mira puede abrir el destino (`config/accesoRutas.ts`). Si no,
 * deja el texto sin enlace (`sinPermiso="texto"`, para links dentro de una explicación) o no dibuja
 * nada (`sinPermiso="ocultar"`, el default, para botones).
 */
export const LinkSiPuede: React.FC<LinkProps & { sinPermiso?: 'ocultar' | 'texto' }> = ({ sinPermiso = 'ocultar', ...props }) => {
  const puedeAbrir = usePuedeAbrir();
  const destino = typeof props.to === 'string' ? props.to : props.to.pathname || '';
  if (puedeAbrir(destino)) return <Link {...props} />;
  return sinPermiso === 'texto' ? <span>{props.children}</span> : null;
};
