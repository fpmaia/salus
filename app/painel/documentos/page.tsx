import Link from "next/link";
import { FileText, Stamp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { exigirPermissaoNaPagina } from "@/src/auth/permissao";
import { obterContextoTenant } from "@/src/auth/sessao";
import { MODELOS_DOCUMENTOS } from "@/src/domain/modelos-documentos";
import {
  dadosDaPrevia,
  listarModelos,
  obterPapelTimbrado,
  type Escopo,
} from "@/src/server/documentos-personalizados";
import { ErroNegocio } from "@/src/server/erros";
import { modulosDoEspaco } from "@/src/server/modulos";
import { restaurarPapelTimbradoAcao, salvarPapelTimbradoAcao } from "./actions";
import { EditorPapelTimbrado } from "./editor-papel-timbrado";
import { GerenciarModelos } from "./gerenciar-modelos";
import { FormAcao } from "@/components/form-acao";

export default async function DocumentosPage({ searchParams }: PageProps<"/painel/documentos">) {
  const ctx = await obterContextoTenant();
  exigirPermissaoNaPagina(ctx.role, "documentos.personalizar");
  const { aba: abaBruta } = await searchParams;
  const escopo: Escopo = ctx.role === "admin" ? "clinica" : "meu";
  const modulos = await modulosDoEspaco(ctx);
  const aba = abaBruta === "modelos" && modulos.prontuario ? "modelos" : "timbrado";

  let papel, dados;
  try {
    [papel, dados] = await Promise.all([obterPapelTimbrado(ctx, escopo), dadosDaPrevia(ctx, escopo)]);
  } catch (erro) {
    if (!(erro instanceof ErroNegocio)) throw erro;
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Documentos e papel timbrado</h1>
        <p className="text-sm text-muted-foreground">{erro.message}. Peça ao admin do espaço para vincular seu usuário ao seu cadastro.</p>
      </main>
    );
  }

  const modelos = aba === "modelos" ? await listarModelos(ctx) : null;
  const sistema = MODELOS_DOCUMENTOS.filter((m) => m.id !== "em_branco").map((m) => ({
    id: `sistema-${m.id}`,
    nome: m.nome,
    descricao: m.descricao,
    titulo: m.titulo,
    anotacoes: m.anotacoes,
    prescricao: m.prescricao,
  }));

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documentos e papel timbrado</h1>
        <p className="text-sm text-muted-foreground">
          {escopo === "clinica"
            ? "Padrão da clínica para relatórios, laudos, atestados e recibos. Cada profissional pode ter o próprio papel timbrado e os próprios modelos."
            : "Seu papel timbrado e seus modelos. Sem papel timbrado próprio, seus documentos usam o da clínica."}
        </p>
      </div>

      {modulos.prontuario && (
        <nav aria-label="Seções" className="flex gap-1 self-start rounded-xl bg-muted p-1 text-sm">
          {(
            [
              ["timbrado", "Papel timbrado", Stamp],
              ["modelos", "Modelos de documento", FileText],
            ] as const
          ).map(([id, rotulo, Icone]) => (
            <Link
              key={id}
              href={id === "timbrado" ? "/painel/documentos" : "/painel/documentos?aba=modelos"}
              aria-current={aba === id ? "page" : undefined}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition ${
                aba === id ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icone className="size-4" /> {rotulo}
            </Link>
          ))}
        </nav>
      )}

      {aba === "timbrado" ? (
        <Card>
          <CardHeader>
            <CardTitle>{escopo === "clinica" ? "Papel timbrado da clínica" : "Meu papel timbrado"}</CardTitle>
            <CardDescription>
              {papel.personalizado
                ? "Personalizado. Vale para os documentos impressos a partir de agora."
                : escopo === "meu"
                  ? "Você ainda segue o papel timbrado da clínica. Ao salvar, passa a usar o seu."
                  : "Usando o padrão do sistema."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <EditorPapelTimbrado papel={papel} dados={dados} acao={salvarPapelTimbradoAcao.bind(null, escopo)} />
            {papel.personalizado && (
              <FormAcao
                acao={restaurarPapelTimbradoAcao.bind(null, escopo)}
                textoBotao={escopo === "meu" ? "Voltar a usar o da clínica" : "Restaurar o padrão"}
                textoPendente="Restaurando…"
                variante="outline"
                confirmar="Descartar o papel timbrado personalizado (inclusive a logo)?"
              />
            )}
          </CardContent>
        </Card>
      ) : (
        modelos && (
          <Card>
            <CardHeader>
              <CardTitle>Modelos de documento</CardTitle>
              <CardDescription>
                Aparecem no prontuário ao criar um documento. Você ajusta o texto antes de finalizar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <GerenciarModelos
                escopo={escopo}
                editaveis={escopo === "clinica" ? modelos.clinica : modelos.meus}
                referencias={[
                  ...(escopo === "meu" ? [{ grupo: "Modelos da clínica", modelos: modelos.clinica }] : []),
                  { grupo: "Modelos do sistema", modelos: sistema },
                ]}
              />
            </CardContent>
          </Card>
        )
      )}
    </main>
  );
}
