import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api, carregar, horario, moeda } from "./api";
import type { Dados, Filme, Modulo, Registro } from "./api";
import { Editor } from "./Editor";

const paginas = {
  Inicio: "Início",
  Filmes: "Filmes",
  Sessoes: "Sessões",
  Reservas: "Reservas",
  Disponibilidade: "Disponibilidade",
  Painel: "Painel",
};
const singular = { Filmes: "filme", Sessoes: "sessão", Reservas: "reserva" };
type Pagina = keyof typeof paginas;
type Janela =
  | { tipo: "editor"; modulo: Modulo; item?: Registro; sessaoInicial?: number }
  | { tipo: "detalhe"; filme: Filme }
  | {
      tipo: "confirmar";
      titulo: string;
      texto: string;
      rota: string;
      metodo: string;
    };
function rota() {
  const [nome, filtro] = location.hash.slice(1).split("/");
  return {
    pagina: (Object.hasOwn(paginas, nome) ? nome : "Inicio") as Pagina,
    filme: Number(filtro) || 0,
  };
}
function Modal({
  titulo,
  fechar,
  children,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        fechar();
      }}
    >
      <header>
        <h2 id="dialog-title">{titulo}</h2>
        <button aria-label="Fechar" onClick={fechar}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Tabela({
  colunas,
  linhas,
}: {
  colunas: string[];
  linhas: { id: number; celulas: ReactNode[] }[];
}) {
  if (!linhas.length)
    return <p className="empty">Nenhum registro encontrado.</p>;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            {colunas.map((c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id}>
              {l.celulas.map((c, i) => (
                <td key={i}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Plateia() {
  return (
    <div className="theater" aria-hidden="true">
      <div className="screen" />
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={"row row" + i}>
          {Array.from({ length: 10 }, (_, j) => (
            <i key={j} />
          ))}
        </div>
      ))}
    </div>
  );
}
export default function App() {
  const [nav, setNav] = useState(rota),
    [dados, setDados] = useState<Dados | null>(null),
    [erro, setErro] = useState(""),
    [msg, setMsg] = useState(""),
    [janela, abrir] = useState<Janela | null>(null);
  const [ocupado, bloquear] = useState(false),
    [busca, buscar] = useState(""),
    [cartaz, filtrar] = useState(false),
    [carregando, aguardar] = useState(true);
  const versao = useRef(0),
    escrevendo = useRef(false);
  async function atualizar() {
    const v = ++versao.current;
    aguardar(true);
    try {
      const d = await carregar();
      if (v === versao.current) {
        setDados(d);
        setErro("");
      }
    } catch (e) {
      if (v === versao.current) {
        setDados(null);
        setErro(
          e instanceof Error ? e.message : "Falha ao consultar o cinema.",
        );
      }
    } finally {
      if (v === versao.current) aguardar(false);
    }
  }
  useEffect(() => {
    function navegar() {
      setNav(rota());
      abrir(null);
      setMsg("");
      void atualizar();
    }
    void atualizar();
    window.addEventListener("hashchange", navegar);
    return () => window.removeEventListener("hashchange", navegar);
  }, []);
  const [falha, setFalha] = useState("");
  function mostrar(j: Janela) {
    setFalha("");
    setMsg("");
    abrir(j);
  }
  async function enviar(path: string, metodo: string, body?: object) {
    if (escrevendo.current) return;
    escrevendo.current = true;
    bloquear(true);
    setFalha("");
    try {
      await api(path, metodo, body);
      abrir(null);
      setMsg("Alteração salva.");
      await atualizar();
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Falha ao salvar.");
      await atualizar();
    } finally {
      escrevendo.current = false;
      bloquear(false);
    }
  }
  const leitura = useRef(0);
  async function consultarRegistro(
    modulo: Modulo,
    item: Registro,
    detalhe = false,
  ) {
    const pedido = ++leitura.current,
      origem = location.hash;
    try {
      const registro = await api<Registro>(modulo + "/" + item.id);
      if (pedido !== leitura.current || location.hash !== origem) return;
      mostrar(
        detalhe
          ? { tipo: "detalhe", filme: registro as Filme }
          : { tipo: "editor", modulo, item: registro },
      );
    } catch (e) {
      if (pedido === leitura.current && location.hash === origem)
        setErro(
          e instanceof Error ? e.message : "Erro ao consultar o registro.",
        );
    }
  }
  function editar(modulo: Modulo, item?: Registro) {
    if (item) void consultarRegistro(modulo, item);
    else mostrar({ tipo: "editor", modulo });
  }
  function excluir(modulo: Modulo, id: number, nome: string) {
    mostrar({
      tipo: "confirmar",
      titulo: "Excluir " + singular[modulo] + "?",
      texto:
        nome +
        (modulo === "Sessoes"
          ? " — as reservas desta sessão também serão excluídas."
          : "."),
      rota: modulo + "/" + id,
      metodo: "DELETE",
    });
  }
  const pg = nav.pagina;
  const catalogo =
    dados?.filmes.filter(
      (f) =>
        (!cartaz || f.emCartaz) &&
        f.titulo.toLocaleLowerCase().includes(busca.toLocaleLowerCase()),
    ) || [];
  const resumo =
    dados &&
    ([
      ["Filmes", dados.filmes.length],
      ["Sessoes", dados.sessoes.length],
      ["Reservas", dados.reservas.length],
      ["Disponibilidade", dados.vagas.reduce((n, v) => n + v.lugaresLivres, 0)],
    ] as [Pagina, number][] | null);
  return (
    <>
      <header className="top">
        <a className="brand" href="#Inicio">
          <b>▥</b>Cinema<span>Swagger</span>
        </a>
        <nav aria-label="Navegação principal">
          {(Object.keys(paginas) as Pagina[]).map((p) => (
            <a
              key={p}
              aria-current={pg === p ? "page" : undefined}
              href={"#" + p}
            >
              {paginas[p]}
            </a>
          ))}
        </nav>
      </header>
      <main>
        {pg === "Inicio" ? (
          <section className="hero">
            <Plateia />
            <div className="hero-copy">
              <small>CINEMASWAGGER</small>
              <h1>
                Programação
                <br />
                <em>de cinema.</em>
              </h1>
              <a className="primary" href="#Sessoes">
                Explorar sessões <span>↗</span>
              </a>
            </div>
          </section>
        ) : (
          <div className="section-head">
            <h1>{paginas[pg]}</h1>
            {(["Filmes", "Sessoes", "Reservas"] as Pagina[]).includes(pg) && (
              <button
                className="primary"
                disabled={!dados}
                onClick={() => editar(pg as Modulo)}
              >
                + Cadastrar {singular[pg as Modulo]}
              </button>
            )}
          </div>
        )}
        {msg && (
          <p className="success" role="status">
            {msg}
          </p>
        )}
        {erro && (
          <div className="alert" role="alert">
            {erro} <button onClick={atualizar}>Tentar novamente</button>
          </div>
        )}
        {carregando && <p role="status">Consultando o cinema…</p>}
        {dados && (
          <>
            {pg === "Inicio" && (
              <>
                <div className="section-head">
                  <h2>Catálogo de filmes</h2>
                  <input
                    type="search"
                    aria-label="Buscar filme"
                    placeholder="Buscar filme…"
                    value={busca}
                    onChange={(e) => buscar(e.target.value)}
                  />
                </div>
                <div className="tabs">
                  {["Todos os filmes", "Em cartaz"].map((n, i) => (
                    <button
                      aria-pressed={cartaz === Boolean(i)}
                      key={n}
                      onClick={() => filtrar(Boolean(i))}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="cards">
                  {catalogo.map((f) => (
                    <article className="ticket" key={f.id}>
                      <small>
                        {f.genero} · {f.dataLancamento.slice(0, 4)}
                      </small>
                      <h3>{f.titulo}</h3>
                      <div className="meta">
                        {f.duracaoMinutos} min <span>{f.classificacao}</span>
                      </div>
                      <p>{f.sinopse}</p>
                      <footer>
                        <a href={"#Sessoes/" + f.id}>Ver sessões →</a>
                        <button
                          onClick={() => consultarRegistro("Filmes", f, true)}
                        >
                          Detalhes
                        </button>
                      </footer>
                    </article>
                  ))}
                </div>
                {!catalogo.length && (
                  <p className="empty">Nenhum filme encontrado.</p>
                )}
              </>
            )}
            {pg === "Painel" && (
              <>
                <div className="stats">
                  {resumo?.map(([p, n]) => (
                    <a href={"#" + p} key={p}>
                      <small>
                        {p === "Disponibilidade"
                          ? "Lugares disponíveis"
                          : paginas[p]}
                      </small>
                      <strong>{n}</strong>
                    </a>
                  ))}
                </div>
                <h2>Gerenciamento</h2>
                <div className="cards">
                  {(["Filmes", "Sessoes", "Reservas"] as Modulo[]).map((m) => (
                    <article className="ticket" key={m}>
                      <h3>{paginas[m]}</h3>
                      <footer>
                        <a href={"#" + m}>Gerenciar →</a>
                        <button onClick={() => editar(m)}>Cadastrar</button>
                      </footer>
                    </article>
                  ))}
                </div>
              </>
            )}
            {pg === "Filmes" && (
              <Tabela
                colunas={["Filme", "Gênero", "Duração", "Situação", "Ações"]}
                linhas={dados.filmes.map((f) => ({
                  id: f.id,
                  celulas: [
                    <button
                      onClick={() => consultarRegistro("Filmes", f, true)}
                    >
                      {f.titulo}
                    </button>,
                    f.genero,
                    f.duracaoMinutos + " min",
                    f.emCartaz ? "Em cartaz" : "Fora de cartaz",
                    <div className="actions">
                      <button onClick={() => editar("Filmes", f)}>
                        Editar
                      </button>
                      <button
                        onClick={() =>
                          mostrar({
                            tipo: "confirmar",
                            titulo: f.emCartaz
                              ? "Retirar de cartaz?"
                              : "Colocar em cartaz?",
                            texto: f.titulo,
                            rota:
                              "Filmes/" +
                              f.id +
                              "/em-cartaz?valor=" +
                              !f.emCartaz,
                            metodo: "PATCH",
                          })
                        }
                      >
                        {f.emCartaz ? "Retirar de cartaz" : "Colocar em cartaz"}
                      </button>
                      <button onClick={() => excluir("Filmes", f.id, f.titulo)}>
                        Excluir
                      </button>
                    </div>,
                  ],
                }))}
              />
            )}
            {pg === "Sessoes" && (
              <>
                <label className="filter">
                  Filtrar por filme
                  <select
                    value={nav.filme}
                    onChange={(e) =>
                      (location.hash = "Sessoes/" + e.target.value)
                    }
                  >
                    <option value="0">Todos os filmes</option>
                    {dados.filmes.map((f) => (
                      <option value={f.id} key={f.id}>
                        {f.titulo}
                      </option>
                    ))}
                  </select>
                </label>
                <Tabela
                  colunas={[
                    "Filme / sala",
                    "Horário local",
                    "Ingresso",
                    "Capacidade",
                    "Ações",
                  ]}
                  linhas={dados.sessoes
                    .filter((s) => !nav.filme || s.filmeId === nav.filme)
                    .map((s) => ({
                      id: s.id,
                      celulas: [
                        <>
                          {s.tituloFilme}
                          <small>{s.sala}</small>
                        </>,
                        horario(s.dataHora),
                        moeda(s.preco),
                        s.capacidade,
                        <div className="actions">
                          <button
                            onClick={() =>
                              mostrar({
                                tipo: "editor",
                                modulo: "Reservas",
                                sessaoInicial: s.id,
                              })
                            }
                          >
                            Reservar
                          </button>
                          <button onClick={() => editar("Sessoes", s)}>
                            Editar
                          </button>
                          <button
                            onClick={() =>
                              excluir("Sessoes", s.id, s.tituloFilme)
                            }
                          >
                            Excluir
                          </button>
                        </div>,
                      ],
                    }))}
                />
              </>
            )}
            {pg === "Reservas" && (
              <Tabela
                colunas={[
                  "Cliente",
                  "Sessão",
                  "Lugares",
                  "Total",
                  "Status",
                  "Ações",
                ]}
                linhas={dados.reservas.map((r) => ({
                  id: r.id,
                  celulas: [
                    <>
                      {r.nomeCliente}
                      <small>{r.email}</small>
                    </>,
                    <>
                      {r.tituloFilme}
                      <small>
                        {r.sala} · {horario(r.dataHoraSessao)}
                      </small>
                    </>,
                    r.quantidadeLugares,
                    moeda(r.valorTotal),
                    r.status,
                    <div className="actions">
                      <button
                        disabled={r.status === "Cancelada"}
                        onClick={() => editar("Reservas", r)}
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          const acao =
                            r.status === "Confirmada" ? "cancelar" : "reativar";
                          mostrar({
                            tipo: "confirmar",
                            titulo:
                              (acao === "cancelar" ? "Cancelar" : "Reativar") +
                              " reserva?",
                            texto: r.nomeCliente + " · " + r.tituloFilme,
                            metodo: "PATCH",
                            rota: "Reservas/" + r.id + "/" + acao,
                          });
                        }}
                      >
                        {r.status === "Confirmada" ? "Cancelar" : "Reativar"}
                      </button>
                      <button
                        onClick={() => excluir("Reservas", r.id, r.nomeCliente)}
                      >
                        Excluir
                      </button>
                    </div>,
                  ],
                }))}
              />
            )}
            {pg === "Disponibilidade" && (
              <>
                <button onClick={atualizar} disabled={carregando}>
                  Atualizar disponibilidade
                </button>
                <div className="cards">
                  {dados.vagas.map((v) => {
                    const pct = Math.round(
                      (v.lugaresReservados / v.capacidade) * 100,
                    );
                    return (
                      <article className="ticket" key={v.sessaoId}>
                        <small>
                          {v.sala} · {horario(v.dataHora)}
                        </small>
                        <h3>{v.tituloFilme}</h3>
                        <strong>{v.lugaresLivres} lugares livres</strong>
                        <progress max={100} value={pct} />
                        <p>
                          {pct}% de ocupação · {v.lugaresReservados} de{" "}
                          {v.capacidade} lugares
                        </p>
                        <button
                          disabled={v.esgotada || v.jaComecou}
                          onClick={() =>
                            mostrar({
                              tipo: "editor",
                              modulo: "Reservas",
                              sessaoInicial: v.sessaoId,
                            })
                          }
                        >
                          Reservar
                        </button>
                      </article>
                    );
                  })}
                </div>
                {!dados.vagas.length && (
                  <p className="empty">Nenhuma sessão cadastrada.</p>
                )}
              </>
            )}
          </>
        )}
      </main>
      {janela && (
        <Modal
          titulo={
            janela.tipo === "editor"
              ? (janela.item ? "Editar " : "Cadastrar ") +
                singular[janela.modulo]
              : janela.tipo === "detalhe"
                ? janela.filme.titulo
                : janela.titulo
          }
          fechar={() => {
            if (!ocupado) abrir(null);
          }}
        >
          {falha && (
            <p className="alert" role="alert">
              {falha}
            </p>
          )}
          {janela.tipo === "editor" && dados && (
            <Editor
              modulo={janela.modulo}
              item={janela.item}
              dados={dados}
              sessaoInicial={janela.sessaoInicial}
              filmeInicial={nav.filme}
              ocupado={ocupado}
              salvar={(body) =>
                enviar(
                  janela.modulo + (janela.item ? "/" + janela.item.id : ""),
                  janela.item ? "PUT" : "POST",
                  body,
                )
              }
            />
          )}
          {janela.tipo === "detalhe" && (
            <>
              <small>
                {janela.filme.genero} · {janela.filme.duracaoMinutos} min ·{" "}
                {janela.filme.classificacao}
              </small>
              <p>{janela.filme.sinopse}</p>
              <p>
                Lançamento{" "}
                {janela.filme.dataLancamento.split("-").reverse().join("/")} ·{" "}
                {janela.filme.emCartaz ? "Em cartaz" : "Fora de cartaz"}
              </p>
              <a
                className="primary"
                href={"#Sessoes/" + janela.filme.id}
                onClick={() => abrir(null)}
              >
                Ver sessões →
              </a>
            </>
          )}
          {janela.tipo === "confirmar" && (
            <>
              <p>{janela.texto}</p>
              <div className="actions">
                <button disabled={ocupado} onClick={() => abrir(null)}>
                  Voltar
                </button>
                <button
                  className="primary"
                  disabled={ocupado}
                  onClick={() => enviar(janela.rota, janela.metodo)}
                >
                  Confirmar
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}
