"""Executado pelo integracao.sh sobre um banco exclusivo."""
import json
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Barrier, Lock
from urllib.parse import urlsplit
from urllib.error import HTTPError
from urllib.request import Request, urlopen

if not __debug__:
    raise RuntimeError("Execute a suíte com as asserções Python habilitadas (sem -O ou PYTHONOPTIMIZE).")

base = sys.argv[1]
socket_postgres, usuario_postgres = sys.argv[2:4]
verificacoes = 0
operacoes = set()
registro = Lock()


def consultar_banco(sql):
    resultado = subprocess.run(
        ["psql", "-XAtw", "-v", "ON_ERROR_STOP=1", "-h", socket_postgres,
         "-p", "5432", "-U", usuario_postgres, "-d", "cinema_teste", "-c", sql],
        text=True, capture_output=True)
    if resultado.returncode:
        raise AssertionError(resultado.stderr)
    return resultado.stdout.strip()


def chamar(verbo, rota, codigo, corpo=None):
    global verificacoes
    dados = json.dumps(corpo).encode() if corpo is not None else None
    pedido = Request(base + rota, data=dados, method=verbo,
                     headers={"Content-Type": "application/json"})
    try:
        resposta = urlopen(pedido, timeout=20)
    except HTTPError as erro:
        resposta = erro
    with resposta:
        bruto = resposta.read()
        assert resposta.status in codigo if isinstance(codigo, tuple) else resposta.status == codigo, (
            verbo, rota, codigo, resposta.status, bruto)
        payload = json.loads(bruto) if bruto else None
        if resposta.status == 201:
            assert urlsplit(resposta.headers["Location"]).path == f'{rota}/{payload["id"]}'
        if resposta.status == 204:
            assert not bruto
        caminho = urlsplit(rota).path
        with registro:
            verificacoes += 1
            if caminho.startswith("/api/") and resposta.status < 300:
                operacoes.add((verbo, re.sub(r"/[0-9]+(?=/|$)", "/{}", caminho)))
        return resposta.status, payload


f, s, r, d = ["/api/" + nome for nome in ("Filmes", "Sessoes", "Reservas", "Disponibilidade")]
with urlopen(base + "/swagger", timeout=20) as pagina:
    assert pagina.status == 200
    assert pagina.headers.get_content_type() == "text/html"
    assert b"swagger-ui" in pagina.read().lower()
swagger = chamar("GET", "/swagger/v1/swagger.json", 200)[1]
documentadas = {
    (metodo.upper(), re.sub(r"\{[^}]+\}", "{}", caminho))
    for caminho, item in swagger["paths"].items()
    for metodo in item if metodo in {"get", "post", "put", "patch", "delete"}
}
assert len(documentadas) == 20
for rota, total in [(f, 3), (s, 3), (r, 2)]:
    assert len(chamar("GET", rota, 200)[1]) == total
todas = chamar("GET", d, 200)[1]
assert {item["sessaoId"]: item["lugaresLivres"] for item in todas} == {1: 78, 2: 96, 3: 60}
disponibilidades = chamar("GET", d + "?apenasComLugares=true&apenasFuturas=true", 200)[1]
assert {sessao["sessaoId"] for sessao in disponibilidades} == {1, 2, 3}
for rota in [f, s, r, d]:
    chamar("GET", rota + "/999999", 404)
filme = dict(titulo="Mostra", genero="Drama", classificacao="Livre",
             duracaoMinutos=120, dataLancamento="2020-01-01")
chamar("POST", f, 400, {})
chamar("PUT", f + "/999999", 404, filme)
chamar("PATCH", f + "/999999/em-cartaz?valor=true", 404)
chamar("DELETE", f + "/999999", 404)
fid = chamar("POST", f, 201, filme)[1]["id"]
filme_url = f"{f}/{fid}"
chamar("GET", filme_url, 200)
filme["titulo"] = "Mostra atualizada"
chamar("PUT", filme_url, 204, filme)
assert chamar("GET", filme_url, 200)[1]["titulo"] == filme["titulo"]
chamar("PUT", filme_url, 400, filme | {"duracaoMinutos": 0})
chamar("PATCH", filme_url + "/em-cartaz", 400)
assert chamar("GET", filme_url, 200)[1]["emCartaz"]
assert not chamar("PATCH", filme_url + "/em-cartaz?valor=false", 200)[1]["emCartaz"]
inicio = (datetime.now(timezone.utc) + timedelta(days=7)).replace(hour=23, minute=30, second=0, microsecond=0)


