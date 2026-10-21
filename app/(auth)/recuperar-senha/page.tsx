import { chaveSiteTurnstile } from "@/src/server/turnstile";
import { FormularioRecuperarSenha } from "./formulario-recuperar-senha";

export default function RecuperarSenhaPage() {
  return <FormularioRecuperarSenha chaveTurnstile={chaveSiteTurnstile()} />;
}
