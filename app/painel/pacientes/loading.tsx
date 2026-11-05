import { EsqueletoCabecalho, EsqueletoTabela } from "@/components/esqueletos";

export default function PacientesLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Carregando pacientes">
      <EsqueletoCabecalho comAcao />
      <EsqueletoTabela />
    </div>
  );
}
