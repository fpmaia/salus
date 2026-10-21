import { demoHabilitado } from "@/src/auth/demo";
import { FormularioEntrar } from "./formulario-entrar";

export default function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  return <FormularioEntrar searchParams={searchParams} demo={demoHabilitado()} />;
}
