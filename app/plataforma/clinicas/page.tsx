import { exigirUsuario } from "@/src/auth/sessao";
import {
  listarClinicasPlataforma,
  listarPlanosDisponiveis,
} from "@/src/server/plataforma";
import { TabelaClinicasPlataforma } from "./tabela-clinicas-plataforma";

export default async function PlataformaClinicasPage() {
  const usuario = await exigirUsuario();
  const [clinicas, planos] = await Promise.all([
    listarClinicasPlataforma(usuario.id),
    listarPlanosDisponiveis(usuario.id),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <TabelaClinicasPlataforma
        clinicas={clinicas}
        planos={planos.map((p) => ({
          id: p.id,
          codigo: p.codigo,
          nome: p.nome,
          precoMensalCentavos: p.precoMensalCentavos,
        }))}
      />
    </main>
  );
}
