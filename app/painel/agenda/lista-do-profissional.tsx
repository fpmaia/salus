import Link from "next/link";
import { formatarDataBr } from "@/src/domain/tempo";
import type { ReservaNaAgenda } from "@/src/domain/reservas";

const STATUS_CURTO: Record<string, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  presente: "Chegou",
  realizado: "Realizado",
  falta: "Falta",
};

/** Lista (cards) das reservas do próprio profissional, só no celular. */
export function ListaDoProfissional({ reservas, semana }: { reservas: ReservaNaAgenda[]; semana: boolean }) {
  const ordenadas = [...reservas].filter((r) => r.status !== "cancelada").sort((a, b) => `${a.data}${a.horaInicio}`.localeCompare(`${b.data}${b.horaInicio}`));
  return (
    <section aria-labelledby="titulo-meu-dia" className="flex flex-col gap-3 md:hidden">
      <h2 id="titulo-meu-dia" className="text-base font-semibold">
        {semana ? "Minha semana nesta sala" : "Meu dia"}
      </h2>
      {ordenadas.length === 0 ? (
        <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Nenhuma reserva sua. Toque num horário livre da grade abaixo para reservar.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {ordenadas.map((r) => (
            <li key={r.id} className="rounded-xl border bg-card p-3 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold tabular-nums">
                  {semana && `${formatarDataBr(r.data).slice(0, 5)} · `}
                  {r.horaInicio}–{r.horaFim}
                </span>
                <span className="text-xs text-muted-foreground">{r.status === "concluida" ? "Concluída" : "Reservada"}</span>
              </div>
              {r.atendimentos.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">Sem pacientes agendados.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-1">
                  {[...r.atendimentos]
                    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio))
                    .map((a) => (
                      <li key={a.id} className="flex justify-between gap-2">
                        <span>
                          <span className="tabular-nums">{a.horaInicio}</span> {a.pacienteNome}
                        </span>
                        <span className="text-xs text-muted-foreground">{STATUS_CURTO[a.status] ?? a.status}</span>
                      </li>
                    ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link href="/painel/agenda?visao=lista" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
        Abrir as consultas do dia →
      </Link>
    </section>
  );
}
