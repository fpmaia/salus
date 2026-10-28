import {
  DoorOpen,
  Lock,
  MessageSquare,
  Shield,
  Wallet,
  Zap,
  Building2,
  CheckCircle2,
  Smartphone,
} from "lucide-react";

export function BentoFeatures() {
  return (
    <section id="recursos" className="relative px-4 py-24 sm:px-6">
      {/* Luz ambiente de destaque */}
      <div className="pointer-events-none absolute top-1/2 left-1/4 -z-10 h-96 w-96 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-10 right-1/4 -z-10 h-80 w-80 rounded-full bg-emerald-500/10 blur-[100px]" />

      <div className="mx-auto max-w-6xl space-y-12">
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-3 py-1 text-xs font-bold text-primary tracking-wide uppercase">
            <Zap className="size-3" /> Recursos de Nova Geração
          </span>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
            Tudo o que sua clínica precisa para operar com precisão cirúrgica.
          </h2>
          <p className="text-base text-muted-foreground">
            Abandonamos planilhas quebradas e sistemas médicos legados dos anos 2000. O Salus integra recepção, financeiro, médicos e pacientes em um só fluxo.
          </p>
        </div>

        {/* Bento Grid */}
        <div className="grid gap-6 md:grid-cols-3">
          {/* Card 1: Gestão de Salas (Grande - Colspan 2) */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-xl md:col-span-2 flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <DoorOpen className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">
                  Gestão Inteligente de Salas & Prevenção de Ociosidade
                </h3>
                <p className="text-sm text-muted-foreground max-w-xl">
                  Veja a ocupação de cada sala em tempo real. Configure grades fixas recorrentes ou sublocações avulsas por hora. Quando um paciente desmarca, a <strong>Lista de Espera Inteligente</strong> sugere quem chamar imediatamente para que nenhuma sala fique vazia.
                </p>
              </div>
            </div>

            <div className="mt-8 rounded-2xl border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span>Ocupação das salas hoje</span>
                <span className="text-primary">12 de 14 horários ocupados</span>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-background p-2 border font-medium">
                  <span className="text-muted-foreground block text-[10px]">Sala 01</span>
                  <span className="text-emerald-600 font-bold">100%</span>
                </div>
                <div className="rounded-lg bg-background p-2 border font-medium">
                  <span className="text-muted-foreground block text-[10px]">Sala 02</span>
                  <span className="text-emerald-600 font-bold">85%</span>
                </div>
                <div className="rounded-lg bg-background p-2 border font-medium">
                  <span className="text-muted-foreground block text-[10px]">Sala 03</span>
                  <span className="text-amber-600 font-bold">60%</span>
                </div>
                <div className="rounded-lg bg-background p-2 border font-medium">
                  <span className="text-muted-foreground block text-[10px]">Sala 04</span>
                  <span className="text-primary font-bold">Livre</span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Prontuário Médico Inviolável */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all hover:border-emerald-500/50 hover:shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 shadow-xs">
                <Lock className="size-6" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-foreground">Prontuário EHR Cifrado</h3>
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 border border-emerald-500/20">
                    15 Dias Grátis
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Sigilo absoluto. Administradores e recepção não têm acesso aos dados clínicos. Registros imutáveis com adendos auditados e conformidade estrita com o CFM e a LGPD.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border bg-emerald-500/5 p-4 text-xs space-y-2 border-emerald-500/20">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-semibold">
                <Shield className="size-4 text-emerald-600" /> Criptografia AES-256
              </div>
              <p className="text-[11px] text-muted-foreground">
                Prescrições, anamneses e laudos anexos com hash imutável e assinatura eletrônica.
              </p>
            </div>
          </div>

          {/* Card 3: Automação Financeira PIX */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all hover:border-amber-500/50 hover:shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 shadow-xs">
                <Wallet className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">Cobrança e Baixa PIX Automática</h3>
                <p className="text-sm text-muted-foreground">
                  O contrato vira cobrança sozinho: por hora de sala, consulta, porcentagem ou mensalidade fixa. O profissional paga por PIX direto do celular e o Salus dá baixa na hora.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border bg-muted/30 p-4 text-xs space-y-2">
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Inadimplência sob controle:</span>
                <strong className="text-emerald-600">99.2% em dia</strong>
              </div>
              <div className="flex justify-between items-center text-muted-foreground">
                <span>Fechamento do mês:</span>
                <strong className="text-foreground">Exportação contábil pronta</strong>
              </div>
            </div>
          </div>

          {/* Card 4: WhatsApp Integrado */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <MessageSquare className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">WhatsApp Oficial Integrado</h3>
                <p className="text-sm text-muted-foreground">
                  Lembretes automáticos 24h e 2h antes da consulta. O paciente confirma ou desmarca com um clique no WhatsApp, reduzindo faltas (no-show) em mais de 70%.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border bg-muted/30 p-3.5 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <Smartphone className="size-3.5" /> Lembrete automático enviado
              </div>
              <p className="text-muted-foreground text-[11px]">
                &quot;Olá Marina, confirmamos sua consulta com a Dra. Helena amanhã às 09h? Responda SIM ou NÃO.&quot;
              </p>
            </div>
          </div>

          {/* Card 5: Multi-Unidades */}
          <div className="group relative overflow-hidden rounded-3xl border border-border/80 bg-card p-8 shadow-sm transition-all hover:border-primary/50 hover:shadow-xl flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-xs">
                <Building2 className="size-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-foreground">Módulo Multi-Unidades</h3>
                <p className="text-sm text-muted-foreground">
                  Gerencie mais de uma clínica ou consultório com uma única conta. Alterne instantaneamente entre espaços, compartilhe médicos e centralize a inteligência financeira.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border bg-muted/30 p-3.5 space-y-1 text-xs">
              <div className="flex items-center gap-2 font-semibold text-foreground">
                <CheckCircle2 className="size-3.5 text-primary" /> Unidade Jardins & Unidade Vila Mariana
              </div>
              <p className="text-[11px] text-muted-foreground">
                Visão consolidada para redes em expansão e franquias de saúde.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
