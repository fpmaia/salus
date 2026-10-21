import Link from "next/link";
import { FormAcao } from "@/components/form-acao";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { listarEspera } from "@/src/server/lista-espera";
import { listarProfissionaisParaReserva } from "@/src/server/reservas";
import { CampoPaciente } from "../atendimentos/campo-paciente";
import { adicionarNaEsperaAcao, removerDaEsperaAcao } from "./actions";

const DATA_CURTA = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function EsperaPage() {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "agenda.gerenciar");
  const [itens, profissionais] = await Promise.all([listarEspera(ctx), listarProfissionaisParaReserva(ctx)]);

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_20rem]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Lista de espera ({itens.length})</CardTitle>
          <CardDescription>
            Por ordem de chegada. Quando um horário abre, essas pessoas aparecem em Atendimentos. Nada é enviado ao paciente
            automaticamente; ao agendar, ele sai da lista.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém esperando.</p>
          ) : (
            <ul className="divide-y">
              {itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span>
                    <Link href={`/painel/pacientes/${i.pacienteId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {i.pacienteNome}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[i.profissionalNome ?? "Qualquer profissional", i.pacienteTelefone, i.preferencia, `desde ${DATA_CURTA.format(i.criadoEm)}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <FormAcao acao={removerDaEsperaAcao.bind(null, i.id)} textoBotao="Remover" textoPendente="…" variante="outline" className="flex items-center gap-2" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Adicionar à espera</CardTitle>
        </CardHeader>
        <CardContent>
          <FormAcao acao={adicionarNaEsperaAcao} textoBotao="Adicionar" textoPendente="Adicionando…">
            <CampoPaciente />
            <div className="flex flex-col gap-2">
              <Label htmlFor="espera-profissional">Profissional</Label>
              <NativeSelect id="espera-profissional" name="profissionalId" defaultValue="">
                <option value="">Qualquer profissional</option>
                {profissionais.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="espera-preferencia">Preferência (opcional)</Label>
              <Input id="espera-preferencia" name="preferencia" maxLength={200} placeholder="Ex.: terças à tarde" />
            </div>
          </FormAcao>
        </CardContent>
      </Card>
    </main>
  );
}
