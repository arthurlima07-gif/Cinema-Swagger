# CinemaSwagger

O CinemaSwagger é um sistema web de gestão de cinema desenvolvido como trabalho final da disciplina de **Técnicas Avançadas de Programação**. A equipe do cinema pode organizar o catálogo, programar exibições por sala e gerenciar reservas. Quem consulta a programação pode escolher um filme e conferir os horários, o preço e a quantidade de lugares livres em cada sessão.

A interface React e o Swagger acessam a mesma API REST. A API aplica as regras de negócio e persiste os dados no PostgreSQL. Cada filme pode ter várias sessões, e cada sessão reúne suas próprias reservas. Ao cancelar uma reserva, por exemplo, os lugares voltam a aparecer como disponíveis tanto na interface quanto na API.

**Integrantes:** Arthur F., Bruno S., Guilherme Z., Rafael D. e Matheus B.

## Funcionalidades

| Módulo | O que ele permite fazer |
| - | - |
| Filmes | Consultar detalhes, cadastrar e editar títulos, alterar o estado em cartaz e excluir filmes sem sessões vinculadas. |
| Sessões | Programar exibições por filme, sala e horário, definir preço e capacidade e consultar a agenda. A duração do filme determina quando a sala volta a ficar livre. |
| Reservas | Reservar de 1 a 10 lugares por operação, editar a quantidade, cancelar, reativar ou excluir uma reserva. A criação e a reativação exigem lugares livres e uma sessão que ainda vai começar. |
| Disponibilidade | Consultar capacidade, lugares ocupados e livres por sessão e filtrar por filme, sessões futuras ou sessões com vagas. Apenas reservas confirmadas contam para a ocupação. |
| Painel de gerenciamento | Acompanhar filmes, sessões, reservas e ocupação em um só lugar e acessar as telas de cadastro e edição. |


## Tecnologias e ferramentas

| Camada | Tecnologias | Função no projeto |
| - | - | - |
| Interface web | React, TypeScript e CSS | Catálogo, formulários e painel responsivo. |
| Desenvolvimento do frontend | Node.js, npm e Vite | Instalação das dependências, compilação e encaminhamento das chamadas HTTP para a API. |
| API REST | C\# e ASP.NET Core no .NET 10 | Endpoints de filmes, sessões, reservas e disponibilidade. |
| Persistência | PostgreSQL, Entity Framework Core e Npgsql | Armazenamento dos dados, consultas e evolução do esquema por migrations. |
| Documentação da API | OpenAPI e Swagger UI com Swashbuckle | Consulta dos contratos e execução de requisições pelo navegador. |
| Testes | xUnit, Python 3 e Bash | Execução da suíte de integração com requisições HTTP e PostgreSQL isolado. |


## Executar no Arch Linux

Use o SDK .NET 10, PostgreSQL, curl e Node.js 22.12 ou superior com npm. A suíte usa também Python 3, Bash e dotnet-ef 10. Na raiz do repositório, execute o script com seu usuário do Arch. Se o cluster já existir, use o usuário que o criou.

```
./iniciar-local.sh
```

