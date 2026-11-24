"""Testa migrations e integridade no PostgreSQL real, inclusive em ambientes sem sockets."""
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess

if not __debug__:
    raise RuntimeError("Execute a suíte com as asserções Python habilitadas (sem -O ou PYTHONOPTIMIZE).")

projeto = Path(__file__).resolve().parents[1] / "CinemaSwagger"


with TemporaryDirectory() as pasta:
    dados = Path(pasta) / "cluster"
    subprocess.run(["initdb", "-D", dados, "-A", "trust"], check=True, stdout=subprocess.DEVNULL)

    def sql(comando):
        # Um erro não tratado interrompe o lote antes do SELECT final, mesmo quando
        # o backend monousuário encerra com código zero. O marcador vem de stdout.
        lote = " ".join(comando.splitlines()) + "; SELECT 'cinema_sql_concluido';\n"
        resultado = subprocess.run(
            ["postgres", "--single", "-D", dados, "postgres"], input=lote, text=True, capture_output=True)
        if resultado.returncode != 0 or '"cinema_sql_concluido"' not in resultado.stdout:
            raise AssertionError(f"Falha ao executar SQL (código {resultado.returncode}):\n{resultado.stderr}")

    def verificar_rejeicao(comando, condicao, restricao):
        # O PostgreSQL fornece a identidade da constraint em um campo estruturado.
        sql(f"""
            DO $$ DECLARE nome text;
            BEGIN
                BEGIN
                    {comando};
                EXCEPTION WHEN {condicao} THEN
                    GET STACKED DIAGNOSTICS nome = CONSTRAINT_NAME;
                    IF nome IS DISTINCT FROM '{restricao}' THEN
                        RAISE;
                    END IF;
                    RETURN;
                END;
                RAISE EXCEPTION 'A operação deveria violar {restricao}';
            END $$;
        """)
        print("OK", restricao)

    def verificar(nome, consulta):
        sql(f"DO $$ BEGIN IF ({consulta}) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Falha'; END IF; END $$;")
        print("OK", nome)

    anterior = "0"
    for atual in ("Inicial", "AdicionarSessoes", "AdicionarReservas", "Integridade"):
        arquivo = Path(pasta) / "migration.sql"
        subprocess.run(["dotnet", "ef", "migrations", "script", anterior, atual, "--no-build",
                        "--configuration", os.environ.get("CINEMA_TEST_BUILD", "Debug"), "-o", arquivo], cwd=projeto, check=True, stdout=subprocess.DEVNULL)
        sql(arquivo.read_text(encoding="utf-8-sig"))
        anterior = atual
    verificar("quatro migrations", 'SELECT count(*) = 4 FROM "__EFMigrationsHistory"')
    verificar("três filmes", 'SELECT count(*) = 3 FROM "Filmes"')
    verificar("três sessões futuras", 'SELECT count(*) = 3 FROM "Sessoes" WHERE "DataHora" > now()')
    verificar("duas reservas", 'SELECT count(*) = 2 FROM "Reservas"')
    verificar("disponibilidade inicial", '''SELECT s."Capacidade" - sum(r."QuantidadeLugares") = 78
        FROM "Sessoes" s JOIN "Reservas" r ON s."Id" = r."SessaoId"
        WHERE s."Id" = 1 AND r."Status" = 'Confirmada' GROUP BY s."Id"''')
    verificar("sessão 1 vinculada ao filme 1",
              'SELECT EXISTS (SELECT 1 FROM "Sessoes" WHERE "Id" = 1 AND "FilmeId" = 1)')
    verificar("FK validada com ON DELETE RESTRICT", """
        SELECT EXISTS (SELECT 1 FROM pg_constraint
            WHERE conname = 'FK_Sessoes_Filmes_FilmeId' AND contype = 'f' AND convalidated
              AND conrelid = '"Sessoes"'::regclass AND confrelid = '"Filmes"'::regclass
              AND confdeltype = 'r')""")
    verificar_rejeicao('DELETE FROM "Filmes" WHERE "Id" = 1',
                       'restrict_violation OR foreign_key_violation', 'FK_Sessoes_Filmes_FilmeId')
    verificar("filme preservado", 'SELECT EXISTS (SELECT 1 FROM "Filmes" WHERE "Id" = 1)')
    verificar_rejeicao('UPDATE "Reservas" SET "QuantidadeLugares" = 11', 'check_violation', 'CK_Reservas_Limites')
    verificar_rejeicao('UPDATE "Sessoes" SET "Capacidade" = 0', 'check_violation', 'CK_Sessoes_Limites')
    verificar_rejeicao('UPDATE "Filmes" SET "DuracaoMinutos" = 0', 'check_violation', 'CK_Filmes_Duracao')
    sql('DELETE FROM "Sessoes" WHERE "Id" = 1')
    verificar("cascata", 'SELECT count(*) = 0 FROM "Reservas" WHERE "SessaoId" = 1')
    sql('DELETE FROM "Filmes" WHERE "Id" = 1')
    verificar("exclusão do filme sem sessões", 'SELECT NOT EXISTS (SELECT 1 FROM "Filmes" WHERE "Id" = 1)')
    print("14 verificações aprovadas")
