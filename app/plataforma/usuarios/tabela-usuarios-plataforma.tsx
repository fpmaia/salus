"use client";

import { useActionState, useState } from "react";
import {
  Ban,
  Search,
  Shield,
  UserCheck,
} from "lucide-react";
import type { UsuarioPlataforma } from "@/src/server/plataforma";
import { banirUsuarioPlataformaAcao, desbanirUsuarioPlataformaAcao } from "../actions";

interface Props {
  usuarios: UsuarioPlataforma[];
  meuUsuarioId: string;
}

export function TabelaUsuariosPlataforma({ usuarios, meuUsuarioId }: Props) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | "ativos" | "banidos">("todos");
  const [usuarioParaBanir, setUsuarioParaBanir] = useState<UsuarioPlataforma | null>(null);

  const [estadoBanir, acaoBanir, pendenteBanir] = useActionState(banirUsuarioPlataformaAcao, null);
  const [estadoDesbanir, acaoDesbanir, pendenteDesbanir] = useActionState(desbanirUsuarioPlataformaAcao, null);

  const usuariosFiltrados = usuarios.filter((u) => {
    const atendeStatus =
      filtroStatus === "todos" ||
      (filtroStatus === "ativos" && !u.banned) ||
      (filtroStatus === "banidos" && u.banned);
    const termo = busca.toLowerCase();
    const atendeBusca =
      !termo ||
      u.name.toLowerCase().includes(termo) ||
      u.email.toLowerCase().includes(termo);
    return atendeStatus && atendeBusca;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Gestão de Usuários</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Controle de contas, suspensão e visualização de membros de todos os espaços.
          </p>
        </div>
      </div>

      {/* Alertas */}
      {estadoBanir?.sucesso && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-xs text-destructive">
          {estadoBanir.sucesso}
        </div>
      )}
      {estadoDesbanir?.sucesso && (
        <div className="rounded-xl border border-success/20 bg-success/10 p-3.5 text-xs text-success">
          {estadoDesbanir.sucesso}
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail..."
            className="w-full rounded-xl border border-input bg-card pl-10 pr-4 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          {(["todos", "ativos", "banidos"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFiltroStatus(st)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filtroStatus === st
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-xs overflow-hidden">
        <div className="divide-y divide-border/40">
          {usuariosFiltrados.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Nenhum usuário encontrado.
            </div>
          ) : (
            usuariosFiltrados.map((u) => {
              const ehEuMesmo = u.id === meuUsuarioId;
              const ehSuperadmin = u.role === "superadmin";

              return (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 hover:bg-muted/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm">
                      {u.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground">{u.name}</span>
                        {ehEuMesmo && (
                          <span className="text-[10px] bg-muted px-1.5 py-0.2 rounded text-muted-foreground font-semibold">
                            Você
                          </span>
                        )}
                        {ehSuperadmin && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2 py-0.2 text-[10px] font-bold text-primary">
                            <Shield className="size-2.5" /> Superadmin
                          </span>
                        )}
                        {u.banned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/20 px-2 py-0.2 text-[10px] font-bold text-destructive">
                            <Ban className="size-2.5" /> Banido
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>{u.email}</span>
                        <span>•</span>
                        <span>{u.clinicasCount} espaço(s) vinculado(s)</span>
                        <span>•</span>
                        <span>Registrado em {new Date(u.createdAt).toLocaleDateString("pt-BR")}</span>
                      </div>
                      {u.banReason && (
                        <p className="text-[11px] text-destructive mt-1">
                          Motivo do banimento: {u.banReason}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!ehEuMesmo && !ehSuperadmin && (
                      <>
                        {u.banned ? (
                          <form action={acaoDesbanir}>
                            <input type="hidden" name="userId" value={u.id} />
                            <button
                              type="submit"
                              disabled={pendenteDesbanir}
                              className="inline-flex items-center gap-1 rounded-lg bg-success text-white hover:bg-success px-3 py-1.5 text-xs font-semibold transition-colors"
                            >
                              <UserCheck className="size-3.5" /> Desbanir
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => setUsuarioParaBanir(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-destructive/20 text-destructive hover:bg-destructive/10 px-3 py-1.5 text-xs font-semibold transition-colors"
                          >
                            <Ban className="size-3.5" /> Banir Conta
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal Banir Usuário */}
      {usuarioParaBanir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Ban className="size-5 text-destructive" />
              Banir Usuário
            </h3>
            <p className="text-xs text-muted-foreground">
              O banimento de <strong>{usuarioParaBanir.name}</strong> revogará imediatamente todas as sessões ativas e impedirá novos logins em qualquer clínica.
            </p>

            <form
              action={async (formData) => {
                await acaoBanir(formData);
                setUsuarioParaBanir(null);
              }}
              className="space-y-4"
            >
              <input type="hidden" name="userId" value={usuarioParaBanir.id} />
              <div>
                <label className="text-xs font-semibold text-foreground">Motivo do Banimento</label>
                <input
                  type="text"
                  name="motivo"
                  required
                  placeholder="Ex.: Fraude / Comportamento abusivo / Spam"
                  className="mt-1 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-hidden focus:ring-2 focus:ring-destructive/40"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUsuarioParaBanir(null)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendenteBanir}
                  className="rounded-xl bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:bg-destructive/90"
                >
                  {pendenteBanir ? "Banindo..." : "Confirmar Banimento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
