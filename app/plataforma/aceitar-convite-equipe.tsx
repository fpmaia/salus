import { UserCog } from "lucide-react";
import { FormAcao } from "@/components/form-acao";
import { SalusLogo } from "@/components/brand/salus-logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DESCRICOES_PAPEL_PLATAFORMA, ROTULOS_PAPEL_PLATAFORMA, type PapelPlataforma } from "@/src/domain/permissoes-plataforma";
import { aceitarConviteEquipeAcao } from "./equipe/actions";

/** Quem entrou com o e-mail convidado para a equipe Salus aceita aqui. */
export function AceitarConviteEquipe({ convite }: { convite: { id: string; papel: PapelPlataforma; convidadoPor: string | null } }) {
  return (
    <main className="flex min-h-[80vh] flex-1 flex-col items-center justify-center gap-6 bg-muted/40 px-4 py-16">
      <SalusLogo href="/" size="lg" priority />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <UserCog className="size-5" />
          </div>
          <CardTitle>Convite para a equipe da plataforma</CardTitle>
          <CardDescription>
            {convite.convidadoPor ? `${convite.convidadoPor} convidou você` : "Você foi convidado"} para administrar a plataforma Salus com o
            papel <strong className="text-foreground">{ROTULOS_PAPEL_PLATAFORMA[convite.papel]}</strong>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <p className="text-muted-foreground">{DESCRICOES_PAPEL_PLATAFORMA[convite.papel]}</p>
          <p className="text-muted-foreground">Depois de aceitar, será pedida a verificação em duas etapas.</p>
          <FormAcao acao={aceitarConviteEquipeAcao.bind(null, convite.id)} textoBotao="Aceitar convite" textoPendente="Entrando…" />
        </CardContent>
      </Card>
    </main>
  );
}
