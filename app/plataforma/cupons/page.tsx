import { Ticket } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { formatarMoeda } from "@/src/domain/dinheiro";
import { listarPlanosDisponiveis } from "@/src/server/plataforma";
import { listarCupons } from "@/src/server/plataforma-financeiro";
import { formatarDataBr } from "@/src/server/reservas";
import { acessoPlataforma } from "../acesso";
import { alternarCupomAcao, criarCupomAcao } from "./actions";

export default async function CuponsPlataformaPage() {
  const { usuario, pode } = await acessoPlataforma();
  const podeEditar = pode("financeiro.gerenciar");
  const [cupons, planos] = await Promise.all([listarCupons(usuario.id), listarPlanosDisponiveis(usuario.id)]);
  const nomePlano = new Map(planos.map((p) => [p.id, p.nome]));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
          <Ticket className="size-6 text-primary" /> Cupons de desconto
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A clínica digita o cupom no cadastro ou na tela Assinatura (ou ele vem no convite de teste). O desconto vale a partir da próxima
          fatura, pelo número de meses do cupom. Um cupom ativo por clínica.
        </p>
      </div>

      {podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo cupom</CardTitle>
            <CardDescription>Código em maiúsculas, sem espaço. Deixe em branco o que não tiver limite.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormAcao acao={criarCupomAcao} textoBotao="Criar cupom" className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-codigo">Código</Label>
                  <Input id="cp-codigo" name="codigo" required maxLength={30} placeholder="BEMVINDO20" className="uppercase" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-tipo">Tipo</Label>
                  <NativeSelect id="cp-tipo" name="tipo" defaultValue="percentual">
                    <option value="percentual">Percentual (%)</option>
                    <option value="valor">Valor fixo (R$/mês)</option>
                  </NativeSelect>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-valor">Valor</Label>
                  <Input id="cp-valor" name="valor" required inputMode="decimal" placeholder="20" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-duracao">Duração (meses)</Label>
                  <Input id="cp-duracao" name="duracaoMeses" type="number" min={1} max={120} placeholder="Sem fim" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-validade">Aceito até</Label>
                  <Input id="cp-validade" name="validoAte" type="date" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="cp-usos">Limite de usos</Label>
                  <Input id="cp-usos" name="maxUsos" type="number" min={1} placeholder="Sem limite" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cp-desc">Descrição interna</Label>
                <Input id="cp-desc" name="descricao" maxLength={200} placeholder="Ex.: feira de saúde out/2026" />
              </div>
              <fieldset className="flex flex-wrap gap-3 text-sm">
                <legend className="mb-1 text-xs text-muted-foreground">Vale nos planos (nenhum marcado = todos)</legend>
                {planos.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5">
                    <input type="checkbox" name="planosIds" value={p.id} /> {p.nome}
                  </label>
                ))}
              </fieldset>
            </FormAcao>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cupons ({cupons.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {cupons.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cupom ainda.</p>
          ) : (
            <ul className="divide-y text-sm">
              {cupons.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs font-bold">{c.codigo}</code>
                      <strong>{c.tipo === "percentual" ? `${c.valor}%` : `${formatarMoeda(c.valor)}/mês`}</strong>
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${c.ativo ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {c.ativo ? "Ativo" : "Desativado"}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.duracaoMeses ? `${c.duracaoMeses} ${c.duracaoMeses === 1 ? "mês" : "meses"}` : "sem fim"} · {c.usos}
                      {c.maxUsos ? `/${c.maxUsos}` : ""} usos
                      {c.validoAte ? ` · aceito até ${formatarDataBr(c.validoAte)}` : ""}
                      {c.planosIds?.length ? ` · ${c.planosIds.map((id) => nomePlano.get(id) ?? "plano inativo").join(", ")}` : " · todos os planos"}
                      {c.descricao ? ` · ${c.descricao}` : ""}
                    </span>
                  </div>
                  {podeEditar && (
                    <FormAcao
                      acao={alternarCupomAcao.bind(null, c.id, !c.ativo)}
                      textoBotao={c.ativo ? "Desativar" : "Reativar"}
                      textoPendente="…"
                      variante="outline"
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
