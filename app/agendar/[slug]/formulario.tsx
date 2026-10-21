"use client";

import { InputMascara } from "@/components/input-mascara";
import { useState } from "react";
import { FormAcao } from "@/components/form-acao";
import { Turnstile } from "@/components/turnstile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { EstadoAcao } from "@/src/server/acao";

type Dia = { data: string; rotulo: string; horarios: { iso: string; hora: string }[] };

/** Escolha de dia/horário + dados do paciente. Após agendar, mostra o link de gestão. */
export function FormularioAgendamento({
  dias,
  acao,
  chaveTurnstile,
}: {
  dias: Dia[];
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  /** Captcha (null = desligado). */
  chaveTurnstile: string | null;
}) {
  const [dia, setDia] = useState(dias[0]?.data);
  const [agendado, setAgendado] = useState<{ mensagem: string; link: string } | null>(null);
  const atual = dias.find((d) => d.data === dia) ?? dias[0];

  if (agendado) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="font-medium">{agendado.mensagem}</p>
        <p className="text-muted-foreground">Guarde este link para confirmar ou cancelar quando precisar:</p>
        <a href={agendado.link} className="break-all text-primary underline-offset-4 hover:underline">
          {agendado.link}
        </a>
      </div>
    );
  }

  return (
    <FormAcao
      acao={acao}
      textoBotao="Agendar"
      textoPendente="Agendando…"
      aoConcluir={(estado) => {
        if (estado.dados?.link) setAgendado({ mensagem: estado.sucesso ?? "Agendado", link: estado.dados.link });
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Dia</legend>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {dias.map((d) => (
            <button
              key={d.data}
              type="button"
              onClick={() => setDia(d.data)}
              className={`shrink-0 rounded-lg border px-3 py-2 text-sm ${d.data === atual?.data ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"}`}
            >
              {d.rotulo}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Horário</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {atual?.horarios.map((h, i) => (
            <label key={h.iso} className="cursor-pointer rounded-lg border px-2 py-2 text-center text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium">
              <input type="radio" name="inicio" value={h.iso} required defaultChecked={i === 0} className="sr-only" />
              {h.hora}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="ag-nome">Nome completo</Label>
          <Input id="ag-nome" name="nome" autoComplete="name" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ag-tel">Celular (WhatsApp)</Label>
          <InputMascara mascara="telefone" id="ag-tel" name="telefone" type="tel" autoComplete="tel" placeholder="(11) 99999-0000" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="ag-email">E-mail (opcional)</Label>
          <Input id="ag-email" name="email" type="email" autoComplete="email" />
        </div>
      </div>
      {/* Campo-isca: escondido de pessoas; robôs preenchem e o agendamento é recusado. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Site <input name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consentimentoLembretes" defaultChecked className="mt-1" />
        Quero receber lembrete e confirmação por WhatsApp.
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="aceitePrivacidade" required className="mt-1" />
        <span>
          Autorizo o uso do meu nome e contato para este agendamento (LGPD). Os dados ficam com o espaço e o profissional e não são
          compartilhados.
        </span>
      </label>
      <Turnstile chaveSite={chaveTurnstile} acao="agendar" />
    </FormAcao>
  );
}
