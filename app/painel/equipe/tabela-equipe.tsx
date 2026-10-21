"use client";

import { useActionState, useState } from "react";
import {
  Check,
  Copy,
  Mail,
  MoreVertical,
  Plus,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import type { ConviteMembroPendente, MembroClinica } from "@/src/server/equipe";
import type { Role } from "@/src/domain/rbac";
import { ROTULOS_ROLE } from "@/src/domain/rbac";
import {
  alterarPapelAction,
  convidarMembroAction,
  desativarMembroAction,
  reativarMembroAction,
  revogarConviteAction,
} from "./actions";

interface Props {
  membros: MembroClinica[];
  convites: ConviteMembroPendente[];
  usuarioAtualId: string;
}

export function TabelaEquipe({ membros, convites, usuarioAtualId }: Props) {
  const [modalConvidarAberto, setModalConvidarAberto] = useState(false);
  const [membroParaAlterar, setMembroParaAlterar] = useState<MembroClinica | null>(null);
  const [linkCopiadoId, setLinkCopiadoId] = useState<string | null>(null);

  // Form de convite
  const [estadoConvite, acaoConvite, pendenteConvite] = useActionState(convidarMembroAction, null);
  const [estadoAlterar, acaoAlterar, pendenteAlterar] = useActionState(alterarPapelAction, null);
  const [estadoDesativar, acaoDesativar, pendenteDesativar] = useActionState(desativarMembroAction, null);
  const [estadoReativar, acaoReativar, pendenteReativar] = useActionState(reativarMembroAction, null);
  const [estadoRevogar, acaoRevogar, pendenteRevogar] = useActionState(revogarConviteAction, null);

  const copiarLink = (texto: string, id: string) => {
    const urlCompleta = `${window.location.origin}${texto}`;
    navigator.clipboard.writeText(urlCompleta);
    setLinkCopiadoId(id);
    setTimeout(() => setLinkCopiadoId(null), 2500);
  };

  const getBadgeRole = (role: Role) => {
    switch (role) {
      case "admin":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <ShieldCheck className="size-3" /> Admin
          </span>
        );
      case "recepcao":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <Users className="size-3" /> Recepção
          </span>
        );
      case "profissional":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <UserCheck className="size-3" /> Profissional
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Barra de Ações do Topo */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão da Equipe</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gerencie administradores, recepcionistas e profissionais que têm acesso a este espaço.
          </p>
        </div>
        <button
          onClick={() => setModalConvidarAberto(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-all active:scale-[0.98]"
        >
          <Plus className="size-4" /> Convidar Membro
        </button>
      </div>

      {/* Alertas de Ação */}
      {estadoConvite?.sucesso && (
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-400">
          <p className="font-semibold">{estadoConvite.sucesso}</p>
          {estadoConvite.dados?.link && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs bg-background/80 px-2.5 py-1 rounded-md font-mono border border-emerald-500/30">
                {window.location.origin}{estadoConvite.dados.link}
              </span>
              <button
                onClick={() => copiarLink(estadoConvite.dados!.link, "novo")}
                className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {linkCopiadoId === "novo" ? <Check className="size-3" /> : <Copy className="size-3" />}
                {linkCopiadoId === "novo" ? "Copiado!" : "Copiar"}
              </button>
            </div>
          )}
        </div>
      )}

      {estadoConvite?.erro && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {estadoConvite.erro}
        </div>
      )}

      {estadoAlterar?.erro && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {estadoAlterar.erro}
        </div>
      )}

      {estadoDesativar?.erro && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {estadoDesativar.erro}
        </div>
      )}

      {/* Lista de Membros Ativos */}
      <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
        <div className="border-b border-border/60 bg-muted/30 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground">Membros Ativos ({membros.filter(m => m.ativo).length})</h2>
            <p className="text-xs text-muted-foreground">Usuários que têm login autorizado nesta clínica.</p>
          </div>
        </div>

        <div className="divide-y divide-border/40">
          {membros.map((membro) => {
            const ehMeuUsuario = membro.userId === usuarioAtualId;
            return (
              <div
                key={membro.membershipId}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {membro.nome.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-foreground">{membro.nome}</span>
                      {ehMeuUsuario && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground font-medium">
                          Você
                        </span>
                      )}
                      {!membro.ativo && (
                        <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">
                          Inativo
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground block">{membro.email}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {getBadgeRole(membro.role)}

                  {/* Ações */}
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setMembroParaAlterar(membro)}
                      className="rounded-lg border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Alterar Papel
                    </button>

                    {membro.ativo ? (
                      <form action={acaoDesativar}>
                        <input type="hidden" name="membershipId" value={membro.membershipId} />
                        <button
                          type="submit"
                          disabled={pendenteDesativar}
                          title="Desativar membro"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                        >
                          <UserX className="size-3.5" />
                        </button>
                      </form>
                    ) : (
                      <form action={acaoReativar}>
                        <input type="hidden" name="membershipId" value={membro.membershipId} />
                        <button
                          type="submit"
                          disabled={pendenteReativar}
                          title="Reativar membro"
                          className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-emerald-600 hover:border-emerald-500/30 transition-colors"
                        >
                          <UserCheck className="size-3.5" />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Convites Pendentes */}
      {convites.length > 0 && (
        <div className="rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
          <div className="border-b border-border/60 bg-muted/30 px-6 py-4">
            <h2 className="text-base font-semibold text-foreground">Convites Pendentes ({convites.length})</h2>
            <p className="text-xs text-muted-foreground">Pessoas convidadas que ainda não aceitaram o link.</p>
          </div>

          <div className="divide-y divide-border/40">
            {convites.map((convite) => (
              <div
                key={convite.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-muted/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Mail className="size-4" />
                  </div>
                  <div>
                    <span className="font-semibold text-sm text-foreground">{convite.email}</span>
                    <span className="text-xs text-muted-foreground block">
                      Expira em {new Date(convite.expiraEm).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  {getBadgeRole(convite.role)}

                  <form action={acaoRevogar}>
                    <input type="hidden" name="conviteId" value={convite.id} />
                    <button
                      type="submit"
                      disabled={pendenteRevogar}
                      className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 px-2.5 py-1 text-xs font-medium transition-colors"
                    >
                      <Trash2 className="size-3" /> Revogar
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Convidar Membro */}
      {modalConvidarAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">Convidar Novo Membro</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Envie um convite de acesso para este espaço. O membro receberá um link válido por 7 dias.
            </p>

            <form
              action={async (formData) => {
                await acaoConvite(formData);
                setModalConvidarAberto(false);
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label className="text-xs font-semibold text-foreground">E-mail do Membro</label>
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="exemplo@clinica.com.br"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-foreground">Papel no Espaço</label>
                <div className="mt-2 space-y-2">
                  <label className="flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/30 cursor-pointer">
                    <input
                      type="radio"
                      name="role"
                      value="recepcao"
                      defaultChecked
                      className="mt-0.5 text-primary"
                    />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Recepção</span>
                      <span className="text-[11px] text-muted-foreground">
                        Realiza check-in, gerencia fila de espera, agenda consultas e registra pagamentos.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/30 cursor-pointer">
                    <input type="radio" name="role" value="profissional" className="mt-0.5 text-primary" />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Profissional de Saúde</span>
                      <span className="text-[11px] text-muted-foreground">
                        Atende pacientes, preenche prontuário eletrônico seguro e acompanha sua agenda.
                      </span>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/30 cursor-pointer">
                    <input type="radio" name="role" value="admin" className="mt-0.5 text-primary" />
                    <div>
                      <span className="text-xs font-bold text-foreground block">Administrador</span>
                      <span className="text-[11px] text-muted-foreground">
                        Acesso total à gestão financeira, contratos de locação de salas, equipe e configurações.
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalConvidarAberto(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendenteConvite}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {pendenteConvite ? "Gerando link..." : "Gerar Convite"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alterar Papel */}
      {membroParaAlterar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-xl">
            <h3 className="text-lg font-bold text-foreground">Alterar Papel</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Modifique a função de <strong className="text-foreground">{membroParaAlterar.nome}</strong>.
            </p>

            <form
              action={async (formData) => {
                await acaoAlterar(formData);
                setMembroParaAlterar(null);
              }}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="membershipId" value={membroParaAlterar.membershipId} />

              <div className="space-y-2">
                {(["admin", "recepcao", "profissional"] as const).map((r) => (
                  <label
                    key={r}
                    className="flex items-center justify-between rounded-xl border border-border p-3 hover:bg-muted/30 cursor-pointer"
                  >
                    <span className="text-sm font-semibold text-foreground">{ROTULOS_ROLE[r]}</span>
                    <input
                      type="radio"
                      name="novoRole"
                      value={r}
                      defaultChecked={membroParaAlterar.role === r}
                      className="text-primary"
                    />
                  </label>
                ))}
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setMembroParaAlterar(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendenteAlterar}
                  className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {pendenteAlterar ? "Salvando..." : "Salvar Alteração"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
