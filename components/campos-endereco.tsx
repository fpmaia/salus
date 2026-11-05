"use client";

import { useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { InputMascara } from "@/components/input-mascara";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { UFS, type Endereco, type EnderecoDoCep } from "@/src/domain/endereco";

type Campo = "cep" | "logradouro" | "numero" | "complemento" | "bairro" | "cidade" | "uf";

type Props = {
  /** Prefixo dos ids (vários formulários na mesma página). */
  prefixo: string;
  valores?: Endereco;
  /** Nome do campo no FormData, quando difere do padrão (ex.: paciente grava o logradouro em "endereco"). */
  nomes?: Partial<Record<Campo, string>>;
};

type Estado = { tipo: "ocioso" } | { tipo: "buscando" } | { tipo: "ok" } | { tipo: "erro"; mensagem: string };

/**
 * Endereço com busca pelo CEP: ao completar os 8 dígitos, preenche rua, bairro, cidade e UF
 * e leva o cursor ao número. Tudo continua editável; se o CEP não for encontrado, preenche à mão.
 */
export function CamposEndereco({ prefixo, valores = {}, nomes = {} }: Props) {
  const id = (c: Campo) => `${prefixo}-${c}`;
  const nome = (c: Campo) => nomes[c] ?? c;
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });
  const ultimoCep = useRef<string>((valores.cep ?? "").replace(/\D/g, ""));
  const refLogradouro = useRef<HTMLInputElement>(null);
  const refNumero = useRef<HTMLInputElement>(null);
  const refBairro = useRef<HTMLInputElement>(null);
  const refCidade = useRef<HTMLInputElement>(null);
  const refUf = useRef<HTMLSelectElement>(null);

  async function aoDigitarCep(valor: string) {
    const digitos = valor.replace(/\D/g, "");
    if (digitos.length !== 8) {
      if (estado.tipo !== "ocioso") setEstado({ tipo: "ocioso" });
      return;
    }
    if (digitos === ultimoCep.current) return;
    ultimoCep.current = digitos;
    setEstado({ tipo: "buscando" });
    try {
      const resposta = await fetch(`/api/cep/${digitos}`, { headers: { Accept: "application/json" } });
      if (ultimoCep.current !== digitos) return; // digitou outro CEP no meio do caminho
      const corpo = (await resposta.json().catch(() => ({}))) as Partial<EnderecoDoCep> & { erro?: string };
      if (!resposta.ok) {
        setEstado({
          tipo: "erro",
          mensagem:
            resposta.status === 404 ? "CEP não encontrado. Preencha o endereço manualmente." : (corpo.erro ?? "Não foi possível buscar o CEP agora."),
        });
        return;
      }
      const preencher = (ref: React.RefObject<HTMLInputElement | HTMLSelectElement | null>, v?: string) => {
        if (ref.current && v) ref.current.value = v;
      };
      preencher(refLogradouro, corpo.logradouro);
      preencher(refBairro, corpo.bairro);
      preencher(refCidade, corpo.cidade);
      preencher(refUf, corpo.uf);
      setEstado({ tipo: "ok" });
      // CEP geral da cidade (sem rua): o cursor vai para a rua; senão, direto ao número.
      (corpo.logradouro ? refNumero : refLogradouro).current?.focus();
    } catch {
      setEstado({ tipo: "erro", mensagem: "Não foi possível buscar o CEP agora. Preencha manualmente." });
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={id("cep")}>CEP</Label>
        <div className="relative">
          <InputMascara
            mascara="cep"
            id={id("cep")}
            name={nome("cep")}
            placeholder="00000-000"
            autoComplete="postal-code"
            defaultValue={valores.cep ?? ""}
            aria-describedby={`${id("cep")}-status`}
            onChange={(e) => void aoDigitarCep(e.currentTarget.value)}
            className="pr-8"
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-muted-foreground">
            {estado.tipo === "buscando" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <MapPin className="size-4" aria-hidden />}
          </span>
        </div>
        <p
          id={`${id("cep")}-status`}
          aria-live="polite"
          className={estado.tipo === "erro" ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {estado.tipo === "buscando"
            ? "Buscando endereço…"
            : estado.tipo === "ok"
              ? "Endereço preenchido pelo CEP."
              : estado.tipo === "erro"
                ? estado.mensagem
                : "Digite o CEP para preencher o endereço."}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:col-span-4">
        <Label htmlFor={id("logradouro")}>Rua / logradouro</Label>
        <Input ref={refLogradouro} id={id("logradouro")} name={nome("logradouro")} autoComplete="address-line1" defaultValue={valores.logradouro ?? ""} />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={id("numero")}>Número</Label>
        <Input ref={refNumero} id={id("numero")} name={nome("numero")} placeholder="S/N" defaultValue={valores.numero ?? ""} />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-4">
        <Label htmlFor={id("complemento")}>Complemento (opcional)</Label>
        <Input id={id("complemento")} name={nome("complemento")} placeholder="Sala, bloco, apto…" autoComplete="address-line2" defaultValue={valores.complemento ?? ""} />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor={id("bairro")}>Bairro</Label>
        <Input ref={refBairro} id={id("bairro")} name={nome("bairro")} defaultValue={valores.bairro ?? ""} />
      </div>
      <div className="flex flex-col gap-2 sm:col-span-3">
        <Label htmlFor={id("cidade")}>Cidade</Label>
        <Input ref={refCidade} id={id("cidade")} name={nome("cidade")} autoComplete="address-level2" defaultValue={valores.cidade ?? ""} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={id("uf")}>UF</Label>
        <NativeSelect ref={refUf} id={id("uf")} name={nome("uf")} autoComplete="address-level1" defaultValue={(valores.uf ?? "").toUpperCase()}>
          <option value="">—</option>
          {UFS.map((uf) => (
            <option key={uf} value={uf}>
              {uf}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}
