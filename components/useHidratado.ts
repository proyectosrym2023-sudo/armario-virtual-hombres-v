'use client';
import { useEffect, useState } from 'react';

// true solo cuando React ya controla la página. Los formularios con datos personales o contraseñas
// desactivan su botón hasta entonces, para que un envío temprano nunca ponga datos en la URL.
export function useHidratado() {
  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  return listo;
}
