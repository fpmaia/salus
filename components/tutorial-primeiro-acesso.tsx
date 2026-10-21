"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  DoorOpen,
  FileText,
  HelpCircle,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const CHAVE_STORAGE = "salus_tutorial_completed_v1";

interface PassoTutorial {
  titulo: string;
  subtitulo: string;
  descricao: string;
  icone: React.ComponentType<{ className?: string }>;
  destaques: string[];
  dica: string;
}

const PASSOS: PassoTutorial[] = [
  {
    titulo: "Bem-vindo ao Salus",
    subtitulo: "A plataforma definitiva para gestão de coworkings de saúde",
    descricao:
      "O Salus foi desenhado para simplificar e profissionalizar toda a rotina do seu espaço compartilhado, unindo reserva de salas, recepção de pacientes e conciliação financeira precisa.",
    icone: Sparkles,
    destaques: [
      "Multi-unidades e salas equipadas (maca, divã, consultório)",
      "Acesso seguro por papéis: Administrador, Recepção e Profissional",
      "Consentimento, auditoria e direitos do titular (LGPD) no próprio sistema",
    ],
    dica: "Este guia rápido dura menos de 1 minuto e vai te mostrar como extrair o máximo do sistema.",
  },
  {
    titulo: "Reserva de Salas & Agenda",
    subtitulo: "Elimine conflitos de horário e maximize a ocupação",
    descricao:
      "Nossa tecnologia impede automaticamente que duas reservas sobrepostas ocorram na mesma sala. Profissionais podem agendar horas avulsas ou turnos recorrentes semanais.",
    icone: DoorOpen,
    destaques: [
      "Visualização clara em grade diária ou semanal",
      "Filtro inteligente por unidade e recursos da sala",
      "Bloqueio automático contra sobreposições no banco de dados",
    ],
    dica: "Você pode reservar salas diretamente no menu 'Agenda de salas'.",
  },
  {
    titulo: "Pacientes & Recepção",
    subtitulo: "Fluxo ágil de acolhimento e confirmação",
    descricao:
      "Cadastre pacientes com dados completos e vincule aos atendimentos do dia. Cada profissional acessa apenas seus próprios pacientes, resguardando o sigilo.",
    icone: Users,
    destaques: [
      "Busca rápida por nome, CPF ou telefone",
      "Controle de consentimento para lembretes automáticos",
      "Painel de atendimentos do dia para a recepção fazer check-in",
    ],
    dica: "Acesse 'Atendimentos' para acompanhar em tempo real quem está na clínica.",
  },
  {
    titulo: "Prontuário Eletrônico",
    subtitulo: "Segurança de dados clínicos e conformidade legal",
    descricao:
      "Evoluções clínicas com histórico imutável, adendos assinados e armazenamento protegido de laudos e anexos com criptografia.",
    icone: FileText,
    destaques: [
      "Registros estruturados e cronológicos por paciente",
      "Anexos integrados com visualização direta e download seguro",
      "Exportação e impressão com formatação profissional",
    ],
    dica: "Disponível no menu 'Prontuário' para profissionais de saúde cadastrados.",
  },
  {
    titulo: "Motor Financeiro & Repasses",
    subtitulo: "Fechamento mensal transparente sem planilhas confusas",
    descricao:
      "O Salus calcula automaticamente os valores com base nos acordos cadastrados: locação por hora, por consulta ou percentual com fluxo centralizado.",
    icone: CircleDollarSign,
    destaques: [
      "Lançamentos automáticos gerados a partir das reservas concluídas",
      "Extrato detalhado por profissional com histórico de pagamentos",
      "Fechamento mensal com apenas um clique e emissão de notas",
    ],
    dica: "Consulte 'Financeiro' (para admins) ou 'Meu extrato' (para profissionais).",
  },
];

