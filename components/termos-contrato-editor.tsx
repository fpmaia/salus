"use client";

import { useState } from "react";
import { FileText, RefreshCw, Eye, Edit3 } from "lucide-react";

interface TermosContratoEditorProps {
  valorInicial: string;
  nomeCampo?: string;
  aoSolicitarRegerar?: () => string | null;
}

export function TermosContratoEditor({
  valorInicial,
  nomeCampo = "termosContrato",
  aoSolicitarRegerar,
}: TermosContratoEditorProps) {
  const [termosEditados, setTermosEditados] = useState<string | null>(null);
  const [aba, setAba] = useState<"editar" | "previa">("editar");

  const termos = termosEditados ?? valorInicial;

  const handleRegerar = () => {
    if (aoSolicitarRegerar) {
      aoSolicitarRegerar();
    }
    setTermosEditados(null);
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border/80 bg-muted/20 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
        <div>
          <h4 className="font-heading text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="size-4 text-primary" />
            Minuta e Termos Editáveis do Contrato
          </h4>
          <p className="text-xs text-muted-foreground">
            Personalize as cláusulas contratuais, regras internas, penalidades e rescisão
          </p>
        </div>

        <div className="flex items-center gap-2">
          {aoSolicitarRegerar && (
            <button
              type="button"
              onClick={handleRegerar}
              className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
              title="Regerar minuta padrão preenchendo os campos atuais"
            >
              <RefreshCw className="size-3 text-muted-foreground" /> Preencher com Dados
            </button>
          )}

          <div className="flex rounded-lg border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setAba("editar")}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                aba === "editar"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Edit3 className="size-3" /> Editar
            </button>
            <button
              type="button"
              onClick={() => setAba("previa")}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                aba === "previa"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="size-3" /> Prévia
            </button>
          </div>
        </div>
      </div>

      <input type="hidden" name={nomeCampo} value={termos} />

      {aba === "editar" ? (
        <textarea
          value={termos}
          onChange={(e) => setTermosEditados(e.target.value)}
          rows={16}
          className="w-full rounded-xl border border-border bg-background p-3 font-mono text-xs text-foreground shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
          placeholder="Digite ou edite as cláusulas contratuais..."
        />
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded-xl border border-border bg-background p-5 text-xs text-foreground shadow-xs whitespace-pre-wrap font-sans leading-relaxed">
          {termos}
        </div>
      )}
    </div>
  );
}
