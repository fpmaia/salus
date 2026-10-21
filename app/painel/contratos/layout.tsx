import { notFound } from "next/navigation";
import { contratosHabilitados } from "@/src/server/modulos";

// Módulo desligado por padrão (src/server/modulos.ts).
export default function ContratosLayout({ children }: LayoutProps<"/painel/contratos">) {
  if (!contratosHabilitados()) notFound();
  return children;
}
