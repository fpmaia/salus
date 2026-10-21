import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Valores = {
  nome?: string;
  cpf?: string | null;
  dataNascimento?: string | null;
  telefone?: string | null;
  email?: string | null;
  consentimentoLembretes?: boolean;
  responsavelNome?: string | null;
  responsavelCpf?: string | null;
  responsavelParentesco?: string | null;
  convenioNome?: string | null;
  convenioCarteirinha?: string | null;
  cep?: string | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
};

export function formatarCpf(cpf: string | null): string {
  if (!cpf) return "";
  return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
}

export function formatarCep(cep: string | null): string {
  if (!cep) return "";
  return cep.replace(/^(\d{5})(\d{3})$/, "$1-$2");
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
      <details className="rounded-md border p-3" open={Boolean(valores.responsavelNome || valores.convenioNome || valores.endereco)}>
        <summary className="cursor-pointer text-sm font-medium">Responsável, convênio e endereço</summary>
        <div className="mt-3 flex flex-col gap-4">
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Responsável legal (obrigatório para menores de 18)</legend>
            <div className="flex flex-col gap-2">
              <Label htmlFor={campo("responsavelNome")}>Nome do responsável</Label>
              <Input id={campo("responsavelNome")} name="responsavelNome" defaultValue={valores.responsavelNome ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={campo("responsavelCpf")}>CPF do responsável</Label>
              <Input id={campo("responsavelCpf")} name="responsavelCpf" inputMode="numeric" defaultValue={formatarCpf(valores.responsavelCpf ?? null)} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={campo("responsavelParentesco")}>Parentesco</Label>
              <Input id={campo("responsavelParentesco")} name="responsavelParentesco" placeholder="Mãe, pai, tutor…" defaultValue={valores.responsavelParentesco ?? ""} />
            </div>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Convênio (só para registro)</legend>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor={campo("convenioNome")}>Convênio</Label>
              <Input id={campo("convenioNome")} name="convenioNome" defaultValue={valores.convenioNome ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={campo("convenioCarteirinha")}>Nº da carteirinha</Label>
              <Input id={campo("convenioCarteirinha")} name="convenioCarteirinha" defaultValue={valores.convenioCarteirinha ?? ""} />
            </div>
          </fieldset>
          <fieldset className="grid gap-3 sm:grid-cols-6">
            <legend className="mb-1 text-xs font-medium text-muted-foreground">Endereço</legend>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor={campo("cep")}>CEP</Label>
              <Input id={campo("cep")} name="cep" inputMode="numeric" defaultValue={formatarCep(valores.cep ?? null)} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-4">
              <Label htmlFor={campo("endereco")}>Rua, número e complemento</Label>
              <Input id={campo("endereco")} name="endereco" defaultValue={valores.endereco ?? ""} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor={campo("bairro")}>Bairro</Label>
              <Input id={campo("bairro")} name="bairro" defaultValue={valores.bairro ?? ""} />
            </div>
            <div className="flex flex-col gap-2 sm:col-span-3">
              <Label htmlFor={campo("cidade")}>Cidade</Label>
              <Input id={campo("cidade")} name="cidade" defaultValue={valores.cidade ?? ""} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={campo("uf")}>UF</Label>
              <Input id={campo("uf")} name="uf" maxLength={2} defaultValue={valores.uf ?? ""} className="uppercase" />
            </div>
          </fieldset>
        </div>
      </details>
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
