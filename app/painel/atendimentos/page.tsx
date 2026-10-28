import { redirect } from "next/navigation";

export default async function AtendimentosPage({ searchParams }: PageProps<"/painel/atendimentos">) {
  const p = await searchParams;
  const q = new URLSearchParams();
  q.set("visao", "lista");
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string" && v) q.set(k, v);
  }
  redirect(`/painel/agenda?${q.toString()}`);
}
