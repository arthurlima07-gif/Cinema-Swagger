import { useState } from "react";
import type { Dados, Filme, Sessao, Reserva, Modulo, Registro } from "./api";
import { dataLocal, horario, moeda } from "./api";

export function Editor({
  modulo,
  item,
  dados,
  sessaoInicial,
  filmeInicial,
  salvar,
  ocupado,
}: {
  modulo: Modulo;
  item?: Registro;
  dados: Dados;
  sessaoInicial?: number;
  filmeInicial?: number;
  salvar: (obj: object) => void;
  ocupado: boolean;
}) {
  const filme = item as Filme | undefined,
    sessao = item as Sessao | undefined,
    reserva = item as Reserva | undefined;
  const [sid, selecionar] = useState(
    String(reserva?.sessaoId || sessaoInicial || ""),
  );
  const vaga = dados.vagas.find((v) => String(v.sessaoId) === sid);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget),
          str = (k: string) => String(f.get(k) ?? "").trim(),
          num = (k: string) => Number(str(k));
        if (modulo === "Filmes")
          salvar({
            titulo: str("titulo"),
            genero: str("genero"),
            duracaoMinutos: num("duracaoMinutos"),
            classificacao: str("classificacao"),
            sinopse: str("sinopse"),
            dataLancamento: str("dataLancamento"),
            emCartaz: f.has("emCartaz"),
          });
        if (modulo === "Sessoes")
          salvar({
            filmeId: num("filmeId"),
            sala: str("sala"),
            preco: num("preco"),
            capacidade: num("capacidade"),
            dataHora:
              sessao &&
              new Date(str("dataHora")).getTime() ===
                new Date(dataLocal(sessao.dataHora)).getTime()
                ? sessao.dataHora
                : new Date(str("dataHora")).toISOString(),
          });
        if (modulo === "Reservas")
          salvar({
            sessaoId: num("sessaoId"),
            nomeCliente: str("nomeCliente"),
            email: str("email"),
            quantidadeLugares: num("quantidadeLugares"),
          });
      }}
    >
      {modulo === "Filmes" && (
        <>
          <label>
            Título
            <input
              name="titulo"
              required
              maxLength={100}
              defaultValue={filme?.titulo}
            />
          </label>
          <div className="pair">
            <label>
              Gênero
              <input
                name="genero"
                required
                maxLength={50}
                defaultValue={filme?.genero}
              />
            </label>
            <label>
              Duração (min)
              <input
                name="duracaoMinutos"
                type="number"
                min="1"
                max="600"
                required
                defaultValue={filme?.duracaoMinutos}
              />
            </label>
          </div>
          <div className="pair">
            <label>
              Classificação
              <input
                name="classificacao"
                required
                maxLength={20}
                defaultValue={filme?.classificacao ?? "Livre"}
              />
            </label>
            <label>
              Lançamento
              <input
                name="dataLancamento"
                type="date"
                required
                defaultValue={filme?.dataLancamento}
              />
            </label>
          </div>
          <label>
            Sinopse
            <textarea
              name="sinopse"
              maxLength={500}
              defaultValue={filme?.sinopse ?? ""}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="emCartaz"
              defaultChecked={filme?.emCartaz ?? true}
            />{" "}
            Em cartaz
          </label>
        </>
      )}
      {modulo === "Sessoes" && (
        <>
          <label>
            Filme
            <select
              required
              name="filmeId"
              defaultValue={sessao?.filmeId || filmeInicial || ""}
            >
              <option value="">Selecione um filme</option>
              {dados.filmes.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.titulo}
                </option>
              ))}
            </select>
          </label>
          <label>
            Sala
            <input
              name="sala"
              required
              maxLength={30}
              defaultValue={sessao?.sala}
            />
          </label>
          <label>
            Data e horário local
            <input
              name="dataHora"
              type="datetime-local"
              step="1"
              required
              defaultValue={sessao ? dataLocal(sessao.dataHora) : ""}
            />
          </label>
          <div className="pair">
            <label>
              Ingresso (R$)
              <input
                name="preco"
                type="number"
                required
                min="0"
                max="10000"
                step="0.01"
                defaultValue={sessao?.preco}
              />
            </label>
            <label>
              Capacidade
              <input
                name="capacidade"
                type="number"
                required
                min="1"
                max="1000"
                defaultValue={sessao?.capacidade}
              />
            </label>
          </div>
        </>
      )}
      {modulo === "Reservas" && (
        <>
          <label>
            Sessão
            <select
              required
              name="sessaoId"
              value={sid}
              onChange={(e) => selecionar(e.target.value)}
            >
              <option value="">Selecione uma sessão</option>
              {dados.sessoes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.tituloFilme} · {s.sala} · {horario(s.dataHora)}
                </option>
              ))}
            </select>
          </label>
          {vaga && (
            <p>
              {vaga.lugaresLivres} livres na última consulta ·{" "}
              {moeda(vaga.preco)} por lugar
            </p>
          )}
          <label>
            Nome do cliente
            <input
              name="nomeCliente"
              required
              minLength={2}
              maxLength={100}
              defaultValue={reserva?.nomeCliente}
            />
          </label>
          <label>
            E-mail
            <input
              name="email"
              type="email"
              required
              maxLength={150}
              defaultValue={reserva?.email}
            />
          </label>
          <label>
            Lugares
            <input
              name="quantidadeLugares"
              type="number"
              min="1"
              max="10"
              required
              defaultValue={reserva?.quantidadeLugares ?? 1}
            />
          </label>
        </>
      )}
      <button className="primary" disabled={ocupado}>
        {ocupado ? "Salvando…" : "Salvar"}
      </button>
    </form>
  );
}
