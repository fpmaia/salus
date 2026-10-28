"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen } from "lucide-react";

// Cada tela do painel abre o manual direto na seção que fala dela.
const SECAO_POR_ROTA: [prefixo: string, secao: string][] = [
  ["/painel/agenda", "agenda"],
  ["/painel/atendimentos", "consultas-do-dia"],
  ["/painel/pacientes", "pacientes"],
  ["/painel/espera", "lista-espera"],
  ["/painel/prontuario", "prontuario"],
  ["/painel/agendamento-online", "agenda-online"],
  ["/painel/financeiro", "financeiro"],
  ["/painel/extrato", "meu-extrato"],
  ["/painel/contratos", "contratos"],
  ["/painel/fiscal", "notas-fiscais"],
  ["/painel/unidades", "unidades-salas"],
  ["/painel/profissionais", "profissionais"],
  ["/painel/equipe", "equipe"],
  ["/painel/notificacoes", "notificacoes"],
  ["/painel/assinatura", "planos"],
  ["/painel/perfil", "seguranca"],
  ["/plataforma", "plataforma"],
  ["/painel", "comece-aqui"],
];

export function secaoDoManual(caminho: string): string {
  return SECAO_POR_ROTA.find(([prefixo]) => caminho === prefixo || caminho.startsWith(`${prefixo}/`))?.[1] ?? "comece-aqui";
}

/** Botão "Manual" do cabeçalho: abre a seção desta tela em nova aba. */
export function BotaoAjuda({ className, compacto = false }: { className?: string; compacto?: boolean }) {
  const caminho = usePathname();
  return (
    <Link
      href={`/manual#${secaoDoManual(caminho)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      title="Abrir o manual nesta tela (nova aba)"
    >
      <BookOpen className={compacto ? "size-3" : "size-3.5 text-primary"} />
      <span>{compacto ? "Manual" : "Ajuda desta tela"}</span>
    </Link>
  );
}
