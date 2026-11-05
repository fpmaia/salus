// Script do tema, rodado no <head> antes da página aparecer (com o nonce da CSP).

export type Tema = "light" | "dark" | "system";
export const CHAVE_TEMA = "salus-tema";

export const SCRIPT_TEMA = `(function(){try{var t=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d)e.classList.add("dark");e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;
