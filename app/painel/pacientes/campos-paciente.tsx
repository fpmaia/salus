import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Valores = {
  nome?: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  consentimentoLembretes?: boolean;
};

export function formatarCpf(cpf: string | null): string {
  if (!cpf) return "";
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export function CamposPaciente({ valores = {}, prefixo }: { valores?: Valores; prefixo: string }) {
  const campo = (nome: string) => `${prefixo}-${nome}`;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor={campo("nome")}>Nome</Label>
          <Input id={campo("nome")} name="nome" defaultValue={valores.nome} required />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={campo("cpf")}>CPF (opcional)</Label>
          <Input id={campo("cpf")} name="cpf" inputMode="numeric" defaultValue={formatarCpf(valores.cpf ?? null)} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={campo("telefone")}>Telefone / WhatsApp</Label>
          <Input id={campo("telefone")} name="telefone" type="tel" defaultValue={valores.telefone ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={campo("email")}>E-mail</Label>
          <Input id={campo("email")} name="email" type="email" defaultValue={valores.email ?? ""} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={campo("dataNascimento")}>Nascimento</Label>
          <Input id={campo("dataNascimento")} name="dataNascimento" type="date" defaultValue={valores.dataNascimento ?? ""} />
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="consentimentoLembretes" defaultChecked={valores.consentimentoLembretes} className="mt-1" />
        <span>
          Paciente autoriza receber lembretes e confirmações de consulta por WhatsApp
          <span className="block text-xs text-muted-foreground">Registramos a data do consentimento (LGPD).</span>
        </span>
      </label>
    </>
  );
}
