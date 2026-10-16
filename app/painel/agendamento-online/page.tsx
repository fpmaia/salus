import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { pode } from "@/src/domain/rbac";
import { obterConfigOnline } from "@/src/server/agendamento-online";
import { urlPublica } from "@/src/server/links";
import { listarProfissionaisParaReserva } from "@/src/server/reservas";
import { configurarOnlineAcao } from "./actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgendamentoOnlinePage({ searchParams }: PageProps<"/painel/agendamento-online">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "agenda_online.configurar");
  const admin = pode(ctx.role, "profissionais.gerenciar");
  const { profissional } = await searchParams;
  const profissionais = admin ? await listarProfissionaisParaReserva(ctx) : [];
  const escolhido = admin ? (typeof profissional === "string" && UUID.test(profissional) ? profissional : profissionais[0]?.id) : undefined;
  const config = admin && !escolhido ? null : await obterConfigOnline(ctx, escolhido);
  const link = config?.slugPublico ? `${urlPublica()}/agendar/${config.slugPublico}` : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agendamento online</h1>
        <p className="text-sm text-muted-foreground">
          Página pública onde pacientes marcam horário sozinhos, dentro das suas reservas de sala.
        </p>
      </div>

      {admin && (
        <form className="flex items-end gap-2" action="/painel/agendamento-online">
          <div className="flex flex-col gap-1">
            <Label htmlFor="profissional" className="text-xs">
              Profissional
            </Label>
            <NativeSelect id="profissional" name="profissional" defaultValue={escolhido} className="w-64">
              {profissionais.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button type="submit" variant="outline">
            Abrir
          </Button>
        </form>
      )}

      {!config ? (
        <p className="text-sm text-muted-foreground">Nenhum profissional ativo.</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{config.nome}</CardTitle>
            <CardDescription>
              {config.agendamentoOnline && link ? (
                <>
                  Link para divulgar:{" "}
                  <Link href={link} target="_blank" className="break-all text-primary underline-offset-4 hover:underline">
                    {link}
                  </Link>
                </>
              ) : (
                "Desativado: a página pública não aceita agendamentos."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao key={config.id} acao={configurarOnlineAcao.bind(null, admin ? config.id : undefined)} textoBotao="Salvar">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="ativo" defaultChecked={config.agendamentoOnline} /> Aceitar agendamentos pela página pública
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ao-duracao">Duração da consulta (min)</Label>
                  <Input id="ao-duracao" name="duracao" type="number" min={15} max={480} step={15} defaultValue={config.duracaoConsultaMin} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ao-antecedencia">Antecedência mínima (horas)</Label>
                  <Input id="ao-antecedencia" name="antecedencia" type="number" min={0} max={168} defaultValue={config.antecedenciaMinHoras} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="ao-janela">Até quantos dias à frente</Label>
                  <Input id="ao-janela" name="janela" type="number" min={1} max={180} defaultValue={config.janelaDias} />
                </div>
                <div className="flex flex-col gap-2 sm:col-span-3">
                  <Label htmlFor="ao-mensagem">Mensagem na página (opcional)</Label>
                  <Input id="ao-mensagem" name="mensagem" maxLength={500} defaultValue={config.mensagemPublica ?? ""} placeholder="Ex.: atendimento adulto, chegue 10 min antes" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Só aparecem horários dentro das suas reservas de sala ativas, sem conflito com atendimentos já marcados. Para abrir
                mais horários, reserve sala na Agenda de salas.
              </p>
            </FormAcao>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