Abra a [interface do cinema](http://localhost:5173/). A documentação continua no [Swagger](http://localhost:5254/swagger). O script instala as dependências do frontend, compila a aplicação e inicia os três serviços. O banco persistente se chama `cinema`. O cluster fica em `.cinema-local/postgres` com acesso pelo socket Unix privado na porta 5433. A autenticação peer usa o usuário do Arch. O serviço PostgreSQL do sistema pode continuar em sua própria porta. O projeto prepara o cluster na primeira execução em uma cópia nova e o reutiliza nas próximas. A API aplica automaticamente as migrations pendentes.

Para conferir o banco e o Swagger, abra outro terminal na raiz do repositório.

```
psql -h "$PWD/.cinema-local/postgres" -p 5433 -U "$(id -un)" -d cinema -c '\dt'
curl -fsSL http://localhost:5254/swagger -o /dev/null -w 'Swagger HTTP %{http_code}\n'
curl -fsS http://localhost:5254/api/Disponibilidade
```

Ctrl+C encerra o frontend, a API e o PostgreSQL iniciado pelo script. Se o cluster já estava em execução e você quiser encerrá-lo manualmente, use:

```
pg_ctl -D "$PWD/.cinema-local/postgres" -m fast -w stop
```

Para usar um servidor PostgreSQL próprio por TCP, configure `ConnectionStrings__Padrao` no terminal e execute diretamente `dotnet run --project CinemaSwagger/CinemaSwagger.csproj --launch-profile http` na raiz. O formato é `Host=localhost;Port=5433;Database=cinema;Username=SEU_USUARIO;Password=SUA_SENHA`. Escolha um banco destinado ao projeto e um usuário com permissão de migration.

Em banco novo, a carga inicial contém três filmes, três sessões e duas reservas. A migration agenda as sessões de exemplo com antecedência de pelo menos sete dias quando as datas originais estão próximas ou já passaram. Reiniciar preserva a agenda. Para demonstrar reservas em instalações antigas, cadastre uma sessão futura.

## Interface React

O catálogo inicial apresenta os filmes cadastrados e dá acesso às sessões de cada filme. As páginas Filmes, Sessões e Reservas oferecem cadastro, edição e confirmação de exclusão. Disponibilidade consulta capacidade, ocupação e lugares livres. Painel reúne os indicadores e atalhos de gerenciamento. Os horários exibidos são locais e os formulários enviam instantes UTC à API.

Em frontend/src, App.tsx contém a navegação e as páginas, Editor.tsx contém os formulários, api.ts reúne os contratos e o cliente HTTP, e style.css define o layout responsivo. O navegador solicita /api na mesma origem. O Vite encaminha as requisições para o ASP.NET. Para trocar o destino em desenvolvimento, copie frontend/.env.example para frontend/.env e ajuste CINEMA\_BACKEND\_URL.

A partir da raiz, rode os testes de componentes com `npm --prefix frontend test` após instalar as dependências. Para validar o navegador, execute `bash tests/integracao.sh --web`. O roteiro inicia um banco temporário, executa a suíte HTTP, abre as seis páginas em duas larguras e verifica cadastro e edição de filme, criação de sessão, reserva, cancelamento, reativação e exclusão pela interface. A disponibilidade da API é conferida a cada alteração da reserva. Ele requer Chrome instalado no Arch. Para usar Chromium, defina `CHROME_BIN=chromium`.

## Contratos

| Recurso | Operações |
| - | - |
| /api/Filmes | GET e POST na coleção, GET, PUT e DELETE em /\{id\}, PATCH /\{id\}/em-cartaz?valor=true |
| /api/Sessoes | GET e POST na coleção, GET, PUT e DELETE em /\{id\} |
| /api/Reservas | GET e POST na coleção, GET, PUT e DELETE em /\{id\}, PATCH /\{id\}/cancelar e /\{id\}/reativar |
| /api/Disponibilidade | GET na coleção, GET /\{sessaoId\} |


POST retorna 201 com Location. Consultas e PATCH retornam 200. PUT e DELETE retornam 204. Entrada inválida retorna 400, recurso ausente retorna 404 e conflito de negócio retorna 409. Falhas inesperadas retornam 500.

```
curl 'http://localhost:5254/api/Disponibilidade?apenasFuturas=true'
curl -H 'Content-Type: application/json' -d '{"sessaoId":1,"nomeCliente":"Ana Silva","email":"ana@example.org","quantidadeLugares":2}' http://localhost:5254/api/Reservas
```

## Testar e compilar para entrega

Na raiz do repositório, execute os comandos abaixo com um usuário que possa abrir sockets locais e criar clusters temporários.

```
cd CinemaSwagger
export PATH="$PATH:$HOME/.dotnet/tools"
dotnet restore CinemaSwagger.sln
dotnet build CinemaSwagger.sln
dotnet test CinemaSwagger.sln --no-build
dotnet build CinemaSwagger.sln -c Release
```

Em caso de falha de conexão, confira a porta, o serviço, a autenticação em pg\_hba.conf e a variável no mesmo terminal da API. Se o EF rejeitar uma constraint durante atualização, revise os registros indicados antes de reaplicar. NU1900 indica indisponibilidade da fonte de avisos do NuGet. Repita o restore com acesso à fonte.

