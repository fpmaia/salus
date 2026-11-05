"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { CabecalhoTimbrado, RodapeTimbrado } from "@/components/papel-timbrado";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  aplicarVariaveis,
  CABECALHO_PADRAO,
  LIMITE_TEXTO_TIMBRADO,
  RODAPE_PADRAO,
  VARIAVEIS_TIMBRADO,
  type Alinhamento,
  type DadosTimbrado,
} from "@/src/domain/papel-timbrado";
import type { EstadoAcao } from "@/src/server/acao";
import type { PapelTimbrado } from "@/src/server/documentos-personalizados";

const textarea =
  "min-h-20 w-full rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Acao = (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;

/** Editor do papel timbrado com prévia ao vivo (variáveis trocadas pelos dados reais). */
export function EditorPapelTimbrado({ papel, dados, acao }: { papel: PapelTimbrado; dados: DadosTimbrado; acao: Acao }) {
  const [cabecalho, setCabecalho] = useState(papel.cabecalho || CABECALHO_PADRAO);
  const [rodape, setRodape] = useState(papel.rodape || RODAPE_PADRAO);
  const [alinhamento, setAlinhamento] = useState<Alinhamento>(papel.alinhamento);
  const [mostrarLogo, setMostrarLogo] = useState(papel.mostrarLogo);
  const [logoNova, setLogoNova] = useState<string | null>(null);
  const [removerLogo, setRemoverLogo] = useState(false);
  const [erroLogo, setErroLogo] = useState<string | null>(null);
  const ultimoCampo = useRef<"cabecalho" | "rodape">("cabecalho");
  const refCabecalho = useRef<HTMLTextAreaElement>(null);
  const refRodape = useRef<HTMLTextAreaElement>(null);
  const refArquivo = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (logoNova && URL.revokeObjectURL(logoNova)), [logoNova]);

  const logoAtual = removerLogo ? null : (logoNova ?? papel.logo);

  function inserirVariavel(variavel: string) {
    const alvo = ultimoCampo.current === "cabecalho" ? refCabecalho.current : refRodape.current;
    const setar = ultimoCampo.current === "cabecalho" ? setCabecalho : setRodape;
    const valor = ultimoCampo.current === "cabecalho" ? cabecalho : rodape;
    const inicio = alvo?.selectionStart ?? valor.length;
    const fim = alvo?.selectionEnd ?? valor.length;
    setar(valor.slice(0, inicio) + variavel + valor.slice(fim));
    requestAnimationFrame(() => {
      alvo?.focus();
      alvo?.setSelectionRange(inicio + variavel.length, inicio + variavel.length);
    });
  }

  function escolherLogo(arquivo: File | undefined) {
    setErroLogo(null);
    if (!arquivo) return setLogoNova(null);
    if (!["image/png", "image/jpeg", "image/webp"].includes(arquivo.type)) {
      setErroLogo("Envie a logo em PNG, JPG ou WebP");
      if (refArquivo.current) refArquivo.current.value = "";
      return;
    }
    if (arquivo.size > 500 * 1024) {
      setErroLogo("A logo deve ter no máximo 500 KB");
      if (refArquivo.current) refArquivo.current.value = "";
      return;
    }
    setLogoNova(URL.createObjectURL(arquivo));
    setRemoverLogo(false);
    setMostrarLogo(true);
  }

  const previa = {
    cabecalho: aplicarVariaveis(cabecalho, dados).split("\n").filter(Boolean),
    rodape: aplicarVariaveis(rodape, dados).split("\n").filter(Boolean),
    alinhamento,
    logo: mostrarLogo ? logoAtual : null,
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <FormAcao acao={acao} textoBotao="Salvar papel timbrado" className="flex flex-col gap-5" aoConcluir={() => setLogoNova(null)}>
        <div className="flex flex-col gap-2">
          <Label>Logo (opcional)</Label>
          <div className="flex items-center gap-3 rounded-xl border border-dashed p-3">
            <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
              {logoAtual ? (
                // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:/data:)
                <img src={logoAtual} alt="Prévia da logo" className="max-h-full max-w-full object-contain" />
              ) : (
                <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <input
                ref={refArquivo}
                type="file"
                name="logo"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Arquivo da logo"
                onChange={(e) => escolherLogo(e.currentTarget.files?.[0])}
                className="text-xs file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-primary hover:file:bg-primary/20"
              />
              <p className="text-[11px] text-muted-foreground">PNG, JPG ou WebP até 500 KB. Fundo transparente fica melhor.</p>
              {erroLogo && <p className="text-xs text-destructive">{erroLogo}</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="mostrarLogo" checked={mostrarLogo} onChange={(e) => setMostrarLogo(e.currentTarget.checked)} disabled={!logoAtual} />
              Mostrar a logo nos documentos
            </label>
            {papel.logo && !logoNova && (
              <label className="flex items-center gap-2 text-destructive">
                <input type="checkbox" name="removerLogo" checked={removerLogo} onChange={(e) => setRemoverLogo(e.currentTarget.checked)} />
                <Trash2 className="size-3.5" aria-hidden /> Remover a logo
              </label>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pt-alinhamento">Disposição</Label>
          <NativeSelect id="pt-alinhamento" name="alinhamento" value={alinhamento} onChange={(e) => setAlinhamento(e.currentTarget.value as Alinhamento)}>
            <option value="centro">Centralizado (logo acima do texto)</option>
            <option value="esquerda">À esquerda (logo ao lado do texto)</option>
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pt-cabecalho">Cabeçalho</Label>
          <textarea
            ref={refCabecalho}
            id="pt-cabecalho"
            name="cabecalho"
            className={textarea}
            rows={3}
            maxLength={LIMITE_TEXTO_TIMBRADO}
            value={cabecalho}
            onFocus={() => (ultimoCampo.current = "cabecalho")}
            onChange={(e) => setCabecalho(e.currentTarget.value)}
          />
          <p className="text-[11px] text-muted-foreground">A primeira linha sai em destaque. Linhas sem dados são omitidas.</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="pt-rodape">Rodapé</Label>
          <textarea
            ref={refRodape}
            id="pt-rodape"
            name="rodape"
            className={textarea}
            rows={2}
            maxLength={LIMITE_TEXTO_TIMBRADO}
            value={rodape}
            onFocus={() => (ultimoCampo.current = "rodape")}
            onChange={(e) => setRodape(e.currentTarget.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Inserir variável no campo selecionado</span>
          <div className="flex flex-wrap gap-1.5">
            {VARIAVEIS_TIMBRADO.map(([variavel, descricao]) => (
              <button
                key={variavel}
                type="button"
                title={descricao}
                onClick={() => inserirVariavel(variavel)}
                className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground transition-colors hover:border-primary hover:bg-primary/10"
              >
                {variavel}
              </button>
            ))}
          </div>
        </div>
      </FormAcao>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Prévia</span>
        <div aria-label="Prévia do papel timbrado" className="flex min-h-96 flex-col gap-6 rounded-xl border bg-white p-6 text-neutral-900 shadow-sm">
          <CabecalhoTimbrado timbrado={previa} />
          <div className="flex flex-1 flex-col gap-2" aria-hidden>
            <div className="mx-auto h-3 w-1/3 rounded bg-neutral-200" />
            {[92, 100, 96, 88, 100, 70].map((w, i) => (
              <div key={i} className="h-2 rounded bg-neutral-100" style={{ width: `${w}%` }} />
            ))}
          </div>
          <RodapeTimbrado timbrado={previa} />
        </div>
      </div>
    </div>
  );
}
