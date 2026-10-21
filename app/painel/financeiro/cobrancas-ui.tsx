import { InputMascara } from "@/components/input-mascara";
import { FormAcao } from "@/components/form-acao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { cobrancasProfissional } from "@/src/db/schema";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { formatarDataBr } from "@/src/server/reservas";
import { cancelarCobrancaAcao, criarCobrancaAcao, reenviarCobrancaAcao, simularPagamentoAcao } from "./actions";

type Cobranca = typeof cobrancasProfissional.$inferSelect;

const STATUS: Record<Cobranca["status"], { rotulo: string; classe: string }> = {
  pendente: { rotulo: "Em aberto", classe: "bg-muted" },
  vencida: { rotulo: "Vencida", classe: "bg-destructive/15 text-destructive" },
  paga: { rotulo: "Paga", classe: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-400" },
  estornada: { rotulo: "Estornada", classe: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  cancelada: { rotulo: "Cancelada", classe: "bg-muted text-muted-foreground line-through" },
  erro: { rotulo: "Erro no envio", classe: "bg-destructive/15 text-destructive" },
};

const FORMAS: Record<Cobranca["forma"], string> = { PIX: "PIX", BOLETO: "Boleto", UNDEFINED: "PIX, boleto ou cartão" };

/** Lista de cobranças; `gerenciar` mostra cancelar/reenviar/simular (equipe). */
export function ListaCobrancas({ cobrancas, gerenciar }: { cobrancas: Cobranca[]; gerenciar: boolean }) {
  if (cobrancas.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma cobrança.</p>;
  return (
    <ul className="divide-y text-sm">
      {cobrancas.map((c) => {
        const aberta = c.status === "pendente" || c.status === "vencida";
        return (
          <li key={c.id} className="flex flex-col gap-2 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {formatarMoeda(c.valorCentavos)} · vence {formatarDataBr(c.vencimento)}
                <span className="block text-xs text-muted-foreground">
                  {FORMAS[c.forma]}
                  {c.ambiente !== "producao" && ` · ${c.ambiente}`}
                  {c.ultimoErro && ` · ${c.ultimoErro}`}
                </span>
              </span>
              <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${STATUS[c.status].classe}`}>{STATUS[c.status].rotulo}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {c.invoiceUrl && aberta && (
                <a href={c.invoiceUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  Link de pagamento
                </a>
              )}
              {c.bankSlipUrl && aberta && (
                <a href={c.bankSlipUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                  Boleto (PDF)
                </a>
              )}
              {gerenciar && c.status === "erro" && (
                <FormAcao acao={reenviarCobrancaAcao.bind(null, c.id)} textoBotao="Reenviar" textoPendente="…" variante="outline" className="flex items-center gap-2" />
              )}
              {gerenciar && c.ambiente === "simulado" && aberta && (
                <FormAcao acao={simularPagamentoAcao.bind(null, c.id)} textoBotao="Simular pagamento" textoPendente="…" variante="outline" className="flex items-center gap-2" />
              )}
              {gerenciar && (aberta || c.status === "erro") && (
                <FormAcao
                  acao={cancelarCobrancaAcao.bind(null, c.id)}
                  textoBotao="Cancelar"
                  textoPendente="…"
                  variante="destructive"
                  confirmar="Cancelar esta cobrança?"
                  className="flex items-center gap-2"
                />
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Formulário de nova cobrança (valor sugerido = saldo devedor). */
export function FormCobranca({ profissionalId, competencia, valorSugerido }: { profissionalId: string; competencia: string; valorSugerido: number }) {
  return (
    <FormAcao acao={criarCobrancaAcao.bind(null, profissionalId, competencia)} textoBotao="Gerar cobrança" textoPendente="Enviando…">
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cb-valor">Valor (R$)</Label>
          <InputMascara
            mascara="moeda"
            id="cb-valor"
            name="valor"
            required
            defaultValue={valorSugerido > 0 ? (valorSugerido / 100).toFixed(2).replace(".", ",") : ""}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cb-vencimento">Vencimento</Label>
          <Input id="cb-vencimento" name="vencimento" type="date" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cb-forma">Forma</Label>
          <NativeSelect id="cb-forma" name="forma" defaultValue="UNDEFINED">
            <option value="UNDEFINED">Profissional escolhe</option>
            <option value="PIX">PIX</option>
            <option value="BOLETO">Boleto</option>
          </NativeSelect>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Sem vencimento, usa o prazo padrão da configuração. O pagamento confirmado baixa o saldo automaticamente.</p>
    </FormAcao>
  );
}
