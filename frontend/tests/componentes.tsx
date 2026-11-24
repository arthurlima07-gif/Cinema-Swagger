import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Editor } from "../src/Editor";
import { dataLocal } from "../src/api";
const dados = { filmes: [], sessoes: [], reservas: [], vagas: [] };
for (const [modulo, campos] of [
  ["Filmes", ["titulo", "genero", "dataLancamento", "emCartaz"]],
  ["Sessoes", ["filmeId", "dataHora", "preco", "capacidade"]],
  ["Reservas", ["sessaoId", "email", "quantidadeLugares", "nomeCliente"]],
] as const) {
  test("Contrato do formulário " + modulo, () => {
    const html = renderToStaticMarkup(
      <Editor
        modulo={modulo}
        dados={dados}
        ocupado={false}
        salvar={() => {}}
      />,
    );
    for (const campo of campos)
      assert.ok(html.includes('name="' + campo + '"'));
    if (modulo === "Reservas") assert.match(html, /min="1" max="10"/);
  });
}
test("Horário local preserva o instante UTC na edição", () => {
  const iso = "2026-12-31T23:30:12.000Z";
  assert.equal(new Date(dataLocal(iso)).toISOString(), iso);
});
