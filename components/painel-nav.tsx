"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  FileText,
  FileSignature,
  Globe,
  Hourglass,
  LayoutDashboard,
  Receipt,
  Shield,
  User,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "cn";

export interface ItemNavegacao {
  href: string;
  rotulo: string;
}

const ICONES: Record<string, React.ComponentType<{ className?: string }>> = {
  "/painel": LayoutDashboard,
  "/painel/atendimentos": CalendarCheck,
  "/painel/agenda": CalendarDays,
  "/painel/pacientes": Users,
  "/painel/espera": Hourglass,
  "/painel/prontuario": FileText,
  "/painel/agendamento-online": Globe,
  "/painel/contratos": FileSignature,
  "/painel/financeiro": CircleDollarSign,
  "/painel/fiscal": Receipt,
  "/painel/extrato": Wallet,
  "/painel/unidades": Building2,
  "/painel/profissionais": UserCheck,
  "/painel/equipe": Users,
  "/painel/notificacoes": Bell,
  "/painel/assinatura": CreditCard,
  "/painel/perfil": User,
  "/plataforma": Shield,
};

export function PainelNav({ itens }: { itens: ItemNavegacao[] }) {
  const pathname = usePathname();

  return (
    <nav className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-4 sm:px-6 py-1 scrollbar-none">
      {itens.map((item) => {
        const Icone = ICONES[item.href] || LayoutDashboard;
        const ativo =
          item.href === "/painel"
            ? pathname === "/painel"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all duration-150",
              ativo
                ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icone
              className={cn(
                "size-3.5 transition-transform group-hover:scale-105",
                ativo ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            <span>{item.rotulo}</span>
          </Link>
        );
      })}
    </nav>
  );
}
