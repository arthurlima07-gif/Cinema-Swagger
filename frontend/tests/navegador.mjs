// Chamado por tests/integracao.sh --web, com API e banco exclusivos desta execução.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { setTimeout as pausa } from "node:timers/promises";
import { preview } from "vite";

const [api, perfil] = process.argv.slice(2);
process.env.CINEMA_BACKEND_URL = api;
const server = await preview({ preview: { port: 0, host: "127.0.0.1" } });
const base = "http://127.0.0.1:" + server.httpServer.address().port;
const chrome = spawn(process.env.CHROME_BIN || "google-chrome-stable", [
  "--headless",
  "--disable-gpu",
  "--no-first-run",
  "--remote-debugging-port=0",
  "--user-data-dir=" + perfil,
  "about:blank",
]);
let falhaChrome;
chrome.on("error", (erro) => {
  falhaChrome = erro;
});
chrome.stderr.resume();
async function esperar(fn, descricao) {
  for (let i = 0; i < 120; i++) {
    if (falhaChrome) throw falhaChrome;
    if (chrome.exitCode !== null)
      throw Error("Chrome encerrou com código " + chrome.exitCode);
    const valor = await fn();
    if (valor) return valor;
    await pausa(100);
  }
  throw Error("Tempo excedido: " + descricao);
}
let socket;
try {
  const porta = await esperar(
    () =>
      readFile(perfil + "/DevToolsActivePort", "utf8")
        .then((s) => s.split("\n")[0])
        .catch(() => null),
    "iniciar navegador",
  );
  const abas = await (
    await fetch("http://127.0.0.1:" + porta + "/json/list")
  ).json();
  socket = new WebSocket(
    abas.find((a) => a.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const pendentes = new Map();
  socket.onmessage = (e) => {
    const m = JSON.parse(e.data);
    const pedido = pendentes.get(m.id);
    if (pedido) {
      pendentes.delete(m.id);
      m.error
        ? pedido.reject(Error(m.error.message))
        : pedido.resolve(m.result);
    }
  };
  function cdp(method, params = {}) {
    const seq = ++id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendentes.delete(seq);
        reject(Error(method + " excedeu o prazo"));
      }, 10000);
      pendentes.set(seq, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (r) => {
          clearTimeout(timer);
          reject(r);
        },
      });
      socket.send(JSON.stringify({ id: seq, method, params }));
    });
  }
  async function js(expression) {
    const r = await cdp("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  }
  await cdp("Page.navigate", { url: base });
  await esperar(
    () => js('!!document.querySelector(".ticket")'),
    "catálogo carregado",
  );
  for (const largura of [390, 1280]) {
    await cdp("Emulation.setDeviceMetricsOverride", {
      width: largura,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    for (const pagina of [
      "Filmes",
      "Sessoes",
      "Reservas",
      "Disponibilidade",
      "Painel",
      "Inicio",
    ]) {
      await js(`document.querySelector('nav a[href="#${pagina}"]').click()`);
      await esperar(
        () =>
          js(
            `document.querySelector('nav [aria-current]')?.hash === '#${pagina}' && !document.querySelector('[role=status],[role=alert]')`,
          ),
        pagina,
      );
      assert.ok(
        await js("document.documentElement.scrollWidth <= innerWidth"),
        pagina + " ultrapassou a largura disponível",
      );
    }
  }
  await js("document.querySelector('nav a[href=\"#Filmes\"]').click()");
  await esperar(
    () =>
      js(
        '!!document.querySelector("table") && !document.querySelector("[role=status]")',
      ),
    "listagem",
  );
  await js('document.querySelector("main button.primary").click()');
  const titulo = "Teste de interface " + Date.now();
  for (const [k, v] of Object.entries({
    titulo,
    genero: "Drama",
    duracaoMinutos: "100",
    dataLancamento: "2026-01-01",
  })) {
    await js(
      `document.querySelector('[name="${k}"]').value=${JSON.stringify(v)}`,
    );
  }
  await js('document.querySelector("form").requestSubmit()');
  await esperar(
    () =>
      js(
        '!document.querySelector("dialog") && document.querySelector("tbody")?.innerText.includes(' +
          JSON.stringify(titulo) +
          ")",
      ),
    "cadastro do filme",
  );
  await js(
    `[...document.querySelectorAll('tr')].find(tr=>tr.innerText.includes(${JSON.stringify(titulo)})).querySelector('.actions button').click()`,
  );
  await esperar(
    () => js('!!document.querySelector("dialog form")'),
    "formulário de edição",
  );
  await js(
    'document.querySelector(\'[name="duracaoMinutos"]\').value="101";document.querySelector("form").requestSubmit()',
  );
  await esperar(async () => {
    const filmes = await (await fetch(base + "/api/Filmes")).json();
    return filmes.some((f) => f.titulo === titulo && f.duracaoMinutos === 101);
  }, "alteração persistida");
  const filmes = await (await fetch(base + "/api/Filmes")).json();
  const filme = filmes.find((f) => f.titulo === titulo);
  async function preencher(campos) {
    await esperar(
      () => js('!!document.querySelector("dialog form")'),
      "formulário aberto",
    );
    for (const [nome, valor] of Object.entries(campos)) {
      await js(
        `document.querySelector('[name="${nome}"]').value=${JSON.stringify(String(valor))}; document.querySelector('[name="${nome}"]').dispatchEvent(new Event("change",{bubbles:true}))`,
      );
    }
    await js('document.querySelector("form").requestSubmit()');
    await esperar(
      () => js('!document.querySelector("dialog")'),
      "formulário salvo",
    );
  }
  async function acaoNaLinha(texto, acao) {
    await esperar(
      () =>
        js(
          `[...document.querySelectorAll("tbody tr")].find(tr=>tr.innerText.includes(${JSON.stringify(texto)}))?.querySelector(".actions") !== undefined`,
        ),
      texto,
    );
    await js(
      `[...document.querySelectorAll("tbody tr")].find(tr=>tr.innerText.includes(${JSON.stringify(texto)})).querySelectorAll("button").forEach(b=>{if(b.textContent===${JSON.stringify(acao)})b.click()})`,
    );
  }
  await js('location.hash="Sessoes/' + filme.id + '"');
  await esperar(
    () =>
      js(
        'document.querySelector("h1")?.textContent==="Sessões" && !!document.querySelector("main button.primary:not(:disabled)")',
      ),
    "sessões",
  );
  await js('document.querySelector("main button.primary").click()');
  const dia = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  await preencher({
    filmeId: filme.id,
    sala: "Sala web",
    dataHora: dia + "T19:30:00",
    preco: 25,
    capacidade: 20,
  });
  const sessoes = await (
    await fetch(base + "/api/Sessoes?filmeId=" + filme.id)
  ).json();
  assert.equal(sessoes.length, 1);
  await acaoNaLinha(titulo, "Reservar");
  await preencher({
    nomeCliente: "Cliente de interface",
    email: "interface@example.org",
    quantidadeLugares: 3,
  });
  async function conferirLivres(esperados) {
    const v = await (
      await fetch(base + "/api/Disponibilidade/" + sessoes[0].id)
    ).json();
    assert.equal(v.lugaresLivres, esperados);
  }
  await conferirLivres(17);
  await js('location.hash="Reservas"');
  for (const [acao, livres] of [
    ["Cancelar", 20],
    ["Reativar", 17],
    ["Excluir", 20],
  ]) {
    await acaoNaLinha("Cliente de interface", acao);
    await esperar(
      () => js('!!document.querySelector("dialog")'),
      "confirmação",
    );
    await js('document.querySelector("dialog .primary").click()');
    await esperar(
      () =>
        js(
          '!document.querySelector("dialog") && !document.querySelector("main p:not(.success)[role=status]")',
        ),
      "alteração salva",
    );
    await conferirLivres(livres);
  }
  console.log(
    "Seis páginas, duas larguras, cadastro e edição de filme, sessão e ciclo de reserva verificados.",
  );
} finally {
  socket?.close();
  chrome.kill();
  await server.close();
}
