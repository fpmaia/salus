import Link from "next/link";
import { CalendarCheck, CheckCircle2, Clock, DoorOpen, MessageCircle, ShieldCheck, Wallet } from "lucide-react";
import { LSCodeBadge } from "@/components/brand/ls-code";
import { SalusLogo } from "@/components/brand/salus-logo";
import { RodapeLegal } from "@/components/rodape-legal";
import { Button } from "@/components/ui/button";

// Landing para o dono do coworking de saúde: ocupação, inadimplência e tempo da recepção.
// Sem preço por enquanto (planos por número de salas). A demonstração é pelo WhatsApp comercial
// (SALUS_WHATSAPP_COMERCIAL, só dígitos com DDI); sem ele, o botão leva ao cadastro.

function linkDemonstracao(): { href: string; externo: boolean } {
  const numero = (process.env.SALUS_WHATSAPP_COMERCIAL ?? "").replace(/\D/g, "");
  if (!numero) return { href: "/cadastro", externo: false };
  const texto = "Olá! Quero ver uma demonstração do Salus para o meu espaço.";
  return { href: `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`, externo: true };
}

function BotaoDemonstracao({ tamanho = "default" }: { tamanho?: "default" | "lg" }) {
  const { href, externo } = linkDemonstracao();
  return (
    <Button asChild size={tamanho} className="gap-2">
      {externo ? (
        <a href={href} target="_blank" rel="noreferrer">
          <MessageCircle className="size-4" /> Agendar demonstração
        </a>
      ) : (
        <Link href={href}>Criar meu espaço</Link>
      )}
    </Button>
  );
}

const DORES = [
  {
    icone: DoorOpen,
    titulo: "Sala vazia é dinheiro parado",
    texto: "Veja a ocupação de cada sala, quem reserva o quê e os horários que sobram. Lista de espera sugere quem chamar quando um horário abre.",
  },
  {
    icone: Wallet,
    titulo: "Profissional pagando em dia",
    texto: "O contrato de cada um vira cobrança sozinho: por hora, por consulta, percentual ou mensalidade. O profissional paga pelo PIX e a baixa é automática.",
  },
  {
    icone: Clock,
    titulo: "Recepção sem planilha",
    texto: "Agenda em um clique, busca de paciente, remarcar e desfazer, lembretes por WhatsApp e a lista do dia com quem chegou, quem atrasou e o que falta confirmar.",
  },
];

const PASSOS = [
  { titulo: "Cadastre o espaço e as salas", texto: "Unidade, horário de funcionamento e salas. Leva poucos minutos." },
  { titulo: "Faça o contrato de cada profissional", texto: "Valor, grade fixa e regras de cancelamento. As reservas da grade saem prontas." },
  { titulo: "Convide e comece a agendar", texto: "O profissional recebe o acesso por e-mail e vê a agenda, o contrato e o que deve." },
];

