#!/usr/bin/env bash
# Ambiente persistente do projeto, separado do serviço PostgreSQL do sistema.
set -euo pipefail
cd "$(dirname "$0")"
raiz=$(pwd -P)
dados="$raiz/.cinema-local/postgres"
(cd frontend && npm ci --prefer-offline && npm run build)
dotnet build CinemaSwagger/CinemaSwagger.csproj -c Release
api_pid=
web_pid=
postgres_iniciado=false
finalizar() {
    for pid in "$web_pid" "$api_pid"; do
        if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
    done
    wait || true
    if [[ "$postgres_iniciado" == true ]]; then pg_ctl -D "$dados" -m fast -w stop; fi
}
trap finalizar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
umask 077
mkdir -p "$raiz/.cinema-local"
if [[ ! -f "$dados/PG_VERSION" ]]; then
    initdb -D "$dados" --encoding=UTF8 --auth-local=peer --auth-host=scram-sha-256
fi
# O socket fica no diretório privado do cluster. Uma instância do sistema pode coexistir.
if ! pg_ctl -D "$dados" status >/dev/null; then
    printf -v socket_arg '%q' "$dados"
    pg_ctl -D "$dados" -o "-h '' -k $socket_arg -p 5433" -l "$raiz/.cinema-local/postgres.log" -w start
    postgres_iniciado=true
fi
export ConnectionStrings__Padrao="Host=$dados;Port=5433;Database=cinema;Username=$(id -un)"
(cd CinemaSwagger && exec dotnet bin/Release/net10.0/CinemaSwagger.dll --urls http://localhost:5254) &
api_pid=$!
for ((i=0;i<300;i++)); do
    if ! kill -0 "$api_pid" 2>/dev/null; then wait "$api_pid"; exit 1; fi
    if curl -fsS http://localhost:5254/swagger/v1/swagger.json -o /dev/null 2>/dev/null; then break; fi
    sleep .2
done
curl -fsS http://localhost:5254/swagger/v1/swagger.json -o /dev/null
(cd frontend && exec node node_modules/vite/bin/vite.js preview) &
web_pid=$!
wait -n "$api_pid" "$web_pid"
