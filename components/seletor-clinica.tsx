"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import Link from "next/link";
import { Building2, ChevronDown, Check, Plus, Sparkles, Loader2 } from "lucide-react";
import { ROTULOS_ROLE, type Role } from "@/src/domain/rbac";
import { alternarClinicaAcao } from "@/app/painel/actions";

interface SeletorClinicaProps {
  clinicaAtualId: string;
  clinicaAtualNome: string;
  roleAtual: Role;
  todasClinicas: Array<{ tenantId: string; tenantNome: string; role: Role }>;
}

function CorBadgePapel(role: Role) {
  switch (role) {
    case "admin":
      return "bg-primary/10 text-primary border-primary/20";
    case "profissional":
      return "bg-success/10 text-success border-success/20";
    case "recepcao":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

export function SeletorClinica({
  clinicaAtualId,
  clinicaAtualNome,
  roleAtual,
  todasClinicas,
}: SeletorClinicaProps) {
  const [aberto, setAberto] = useState(false);
  const [isPending, startTransition] = useTransition();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleTrocarClinica = (novoTenantId: string) => {
    if (novoTenantId === clinicaAtualId || isPending) return;
    setAberto(false);
    startTransition(async () => {
      await alternarClinicaAcao(novoTenantId);
    });
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão Gatilho */}
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        disabled={isPending}
        className="group flex items-center gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-1.5 text-left transition-all hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/20"
        title="Alternar clínica ativa"
      >
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/20">
          {isPending ? (
            <Loader2 className="size-4 animate-spin text-primary" />
          ) : (
            <Building2 className="size-4" />
          )}
        </div>

        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5">
            <span className="max-w-[140px] truncate font-heading text-xs font-semibold text-foreground sm:max-w-[200px]">
              {clinicaAtualNome}
            </span>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold leading-none ${CorBadgePapel(
                roleAtual
              )}`}
            >
              {ROTULOS_ROLE[roleAtual]}
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {todasClinicas.length > 1
              ? `${todasClinicas.length} clínicas vinculadas`
              : "Clínica ativa"}
          </span>
        </div>

        <ChevronDown
          className={`size-3.5 text-muted-foreground/70 transition-transform duration-200 ${
            aberto ? "rotate-180 text-foreground" : "group-hover:text-foreground"
          }`}
        />
      </button>

      {/* Menu Dropdown */}
      {aberto && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-2xl border border-border/80 bg-background/95 p-1.5 shadow-xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95">
          <div className="px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Minhas Clínicas
            </p>
            <p className="text-xs text-muted-foreground">
              Selecione o espaço para visualizar e gerenciar
            </p>
          </div>

          <div className="my-1 h-px bg-border/60" />

          {/* Lista de Clínicas */}
          <div className="max-h-56 space-y-1 overflow-y-auto pr-0.5">
            {todasClinicas.map((clinica) => {
              const selecionada = clinica.tenantId === clinicaAtualId;
              return (
                <button
                  key={clinica.tenantId}
                  type="button"
                  onClick={() => handleTrocarClinica(clinica.tenantId)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-all ${
                    selecionada
                      ? "bg-primary/10 font-medium text-primary shadow-xs"
                      : "text-foreground hover:bg-muted/60"
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <div
                      className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${
                        selecionada
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <Building2 className="size-3.5" />
                    </div>
                    <div className="truncate">
                      <p className="truncate font-medium">{clinica.tenantNome}</p>
                      <span
                        className={`inline-block rounded-md border px-1.5 py-0.2 text-[9px] font-medium ${CorBadgePapel(
                          clinica.role
                        )}`}
                      >
                        {ROTULOS_ROLE[clinica.role]}
                      </span>
                    </div>
                  </div>

                  {selecionada && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>

          <div className="my-1.5 h-px bg-border/60" />

          {/* Link para Cadastrar Nova Clínica / Upgrade */}
          <Link
            href="/painel/assinatura?upgrade=multi-clinica"
            onClick={() => setAberto(false)}
            className="flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-2.5 py-2 text-xs font-medium text-primary transition-all hover:border-primary/60 hover:bg-primary/10"
          >
            <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Plus className="size-3.5" />
            </div>
            <div className="flex flex-col">
              <span className="flex items-center gap-1 font-semibold">
                Cadastrar nova clínica
                <Sparkles className="size-3 text-warning fill-warning" />
              </span>
              <span className="text-[10px] text-muted-foreground">
                Requer plano Multi-Clínicas
              </span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