export function TutorialPrimeiroAcesso() {
  const [aberto, setAberto] = useState(false);
  const [passoAtual, setPassoAtual] = useState(0);

  useEffect(() => {
    // Verifica se já concluiu o tutorial
    const concluido = localStorage.getItem(CHAVE_STORAGE);
    if (!concluido) {
      // Delay suave para não assustar no primeiro render
      const timer = setTimeout(() => setAberto(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    // Permite reabrir o tutorial via evento customizado global
    function abrirTutorial() {
      setPassoAtual(0);
      setAberto(true);
    }
    window.addEventListener("open-salus-tutorial", abrirTutorial);
    return () => window.removeEventListener("open-salus-tutorial", abrirTutorial);
  }, []);

  function fechar() {
    localStorage.setItem(CHAVE_STORAGE, "true");
    setAberto(false);
  }

  function proximo() {
    if (passoAtual < PASSOS.length - 1) {
      setPassoAtual((p) => p + 1);
    } else {
      fechar();
    }
  }

  function anterior() {
    if (passoAtual > 0) {
      setPassoAtual((p) => p - 1);
    }
  }

  if (!aberto) return null;

  const passo = PASSOS[passoAtual];
  const Icone = passo.icone;
  const ehUltimo = passoAtual === PASSOS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-md transition-opacity animate-in fade-in"
        onClick={fechar}
      />

      {/* Modal Card */}
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl transition-all animate-in zoom-in-95 duration-200 sm:p-8">
        {/* Glow de fundo */}
        <div className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-48 rounded-full bg-emerald-500/10 blur-3xl" />

        {/* Top Header */}
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Image
                src="/images/salus-symbol.webp"
                alt="Salus"
                width={20}
                height={23}
                className="size-5 object-contain"
              />
            </div>
            <div>
              <span className="text-xs font-semibold tracking-wider text-primary uppercase">
                Guia de Primeiro Acesso
              </span>
              <p className="text-xs text-muted-foreground">
                Passo {passoAtual + 1} de {PASSOS.length}
              </p>
            </div>
          </div>

          <button
            onClick={fechar}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Fechar tutorial"
            aria-label="Fechar tutorial"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Barra de Progresso */}
        <div className="mt-4 flex gap-1.5">
          {PASSOS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                i <= passoAtual ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>

        {/* Conteúdo do Passo */}
        <div className="mt-6 flex flex-col gap-4">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
              <Icone className="size-6" />
            </div>
            <div>
              <h3 className="font-heading text-lg font-bold tracking-tight text-foreground sm:text-xl">
                {passo.titulo}
              </h3>
              <p className="text-sm font-medium text-muted-foreground">
                {passo.subtitulo}
              </p>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-foreground/90">
            {passo.descricao}
          </p>

          {/* Destaques */}
          <div className="rounded-xl border border-border/60 bg-muted/30 p-3.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Principais recursos
            </span>
            <ul className="mt-2 space-y-1.5 text-xs text-foreground/80">
              {passo.destaques.map((item, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Dica */}
          <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-primary">
            <Sparkles className="size-3.5 shrink-0" />
            <span>{passo.dica}</span>
          </div>
        </div>

        {/* Footer / Ações */}
        <div className="mt-8 flex items-center justify-between gap-3 border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={fechar}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Pular tutorial
          </Button>

          <div className="flex items-center gap-2">
            {passoAtual > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={anterior}
                className="gap-1 text-xs"
              >
                <ChevronLeft className="size-3.5" />
                Anterior
              </Button>
            )}

            <Button
              size="sm"
              onClick={proximo}
              className="gap-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {ehUltimo ? (
                <>
                  Concluir e Começar
                  <CheckCircle2 className="size-3.5" />
                </>
              ) : (
                <>
                  Próximo
                  <ChevronRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Botão reutilizável para reabrir o tutorial a qualquer momento */
export function BotaoAjudaTutorial() {
  function abrir() {
    window.dispatchEvent(new CustomEvent("open-salus-tutorial"));
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={abrir}
      title="Ver tutorial de primeiro acesso"
      className="gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
    >
      <HelpCircle className="size-4 text-primary" />
      <span className="hidden sm:inline">Guia de Uso</span>
    </Button>
  );
}
