import { Building2, ClipboardList, Stethoscope } from "lucide-react";

// Sem depoimentos nem métricas inventadas: o que cada perfil faz no Salus no dia a dia.
const ROTINAS = [
  {
    icone: Building2,
    perfil: "Dono ou gestor do espaço",
    itens: [
      "Vê a ocupação das salas em tempo real e onde há horário vago.",
      "Fecha o mês de cada profissional com extrato e PDF, sem planilha.",
      "Cobra por PIX pelo Asaas e acompanha quem já pagou.",
    ],
  },
  {
    icone: Stethoscope,
    perfil: "Profissional que aluga a sala",
    itens: [
      "Reserva a sala pelo celular e vê o valor antes de confirmar.",
      "Consulta o próprio contrato e extrato e paga o saldo por PIX.",
      "Registra evoluções num prontuário cifrado que só ele lê.",
    ],
  },
  {
    icone: ClipboardList,
    perfil: "Recepção",
    itens: [
      "Agenda o paciente em um passo, com cadastro rápido.",
      "Marca chegada e falta, remarca arrastando na grade.",
      "Usa a lista de espera para ocupar um horário que vagou.",
    ],
  },
];

export function SocialProof() {
  return (
    <section className="relative px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-6xl space-y-8">
        <div className="text-center space-y-2 max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Um painel para cada pessoa do espaço</h2>
          <p className="text-xs text-muted-foreground">Cada perfil vê só o que precisa, com permissões separadas.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {ROTINAS.map((r) => (
            <div key={r.perfil} className="flex flex-col gap-4 rounded-3xl border border-border/80 bg-card p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <r.icone className="size-4" />
                </div>
                <h3 className="text-sm font-bold text-foreground">{r.perfil}</h3>
              </div>
              <ul className="space-y-2 text-xs text-foreground/85 leading-relaxed">
                {r.itens.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
