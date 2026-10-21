/** Identidade do espaço nas páginas do paciente: a marca que ele conhece é a do espaço, não a do Salus. */
export function CabecalhoEspaco({ nome }: { nome: string }) {
  if (!nome) return null;
  const iniciais = nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="flex size-11 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground">
        {iniciais || nome[0].toUpperCase()}
      </span>
      <span className="text-lg font-semibold">{nome}</span>
    </div>
  );
}
