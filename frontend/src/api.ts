export interface Filme {
  id: number;
  titulo: string;
  genero: string;
  duracaoMinutos: number;
  classificacao: string;
  sinopse: string | null;
  dataLancamento: string;
  emCartaz: boolean;
}
export interface Sessao {
  id: number;
  filmeId: number;
  tituloFilme: string;
  sala: string;
  dataHora: string;
  preco: number;
  capacidade: number;
}
export interface Reserva {
  id: number;
  sessaoId: number;
  tituloFilme: string;
  sala: string;
  dataHoraSessao: string;
  nomeCliente: string;
  email: string;
  quantidadeLugares: number;
  valorTotal: number;
  status: string;
  dataReserva: string;
}
export interface Disponibilidade {
  sessaoId: number;
  filmeId: number;
  tituloFilme: string;
  sala: string;
  dataHora: string;
  preco: number;
  capacidade: number;
  lugaresReservados: number;
  lugaresLivres: number;
  esgotada: boolean;
  jaComecou: boolean;
}
export type Modulo = "Filmes" | "Sessoes" | "Reservas";
export type Registro = Filme | Sessao | Reserva;
export interface Dados {
  filmes: Filme[];
  sessoes: Sessao[];
  reservas: Reserva[];
  vagas: Disponibilidade[];
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<T> {
  const response = await fetch("/api/" + path, {
    method,
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const erro = await response.json().catch(() => ({}));
    throw new Error(
      erro.mensagem ||
        Object.values(erro.errors || {})
          .flat()
          .join(" ") ||
        erro.title ||
        "Falha na API (HTTP " + response.status + ").",
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export async function carregar(): Promise<Dados> {
  const [filmes, sessoes, reservas, vagas] = await Promise.all([
    api<Filme[]>("Filmes"),
    api<Sessao[]>("Sessoes"),
    api<Reserva[]>("Reservas"),
    api<Disponibilidade[]>("Disponibilidade"),
  ]);
  return { filmes, sessoes, reservas, vagas };
}
export const horario = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
export const moeda = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export function dataLocal(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}
