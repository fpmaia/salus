import { DecisaoReservas } from "@/components/decisao-reservas";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { obterContextoTenant } from "@/src/auth/sessao";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { formatarDataBr } from "@/src/server/reservas";
import { obterUnidade } from "@/src/server/unidades";
import {
  adicionarFeriadoAcao,
  atualizarSalaAcao,
  atualizarUnidadeAcao,
  criarSalaAcao,
  removerFeriadoAcao,
  salvarHorariosAcao,
} from "../actions";
import { CamposUnidade } from "../campos-unidade";

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function UnidadePage({ params, searchParams }: PageProps<"/painel/unidades/[id]">) {
  const { id } = await params;
  const recemCriada = (await searchParams).nova === "1";
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "salas.gerenciar");
  if (!UUID.test(id)) notFound();
  const detalhe = await obterUnidade(ctx, id);
  if (!detalhe) notFound();
  const { unidade, horarios, feriados, salas } = detalhe;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/painel/unidades" className="text-sm text-muted-foreground hover:underline">
            ← Unidades
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{unidade.nome}</h1>
        </div>
        <Link
          href={`/painel/agenda?unidade=${unidade.id}`}
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Ver agenda da unidade →
        </Link>
      </div>
      {recemCriada && (
        <p className="rounded-md border border-success/30 bg-success/10 p-3 text-sm">
          Unidade criada com o horário padrão (seg–sex, 08h–18h). Agora confira o horário abaixo e adicione as salas em &quot;Nova sala&quot;.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dados da unidade</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAcao acao={atualizarUnidadeAcao.bind(null, unidade.id)} textoBotao="Salvar">
            <CamposUnidade valores={unidade} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={unidade.ativo} /> Unidade ativa (aceita reservas)
            </label>
          </FormAcao>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Horário de funcionamento</CardTitle>
          <CardDescription>
            Até dois intervalos por dia (ex.: 08:00–12:00 e 14:00–18:00). Deixe em branco para dia fechado.
            Horários em múltiplos de {unidade.slotMinutos} minutos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormAcao acao={salvarHorariosAcao.bind(null, unidade.id)} textoBotao="Salvar horários">
            <div className="flex flex-col divide-y">
              {DIAS.map((rotulo, dia) => {
                const doDia = horarios.filter((h) => h.diaSemana === dia);
                return (
                  <div key={dia} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="w-20 font-medium">{rotulo}</span>
                    {[1, 2].map((n) => {
                      const h = doDia[n - 1];
                      return (
                        <span key={n} className="flex items-center gap-1">
                          <Input
                            type="time"
                            name={`abre_${dia}_${n}`}
                            step={unidade.slotMinutos * 60}
                            defaultValue={h?.abre.slice(0, 5)}
                            aria-label={`${rotulo}: abertura ${n}`}
                            className="w-28"
                          />
                          <span className="text-muted-foreground">–</span>
                          <Input
                            type="time"
                            name={`fecha_${dia}_${n}`}
                            step={unidade.slotMinutos * 60}
                            defaultValue={h?.fecha.slice(0, 5)}
                            aria-label={`${rotulo}: fechamento ${n}`}
                            className="w-28"
                          />
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </FormAcao>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feriados</CardTitle>
          <CardDescription>Datas sem funcionamento. Reservas não podem ser feitas nesses dias.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {feriados.length > 0 && (
            <ul className="divide-y">
              {feriados.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {formatarDataBr(f.data)} · {f.descricao}
                    {f.unidadeId === null && <span className="ml-2 text-xs text-muted-foreground">todas as unidades</span>}
                  </span>
                  <FormAcao
                    acao={removerFeriadoAcao.bind(null, f.id)}
                    textoBotao="Remover"
                    textoPendente="Removendo…"
                    variante="outline"
                    className="flex items-center gap-2"
                  />
                </li>
              ))}
            </ul>
          )}
          <FormAcao acao={adicionarFeriadoAcao.bind(null, unidade.id)} textoBotao="Adicionar feriado">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div className="flex flex-col gap-2">
                <Label htmlFor="feriado-data">Data</Label>
                <Input id="feriado-data" name="data" type="date" required />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="feriado-descricao">Descrição</Label>
                <Input id="feriado-descricao" name="descricao" placeholder="Aniversário da cidade" required />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="todasUnidades" /> Vale para todas as unidades
            </label>
            <DecisaoReservas id="feriado-decisao" rotulo="Se já houver reservas nesse dia" />
          </FormAcao>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Salas</CardTitle>
          <CardDescription>Recursos separados por vírgula (ex.: maca, pia, ar-condicionado).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {salas.map((s) => (
            <div key={s.id} className="rounded-lg border p-3">
              <FormAcao acao={atualizarSalaAcao.bind(null, s.id)} textoBotao="Salvar sala">
                <CamposSala valores={{ ...s, recursos: s.recursos.join(", ") }} prefixo={s.id} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="ativo" defaultChecked={s.ativo} /> Sala ativa
                </label>
                {s.ativo && <DecisaoReservas id={`sala-${s.id}-decisao`} rotulo="Ao desativar, reservas futuras da sala" />}
              </FormAcao>
            </div>
          ))}
          {salas.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs">
              <div>
                <span className="font-semibold text-foreground">Salas configuradas!</span>
                <span className="ml-1 text-muted-foreground">Próximo passo recomendado: cadastre os profissionais que irão atender nestas salas.</span>
              </div>
              <Button asChild size="sm" className="h-7 text-xs font-semibold">
                <Link href="/painel/profissionais">Cadastrar Profissionais →</Link>
              </Button>
            </div>
          )}
          <div className="rounded-lg border border-dashed p-3">
            <p className="mb-3 text-sm font-medium">Nova sala</p>
            <FormAcao acao={criarSalaAcao.bind(null, unidade.id)} textoBotao="Criar sala">
              <CamposSala prefixo="nova" />
            </FormAcao>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function CamposSala({
  valores = {},
  prefixo,
}: {
  valores?: {
    nome?: string;
    descricao?: string | null;
    recursos?: string;
  };
  prefixo: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefixo}-nome`}>Nome</Label>
          <Input id={`${prefixo}-nome`} name="nome" defaultValue={valores.nome} placeholder="Sala 1" required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefixo}-descricao`}>Descrição</Label>
          <Input id={`${prefixo}-descricao`} name="descricao" defaultValue={valores.descricao ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${prefixo}-recursos`}>Recursos</Label>
          <Input id={`${prefixo}-recursos`} name="recursos" defaultValue={valores.recursos} placeholder="maca, pia" />
        </div>
      </div>

    </div>
  );
}
