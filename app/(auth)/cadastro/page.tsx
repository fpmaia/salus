import { chaveSiteTurnstile } from "@/src/server/turnstile";
import { FormularioCadastro } from "./formulario-cadastro";

export default function CadastroPage({ searchParams }: PageProps<"/cadastro">) {
  return <FormularioCadastro searchParams={searchParams} chaveTurnstile={chaveSiteTurnstile()} />;
}
