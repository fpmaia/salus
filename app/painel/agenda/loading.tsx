import { EsqueletoCabecalho, EsqueletoGrade } from "@/components/esqueletos";

export default function AgendaLoading() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6" aria-busy="true" aria-label="Carregando agenda">
      <EsqueletoCabecalho comAcao />
      <EsqueletoGrade />
    </div>
  );
}