def horario(minutos):
    return (inicio + timedelta(minutes=minutos)).isoformat().replace("+00:00", "Z")


sessao = dict(filmeId=fid, sala="Auditório", preco=25, capacidade=20, dataHora=horario(0))
for alteracao, codigo in [({"capacidade": 0}, 400), ({"preco": -1}, 400), ({"filmeId": 999999}, 404)]:
    chamar("POST", s, codigo, sessao | alteracao)
sid = chamar("POST", s, 201, sessao)[1]["id"]
sessao_url = f"{s}/{sid}"
assert chamar("GET", sessao_url, 200)[1]["dataHora"] == horario(0)
chamar("PUT", sessao_url, 204, sessao | {"capacidade": 21})
assert chamar("GET", sessao_url, 200)[1]["capacidade"] == 21
chamar("PUT", sessao_url, 204, sessao)
chamar("POST", s, 409, sessao | {"dataHora": horario(60)})
outra = chamar("POST", s, 201, sessao | {"sala": "B"})[1]["id"]
seguinte = chamar("POST", s, 201, sessao | {"dataHora": horario(120)})[1]["id"]
chamar("PUT", sessao_url, 409, sessao | {"dataHora": horario(10)})
chamar("PUT", filme_url, 409, filme | {"duracaoMinutos": 121})
reserva = dict(sessaoId=sid, nomeCliente="Cliente Teste", email="teste@example.org", quantidadeLugares=5)


def livres(n):
    disponibilidade = chamar("GET", f"{d}/{sid}", 200)[1]
    assert disponibilidade["sessaoId"] == sid and disponibilidade["filmeId"] == fid
    assert disponibilidade["capacidade"] == 20
    assert disponibilidade["lugaresLivres"] == n
    assert disponibilidade["lugaresReservados"] == 20 - n
    assert disponibilidade["esgotada"] == (n == 0)
    persistido = consultar_banco(f"""
        SELECT s."Capacidade", COALESCE(SUM(r."QuantidadeLugares"), 0)
        FROM "Sessoes" s LEFT JOIN "Reservas" r
          ON r."SessaoId" = s."Id" AND r."Status" = 'Confirmada'
        WHERE s."Id" = {int(sid)} GROUP BY s."Id"
    """)
    assert persistido == f"20|{20 - n}", persistido


livres(20)
for quantidade in [-1, 0, 11]:
    chamar("POST", r, 400, reserva | {"quantidadeLugares": quantidade})
chamar("POST", r, 404, reserva | {"sessaoId": 999999})
rid = chamar("POST", r, 201, reserva)[1]["id"]
url = f"{r}/{rid}"
livres(15)
for quantidade in range(1, 11):
    chamar("PUT", url, 204, reserva | {"quantidadeLugares": quantidade})
    confirmada = chamar("GET", url, 200)[1]
    assert confirmada["sessaoId"] == sid and confirmada["status"] == "Confirmada"
    assert confirmada["quantidadeLugares"] == quantidade
    assert confirmada["valorTotal"] == 25 * quantidade
    livres(20 - quantidade)
for quantidade in (-1, 0, 11):
    chamar("PUT", url, 400, reserva | {"quantidadeLugares": quantidade})