/** Ilustração das telas (dados de exemplo). */
function TelaHoje() {
  const linhas = [
    ["08:30", "Marina Costa", "Dra. Helena Rocha · Sala 2", "Chegou", "bg-success/15 text-success"],
    ["09:00", "Rafael Lima", "Dr. Paulo Mendes · Sala 1", "Confirmado", "bg-primary/15 text-primary"],
    ["09:30", "Juliana Alves", "Dra. Helena Rocha · Sala 2", "A confirmar", "bg-warning/15 text-warning"],
  ];
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-lg">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Hoje · recepção</p>
      <div className="mb-3 grid grid-cols-3 gap-2 text-center">
        {[
          ["14", "consultas"],
          ["3", "chegaram"],
          ["2", "salas livres"],
        ].map(([n, r]) => (
          <div key={r} className="rounded-lg bg-muted px-2 py-2">
            <p className="text-lg font-semibold tabular-nums">{n}</p>
            <p className="text-[11px] text-muted-foreground">{r}</p>
          </div>
        ))}
      </div>
      <ul className="divide-y text-sm">
        {linhas.map(([h, p, d, s, c]) => (
          <li key={h} className="flex items-center justify-between gap-2 py-2">
            <span>
              <span className="font-semibold tabular-nums">{h}</span> {p}
              <span className="block text-[11px] text-muted-foreground">{d}</span>
            </span>
            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${c}`}>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TelaOcupacao() {
  const salas = [
    ["Sala 1", 82],
    ["Sala 2", 64],
    ["Sala 3", 37],
  ] as const;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-lg">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Mês · admin</p>
      <p className="text-2xl font-semibold tabular-nums">R$ 18.420,00</p>
      <p className="mb-3 text-xs text-muted-foreground">receita de locação</p>
      <ul className="flex flex-col gap-2 text-xs">
        {salas.map(([nome, pct]) => (
          <li key={nome}>
            <span className="flex justify-between">
              <span>{nome}</span>
              <span className="tabular-nums">{pct}%</span>
            </span>
            <span className="mt-1 block h-1.5 rounded-full bg-muted">
              <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TelaExtrato() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-lg">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">Meu extrato · profissional</p>
      <ul className="divide-y text-sm">
        <li className="flex justify-between gap-3 py-1.5">
          <span>Locação 12h × R$ 45,00</span>
          <span className="tabular-nums">R$ 540,00</span>
        </li>
        <li className="flex justify-between gap-3 py-1.5">
          <span>Pagamento PIX</span>
          <span className="tabular-nums text-success">− R$ 300,00</span>
        </li>
      </ul>
      <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-sm">
        <span className="font-semibold tabular-nums">R$ 240,00</span> a pagar
      </p>
      <span className="mt-3 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground">Pagar com PIX</span>
    </div>
  );
}

export default function Home() {
  const demonstracaoPeloWhatsapp = linkDemonstracao().externo;
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 w-full border-b bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <SalusLogo href="/" size="md" priority />
          <nav aria-label="Seções" className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#para-quem" className="hover:text-foreground">
              Para quem
            </a>
            <a href="#como-funciona" className="hover:text-foreground">
              Como funciona
            </a>
            <a href="#seguranca" className="hover:text-foreground">
              Segurança
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/entrar">Entrar</Link>
            </Button>
            <span className="hidden sm:block">
              <BotaoDemonstracao />
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-6">
              <p className="w-fit rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Para coworkings e clínicas que alugam salas</p>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl sm:leading-[1.1]">
                Salas ocupadas, profissionais em dia e a recepção sem planilha.
              </h1>
              <p className="max-w-xl text-lg text-muted-foreground">
                O Salus junta a agenda das salas, as consultas dos pacientes e o financeiro de cada profissional num só lugar, do contrato ao PIX.
              </p>
              <div className="flex flex-wrap gap-3">
                <BotaoDemonstracao tamanho="lg" />
                {demonstracaoPeloWhatsapp && (
                  <Button asChild size="lg" variant="outline">
                    <Link href="/cadastro">Criar meu espaço</Link>
                  </Button>
                )}
              </div>
              <p className="text-sm text-muted-foreground">Planos pelo número de salas. Fale com a gente para conhecer as condições do piloto.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <TelaHoje />
              </div>
              <TelaOcupacao />
              <TelaExtrato />
            </div>
          </div>
          <p className="mx-auto mt-4 max-w-6xl text-right text-[11px] text-muted-foreground">Telas ilustrativas, com dados de exemplo.</p>
        </section>

        <section id="para-quem" className="border-t bg-muted/40 px-4 py-20 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <div className="max-w-2xl">
              <h2 className="text-3xl font-bold tracking-tight">Feito para quem administra o espaço</h2>
              <p className="mt-2 text-muted-foreground">E para a recepção e os profissionais que usam todos os dias.</p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {DORES.map(({ icone: Icone, titulo, texto }) => (
                <div key={titulo} className="flex flex-col gap-3 rounded-2xl border bg-card p-6">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icone className="size-5" />
                  </span>
                  <h3 className="text-lg font-semibold">{titulo}</h3>
                  <p className="text-sm text-muted-foreground">{texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="como-funciona" className="px-4 py-20 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-10">
            <h2 className="text-3xl font-bold tracking-tight">Como começar</h2>
            <ol className="grid gap-6 md:grid-cols-3">
              {PASSOS.map((p, i) => (
                <li key={p.titulo} className="flex flex-col gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                  <h3 className="font-semibold">{p.titulo}</h3>
                  <p className="text-sm text-muted-foreground">{p.texto}</p>
                </li>
              ))}
            </ol>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {[
                "Lembretes e avisos por WhatsApp para pacientes e profissionais",
                "Agendamento online e recibo do paciente em PDF",
                "Fechamento do mês para todos de uma vez, com exportação para a contabilidade",
                "Funciona no celular: o profissional vê a semana e paga pelo PIX",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="seguranca" className="border-t bg-muted/40 px-4 py-16 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <ShieldCheck className="size-6" />
            </span>
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight">Dados dos pacientes protegidos</h2>
              <p className="max-w-3xl text-muted-foreground">
                Os dados de cada espaço ficam separados, o acesso em duas etapas protege as contas de quem administra e cada ação importante fica registrada. O
                paciente pode pedir acesso aos próprios dados ou a anonimização, e você atende pelo próprio sistema. Saiba mais na{" "}
                <Link href="/privacidade" className="text-primary underline-offset-4 hover:underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 text-center sm:px-6">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-5">
            <CalendarCheck className="size-10 text-primary" />
            <h2 className="text-3xl font-bold tracking-tight">Vamos ver o Salus com as salas do seu espaço?</h2>
            <p className="text-muted-foreground">Em uma conversa curta, montamos a sua unidade e o contrato de um profissional com você.</p>
            <div className="flex flex-wrap justify-center gap-3">
              <BotaoDemonstracao tamanho="lg" />
              <Button asChild size="lg" variant="outline">
                <Link href="/entrar">Já tenho conta</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t px-4 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:gap-3">
            <SalusLogo size="sm" />
            <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Salus. Todos os direitos reservados.</p>
          </div>
          <RodapeLegal />
          <LSCodeBadge variant="footer" />
        </div>
      </footer>
    </div>
  );
}
