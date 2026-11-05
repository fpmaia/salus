import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const consulta = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function assinar(aoMudar: () => void) {
  const mql = window.matchMedia(consulta);
  mql.addEventListener("change", aoMudar);
  return () => mql.removeEventListener("change", aoMudar);
}

/** Tela de celular (< 768px). No servidor, false. */
export function useIsMobile() {
  return React.useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
