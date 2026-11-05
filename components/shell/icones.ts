import {
  Activity,
  Bell,
  Building2,
  CalendarCheck,
  CalendarDays,
  CircleDollarSign,
  CreditCard,
  DollarSign,
  FileSignature,
  FileText,
  Gift,
  Globe,
  Hourglass,
  Layers,
  LayoutDashboard,
  Receipt,
  Shield,
  Stamp,
  Ticket,
  User,
  UserCheck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// Ícone de cada rota do menu (fica no cliente: componentes não atravessam a fronteira server→client).
export const ICONES_ROTA: Record<string, LucideIcon> = {
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
  "/painel/documentos": Stamp,
  "/painel/notificacoes": Bell,
  "/painel/assinatura": CreditCard,
  "/painel/perfil": User,
  "/plataforma": LayoutDashboard,
  "/plataforma/clinicas": Building2,
  "/plataforma/financeiro": DollarSign,
  "/plataforma/cupons": Ticket,
  "/plataforma/convites": Gift,
  "/plataforma/planos": Layers,
  "/plataforma/usuarios": Users,
  "/plataforma/equipe": UserCog,
  "/plataforma/auditoria": Activity,
};

export const iconeDaRota = (href: string): LucideIcon => ICONES_ROTA[href] ?? Shield;

/** Rota ativa: a raiz da área só quando exata; as demais também nas subpáginas. */
export function rotaAtiva(href: string, pathname: string, raiz: string): boolean {
  return href === raiz ? pathname === raiz : pathname === href || pathname.startsWith(`${href}/`);
}
