import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { obterContextoTenant, obterSessao } from "@/src/auth/sessao";
import { ROTULOS_ROLE } from "@/src/domain/rbac";
import { listarSessoesAtivas, obterPerfil } from "@/src/server/perfil";
import { BotaoCopiarLink } from "@/components/botao-copiar-link";
import { SessoesAtivasLista } from "@/components/sessoes-ativas-lista";
import { Lock, Shield, User, Globe, Stethoscope, Smartphone } from "lucide-react";
import {
  alterarSenhaAcao,
  atualizarDadosPessoaisAcao,
  atualizarDadosProfissionaisAcao,
} from "./actions";

export default async function PerfilPage() {
  const [ctx, sessao] = await Promise.all([obterContextoTenant(), obterSessao()]);
  const [{ usuario, profissional }, sessoes] = await Promise.all([
    obterPerfil(ctx),
    listarSessoesAtivas(ctx.userId, sessao?.session?.token),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground flex items-center gap-2">
          <User className="size-6 text-primary" />
          Meu Perfil
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie seus dados pessoais, senha de acesso e dados profissionais no espaço{" "}
          <strong className="text-foreground">{ctx.tenantNome}</strong>.
        </p>
      </div>

      <div className="grid gap-6">
        {/* Card 1: Dados Pessoais */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="size-4 text-primary" />
              Identificação & Acesso
            </CardTitle>
            <CardDescription>
              Seus dados cadastrais vinculados ao seu usuário no sistema.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao
              acao={atualizarDadosPessoaisAcao}
              textoBotao="Salvar Dados Pessoais"
              textoPendente="Salvando…"
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="nome">Nome Completo</Label>
                  <Input id="nome" name="nome" defaultValue={usuario.nome} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">E-mail de Login</Label>
                  <Input
                    id="email"
                    name="email"
                    defaultValue={usuario.email}
                    disabled
                    className="bg-muted/50 text-muted-foreground cursor-not-allowed"
                    title="O e-mail é a chave única de login e não pode ser alterado diretamente"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
                <span>Perfil de Acesso:</span>
                <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  {ROTULOS_ROLE[usuario.role]}
                </span>
              </div>
            </FormAcao>
          </CardContent>
        </Card>

        {/* Card 2: Segurança & Senha */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="size-4 text-primary" />
              Segurança & Alteração de Senha
            </CardTitle>
            <CardDescription>
              Atualize sua senha de acesso periodicamente para manter sua conta segura.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao
              acao={alterarSenhaAcao}
              textoBotao="Atualizar Senha"
              textoPendente="Atualizando…"
              className="space-y-4"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="senhaAtual">Senha Atual</Label>
                  <Input id="senhaAtual" name="senhaAtual" type="password" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="novaSenha">Nova Senha</Label>
                  <Input id="novaSenha" name="novaSenha" type="password" minLength={8} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirmarSenha">Confirmar Nova Senha</Label>
                  <Input id="confirmarSenha" name="confirmarSenha" type="password" minLength={8} required />
                </div>
              </div>
            </FormAcao>
          </CardContent>
        </Card>

        {/* Card: Verificação em duas etapas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="size-4 text-primary" />
              Verificação em duas etapas
            </CardTitle>
            <CardDescription>
              {sessao?.user && (sessao.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled
                ? "Ativa: o login pede o código do app autenticador."
                : "Desativada. Proteja a conta com um código do app autenticador além da senha."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/seguranca/dois-fatores" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              Gerenciar verificação em duas etapas
            </Link>
          </CardContent>
        </Card>

        {/* Card: Sessões Ativas & Dispositivos */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="size-4 text-primary" />
              Sessões Ativas & Dispositivos
            </CardTitle>
            <CardDescription>
              Gerencie os dispositivos conectados à sua conta e encerre sessões que não reconhecer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SessoesAtivasLista sessoes={sessoes} />
          </CardContent>
        </Card>

        {/* Card 3: Dados Profissionais e Link Público de Agendamento (se for profissional) */}
        {profissional && (
          <Card className="border-primary/30 shadow-xs">
            <CardHeader className="bg-primary/5 rounded-t-xl border-b border-border/40">
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="size-4 text-primary" />
                Dados Profissionais & Link de Agendamento
              </CardTitle>
              <CardDescription>
                Configure seu registro profissional e compartilhe seu link exclusivo para marcação online de consultas.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <FormAcao
                acao={atualizarDadosProfissionaisAcao}
                textoBotao="Salvar Configurações Profissionais"
                textoPendente="Salvando…"
                className="space-y-5"
              >
                {/* Destaque do Link Público de Agendamento */}
                {profissional.linkAgendamento && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2.5">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                      <Globe className="size-3.5" />
                      Seu Link Pessoal de Agendamento
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Envie este link para seus pacientes ou insira na sua bio do Instagram e WhatsApp. Os horários das suas salas reservadas ficam disponíveis automaticamente para agendamento.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-2.5">
                      <span className="font-mono text-xs text-foreground truncate select-all">
                        {profissional.linkAgendamento}
                      </span>
                      <BotaoCopiarLink link={profissional.linkAgendamento} />
                    </div>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="conselho">Conselho Profissional</Label>
                    <Input id="conselho" name="conselho" placeholder="Ex.: CRM, CRP, CREFITO" defaultValue={profissional.conselho ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="registro">Número do Registro</Label>
                    <Input id="registro" name="registro" placeholder="Ex.: 123456/SP" defaultValue={profissional.registro ?? ""} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="especialidade">Especialidade / Atuação</Label>
                    <Input id="especialidade" name="especialidade" placeholder="Ex.: Cardiologia, Psicologia" defaultValue={profissional.especialidade ?? ""} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="duracaoConsultaMin">Duração da Consulta (minutos)</Label>
                    <NativeSelect id="duracaoConsultaMin" name="duracaoConsultaMin" defaultValue={String(profissional.duracaoConsultaMin)}>
                      <option value="15">15 minutos</option>
                      <option value="30">30 minutos</option>
                      <option value="45">45 minutos</option>
                      <option value="60">60 minutos (1 hora)</option>
                      <option value="90">90 minutos (1h 30m)</option>
                      <option value="120">120 minutos (2 horas)</option>
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="slugPublico">Identificador do Link (slug)</Label>
                    <Input
                      id="slugPublico"
                      name="slugPublico"
                      placeholder="dr-seu-nome"
                      defaultValue={profissional.slugPublico ?? ""}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Aparecerá como <code>/agendar/seu-nome</code>
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="mensagemPublica">Mensagem para os Pacientes na Página Pública (opcional)</Label>
                  <Input
                    id="mensagemPublica"
                    name="mensagemPublica"
                    placeholder="Ex.: Consultas presenciais. Em caso de dúvidas, envie mensagem pelo WhatsApp."
                    defaultValue={profissional.mensagemPublica ?? ""}
                  />
                </div>

                <div className="rounded-lg border p-3 bg-muted/20">
                  <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      name="agendamentoOnline"
                      defaultChecked={profissional.agendamentoOnline}
                      className="size-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Ativar Agendamento Online Público para meus pacientes</span>
                  </label>
                  <p className="text-xs text-muted-foreground mt-1 ml-6.5">
                    Quando ativo, os horários livres das suas salas reservadas aparecem no seu link pessoal para marcação.
                  </p>
                </div>
              </FormAcao>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