chamar("PUT", url, 404, reserva | {"sessaoId": 999999})
assert chamar("GET", url, 200)[1]["quantidadeLugares"] == 10
livres(10)
chamar("PUT", url, 204, reserva)
livres(15)
chamar("POST", r, 201, reserva | {"quantidadeLugares": 10})
livres(5)
chamar("POST", r, 409, reserva | {"quantidadeLugares": 6})
chamar("PUT", sessao_url, 409, sessao | {"capacidade": 14})
chamar("PUT", sessao_url, 409, sessao | {"sala": "Sala nova"})
assert chamar("GET", sessao_url, 200)[1]["sala"] == sessao["sala"]
assert chamar("PATCH", url + "/cancelar", 200)[1]["status"] == "Cancelada"
assert [item["id"] for item in chamar("GET", r + f"?sessaoId={sid}&status=Cancelada", 200)[1]] == [rid]
chamar("PATCH", url + "/cancelar", 409)
livres(10)
assert chamar("PATCH", url + "/reativar", 200)[1]["status"] == "Confirmada"
livres(5)
chamar("PUT", url, 204, reserva | {"quantidadeLugares": 10})
livres(0)
chamar("PATCH", url + "/cancelar", 200)


partida = Barrier(2)


def disputar(_):
    partida.wait(timeout=10)
    return chamar("POST", r, (201, 409), reserva | {"quantidadeLugares": 10})[0]


with ThreadPoolExecutor(2) as pool:
    assert sorted(pool.map(disputar, range(2))) == [201, 409]
livres(0)
chamar("PATCH", url + "/reativar", 409)
assert chamar("GET", url, 200)[1]["status"] == "Cancelada"
chamar("DELETE", url, 204)
livres(0)
passada = sessao | {"sala": "B", "dataHora": horario(-20000)}
um = chamar("POST", r, 201, reserva | {"sessaoId": outra, "quantidadeLugares": 1})[1]["id"]
chamar("PUT", f"{r}/{um}", 409, reserva | {"quantidadeLugares": 1})
assert chamar("GET", f"{r}/{um}", 200)[1]["sessaoId"] == outra
assert consultar_banco(f'SELECT "SessaoId" FROM "Reservas" WHERE "Id" = {int(um)}') == str(outra)
chamar("PUT", f"{r}/{um}", 204, reserva | {"sessaoId": seguinte, "quantidadeLugares": 1})
assert chamar("GET", f"{d}/{outra}", 200)[1]["lugaresLivres"] == 20
assert chamar("GET", f"{d}/{seguinte}", 200)[1]["lugaresLivres"] == 19
chamar("DELETE", f"{r}/{um}", 204)
assert chamar("GET", f"{d}/{seguinte}", 200)[1]["lugaresLivres"] == 20
um = chamar("POST", r, 201, reserva | {"sessaoId": outra, "quantidadeLugares": 1})[1]["id"]
chamar("PATCH", f"{r}/{um}/cancelar", 200)
chamar("PUT", f"{s}/{outra}", 204, passada)
chamar("PATCH", f"{r}/{um}/reativar", 409)
chamar("POST", r, 409, reserva | {"sessaoId": outra})
# A sessão principal está lotada, a segunda já começou e a terceira está livre.
def ids_filtrados(filtros):
    registros = chamar("GET", f"{d}?filmeId={fid}{filtros}", 200)[1]
    return {item["sessaoId"] for item in registros}


assert ids_filtrados("") == {sid, outra, seguinte}
assert ids_filtrados("&apenasFuturas=true") == {sid, seguinte}
assert ids_filtrados("&apenasComLugares=true") == {outra, seguinte}
assert ids_filtrados("&apenasFuturas=true&apenasComLugares=true") == {seguinte}
chamar("GET", d + "?filmeId=0", 400)
chamar("DELETE", filme_url, 409)
for identificador in (sid, outra, seguinte):
    chamar("DELETE", f"{s}/{identificador}", 204)
assert chamar("GET", r + f"?sessaoId={sid}", 200)[1] == []
chamar("DELETE", filme_url, 204)
assert consultar_banco(f'SELECT count(*) FROM "Reservas" WHERE "SessaoId" IN ({int(sid)}, {int(outra)}, {int(seguinte)})') == "0"
assert consultar_banco(f'SELECT count(*) FROM "Sessoes" WHERE "FilmeId" = {int(fid)}') == "0"
assert consultar_banco(f'SELECT count(*) FROM "Filmes" WHERE "Id" = {int(fid)}') == "0"
assert operacoes == documentadas, (documentadas - operacoes, operacoes - documentadas)
print(f"{len(operacoes)} operações da API cobertas. {verificacoes} respostas HTTP verificadas.")
