#!/usr/bin/env bash
# Cluster privado, sem usar a configuração do banco da aplicação.
set -euo pipefail
cd "$(dirname "$0")/../CinemaSwagger"
dir=$(mktemp -d)
pid=
finalizar() {
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi
    if [[ -f "$dir/data/postmaster.pid" ]]; then pg_ctl -D "$dir/data" -m fast stop >/dev/null; fi
    rm -rf -- "$dir"
}
trap finalizar EXIT
initdb -D "$dir/data" -A trust >/dev/null
if ! pg_ctl -D "$dir/data" -o "-k $dir -h '' -p 5432" -l "$dir/postgres.log" start; then
    cat "$dir/postgres.log" >&2
    exit 1
fi
export ConnectionStrings__Padrao="Host=$dir;Port=5432;Database=cinema_teste;Username=$(id -un)"
dotnet build CinemaSwagger.csproj -c Release
export ASPNETCORE_URLS=http://127.0.0.1:0
iniciar() {
    : >"$dir/api.log"
    dotnet bin/Release/net10.0/CinemaSwagger.dll >"$dir/api.log" 2>&1 &
    pid=$!
    for ((i=0;i<200;i++)); do
        base=$(sed -n 's/.*Now listening on: \(http:\/\/127.0.0.1:[0-9]*\).*/\1/p' "$dir/api.log")
        if [[ -n "$base" ]]; then return; fi
        if ! kill -0 "$pid" 2>/dev/null; then cat "$dir/api.log"; return 1; fi
        sleep .1
    done
    cat "$dir/api.log"
    return 1
}
iniciar
kill "$pid"
wait "$pid"
iniciar
python3 ../tests/fluxos.py "$base" "$dir" "$(id -un)"
if [[ "${1:-}" == --web ]]; then
    cd ../frontend
    npm ci --prefer-offline
    npm run build
    node tests/navegador.mjs "$base" "$dir/chrome"
fi
