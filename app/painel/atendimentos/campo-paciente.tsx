"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buscarPacientesAcao, cadastroRapidoPacienteAcao, type PacienteEncontrado } from "../pacientes/actions";

/**
 * Seletor de paciente com busca (nome, telefone ou CPF) e cadastro rápido no próprio
 * agendamento. Envia o escolhido no campo `name` (oculto).
 */
export function CampoPaciente({ name = "pacienteId", label = "Paciente" }: { name?: string; label?: string }) {
  const id = useId();
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<PacienteEncontrado[]>([]);
  const [escolhido, setEscolhido] = useState<PacienteEncontrado | null>(null);
  const [novo, setNovo] = useState<{ nome: string; telefone: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [buscando, iniciarBusca] = useTransition();
  const [salvando, iniciarCadastro] = useTransition();

  useEffect(() => {
    if (escolhido) return;
    const t = setTimeout(() => {
      iniciarBusca(async () => setResultados(await buscarPacientesAcao(termo)));
    }, 250);
    return () => clearTimeout(t);
  }, [termo, escolhido]);

  // O formulário do agendamento é resetado depois de agendar: volta ao estado inicial.
  useEffect(() => {
    const form = document.getElementById(id)?.closest("form");
    const limpar = () => {
      setEscolhido(null);
      setTermo("");
      setNovo(null);
    };
    form?.addEventListener("reset", limpar);
    return () => form?.removeEventListener("reset", limpar);
  }, [id]);

  function cadastrar() {
    if (!novo) return;
    setErro(null);
    iniciarCadastro(async () => {
      const r = await cadastroRapidoPacienteAcao(novo.nome, novo.telefone);
      if (!r.ok) return setErro(r.erro);
      setEscolhido(r.paciente);
      setNovo(null);
    });
  }

  return (
    <div className="flex flex-col gap-2" id={id}>
      <Label htmlFor={`${id}-busca`}>{label}</Label>
      <input type="hidden" name={name} value={escolhido?.id ?? ""} />
      {escolhido ? (
        <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            <span className="font-medium">{escolhido.nome}</span>
            {escolhido.detalhe && <span className="block text-xs text-muted-foreground">{escolhido.detalhe}</span>}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setEscolhido(null)}>
            Trocar
          </Button>
        </div>
      ) : novo ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground">Cadastro rápido (complete depois na ficha)</p>
          <Label htmlFor={`${id}-nome`} className="text-xs">
            Nome do paciente
          </Label>
          <Input id={`${id}-nome`} value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} maxLength={120} />
          <Label htmlFor={`${id}-telefone`} className="text-xs">
            Telefone (WhatsApp)
          </Label>
          <Input
            id={`${id}-telefone`}
            value={novo.telefone}
            onChange={(e) => setNovo({ ...novo, telefone: e.target.value })}
            inputMode="tel"
            maxLength={30}
            placeholder="(11) 99999-0000"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={cadastrar} disabled={salvando}>
              {salvando ? "Cadastrando…" : "Cadastrar e escolher"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setNovo(null)}>
              Voltar à busca
            </Button>
          </div>
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>
      ) : (
        <>
          <Input
            id={`${id}-busca`}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por nome, telefone ou CPF"
            autoComplete="off"
            role="combobox"
            aria-expanded={resultados.length > 0}
            aria-controls={`${id}-lista`}
          />
          <ul id={`${id}-lista`} role="listbox" aria-label="Pacientes encontrados" className="flex flex-col rounded-md border divide-y text-sm">
            {resultados.map((p) => (
              <li key={p.id} role="option" aria-selected={false}>
                <button type="button" className="w-full px-3 py-1.5 text-left hover:bg-muted" onClick={() => setEscolhido(p)}>
                  <span className="font-medium">{p.nome}</span>
                  {p.detalhe && <span className="block text-xs text-muted-foreground">{p.detalhe}</span>}
                </button>
              </li>
            ))}
            {!buscando && resultados.length === 0 && (
              <li className="px-3 py-1.5 text-xs text-muted-foreground">{termo ? "Nenhum paciente encontrado." : "Nenhum paciente cadastrado."}</li>
            )}
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-primary hover:bg-muted"
                onClick={() => setNovo({ nome: /\d/.test(termo) ? "" : termo, telefone: /\d/.test(termo) ? termo : "" })}
              >
                + Novo paciente{termo && !/\d/.test(termo) ? ` “${termo}”` : ""}
              </button>
            </li>
          </ul>
        </>
      )}
    </div>
  );
}
