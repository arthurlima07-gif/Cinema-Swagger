# Testes e evidências

Execução em Arch Linux com SDK 10.0.114, dotnet-ef 10.0.14 e PostgreSQL 18.7. Ambos os roteiros usam clusters privados criados por initdb. Precisam ser executados por um usuário comum com acesso ao diretório temporário.

| Verificação | Esperado | Obtido nesta execução |
|---|---|---|
| Restore da solução | Restaurar API e xUnit | Concluído com cache local. NU1900 na consulta de avisos online |
| Build Debug e Release | Compilar ambos os projetos | Zero erros nos dois builds |
| Modelo EF | Snapshot igual ao modelo | EF informou ausência de mudanças pendentes |
| Banco novo e atualização incremental | Aplicar quatro migrations em ordem | Scripts gerados pelo EF e executados por postgres --single |
| Carga inicial | 3 filmes, 3 sessões futuras e 2 reservas | Contagens confirmadas |
| Integridade | Rejeitar exclusão de filme vinculado e três valores inválidos, excluir reservas em cascata | PostgreSQL cumpriu as cinco verificações |
| Disponibilidade no banco | 80 lugares menos 2 confirmados na primeira sessão | 78 livres |
| OpenAPI | Gerar os contratos dos quatro módulos | Uma cópia temporária da inicialização resolveu ISwaggerProvider em processo e gerou 20 operações e 10 schemas |
| Projeção EF | Traduzir filtros de disponibilidade | Npgsql gerou SQL para lugares livres e sessões futuras |
| dotnet test | Executar as duas entradas xUnit | Testhost abortou antes da execução com SocketException (13) |
| Inicialização normal, segunda inicialização, Swagger UI e HTTP | Migrar via Npgsql, preservar contagens e servir as rotas | Bloqueados. PostgreSQL não conseguiu criar o socket privado e a tentativa independente de dotnet run falhou na conexão |
| Disputa pelos últimos lugares | Uma confirmação, um 409, zero lugares livres | Cenário implementado, execução HTTP pendente |

A suíte de banco passou nas dez verificações, incluindo os quatro registros no histórico das migrations. Houve zero asserções reprovadas nessa suíte. A suíte HTTP ficou bloqueada antes da primeira resposta. A contagem de aprovações exclui esse roteiro.

## Reproduzir

A partir da raiz do repositório:

```bash
dotnet restore CinemaSwagger/CinemaSwagger.sln
dotnet build CinemaSwagger/CinemaSwagger.sln
dotnet test CinemaSwagger/CinemaSwagger.sln
dotnet build CinemaSwagger/CinemaSwagger.sln -c Release
```

Para diagnóstico independente, execute `python3 tests/banco.py` após o build Debug e `bash tests/integracao.sh`. O primeiro verifica as migrations com o motor PostgreSQL em modo monousuário. O segundo cria um servidor privado, inicia a API duas vezes e faz requisições a uma porta HTTP atribuída pelo sistema. Ao terminar, remove somente o próprio cluster.

O roteiro HTTP verifica limites 0, 1, 10, 11 e negativos, horário passado, lotação, atualização, troca de sessão, cancelamento repetido, reativação sem espaço e após o início, exclusão e disponibilidade. Para agenda, usa sessões simultâneas em salas diferentes, consecutivas e sobrepostas atravessando a meia-noite. Verifica ainda edição de duração, redução de capacidade, CRUD e cabeçalhos Location. As datas de teste são relativas ao relógio UTC da execução.

## Revalidação do bloqueio de execução

O processo de teste no Linux tinha filtro seccomp ativo. Uma sonda Python independente da aplicação recebeu EPERM ao criar um socket IPv4 e ao tentar bind de um socket Unix. O PostgreSQL 18.7 inicializou o cluster privado e falhou no bind Unix com a mesma restrição. VSTest abortou ao abrir o TcpListener usado para comunicar com o testhost. Nessas condições, pg_isready na porta 5433 não permite concluir se o serviço do host está parado. A execução da suíte fora do sandbox foi rejeitada pela política de aprovação do ambiente.

A suíte HTTP passou a abrir /swagger seguindo o redirecionamento, conferir o HTML e consultar a coleção de disponibilidade com filtros. Uma barreira sincroniza os dois clientes antes da disputa pelos últimos dez lugares. O roteiro agora preserva a mensagem de falha do servidor PostgreSQL no resultado do teste e usa uma porta explícita no socket privado. A suíte de banco invocada por xUnit seleciona o build Debug ou Release correspondente ao teste. As requisições e a disputa permanecem pendentes de execução em um runner com sockets locais.

## Banco persistente da apresentação

Foi criado um cluster exclusivo em `.cinema-local/postgres` com PostgreSQL 18.7 e autenticação peer. O banco `cinema` foi criado e consultado como `arthur` em modo monousuário. O script idempotente gerado por `dotnet ef migrations script --idempotent` foi aplicado duas vezes. Após cada execução, o PostgreSQL retornou quatro registros no histórico, três filmes, três sessões e duas reservas. O cluster foi fechado normalmente e está preparado para ser iniciado por `./iniciar-local.sh`.

Nesta rodada, restore, builds Debug e Release e a verificação do snapshot concluíram. A suíte isolada de banco passou novamente nas dez verificações. A validação de sintaxe do inicializador também passou. O caso HTTP de PATCH sem o parâmetro valor integra o roteiro. A abertura do servidor, a comunicação pelo Npgsql, a interface do Swagger e os casos HTTP, incluindo concorrência, dependem da execução no terminal local com sockets habilitados. Os comandos de inicialização, consulta e encerramento estão no README.

## Regressão da exclusão de filmes no Arch Linux

Com PostgreSQL 18.7 e locale pt_BR.utf8, a versão anterior de banco.py reproduziu a falha na exclusão do filme 1. O backend monousuário registrava a gravidade como ERRO e podia terminar com código zero. O filtro por ERROR em stderr perdia a violação. O teste corrigido exige a condição SQL esperada e confere CONSTRAINT_NAME com GET STACKED DIAGNOSTICS. Uma consulta ao final de cada lote confirma que ele terminou.

As 14 verificações passaram em dois clusters temporários, um com LC_ALL=pt_BR.utf8 e outro com LC_ALL=C. A sessão 1 apontava para o filme 1 e o catálogo confirmou a FK validada com ON DELETE RESTRICT. A primeira tentativa de exclusão preservou o filme. Após excluir a sessão, o teste excluiu o filme e confirmou a ausência do registro. Dois controles adicionais comprovaram que o teste falha se o nome da constraint estiver errado ou se o DELETE que deveria falhar for aceito.

Na execução do Arch informada pelo usuário antes da correção, a suíte HTTP passou e a de banco falhou. Nesta revisão, a tentativa de executar a solução completa no sandbox foi interrompida pelo VSTest ao criar o socket do testhost. A confirmação conjunta após a correção depende de rodar a solução no terminal com sockets habilitados.

## Suíte ampliada para os 20 endpoints

Na raiz, execute `dotnet test CinemaSwagger/CinemaSwagger.sln`. O teste inicia e encerra sua própria API e seu próprio cluster. O PostgreSQL da apresentação pode permanecer em execução. Para ver a contagem de respostas HTTP e as mensagens de cada roteiro, use `dotnet test CinemaSwagger/CinemaSwagger.sln --logger "console;verbosity=detailed"`.

O xUnit apresenta **dois testes**. O primeiro executa 14 verificações de banco. O segundo percorre o fluxo HTTP e compara as combinações de método e rota que responderam com sucesso com as operações publicadas no OpenAPI. Uma operação ausente, uma resposta inesperada ou uma divergência de persistência reprova o roteiro.

| Módulo | Operações exigidas | Verificações do fluxo HTTP |
|---|---:|---|
| Filmes | 6 | CRUD, leitura do título editado, alteração de cartaz, validação, ausência e conflito ao excluir filme com sessões |
| Sessões | 5 | Associação, horário UTC, edição de capacidade, salas diferentes, horários consecutivos, conflito após a meia-noite e proteção de sessões com reservas |
| Reservas | 7 | CRUD, consulta individual após PUT com cada quantidade de 1 a 10, valor total, troca de sessão, cancelamento e reativação, lotação, horário passado e dois POST concorrentes |
| Disponibilidade | 2 | Lista e detalhe, capacidade, ocupados, livres e lotação. Os filtros por filme, sessões futuras e lugares livres são exercitados com sessões que devem entrar e sair do resultado |

Durante a disputa, duas requisições pedem os mesmos últimos dez lugares. O roteiro exige um HTTP 201 e um HTTP 409. Uma conexão independente via psql lê as reservas confirmadas e a capacidade no banco cinema_teste. A soma é comparada com o resultado esperado e com a disponibilidade informada pela API. No fim, consultas SQL conferem a exclusão do filme, de suas sessões e das respectivas reservas.

O usuário confirmou dois testes aprovados no Arch para a versão anterior à ampliação. O resultado local dessa versão serve como referência. A execução HTTP com as verificações adicionais ainda precisa ser confirmada em ambiente com sockets locais habilitados.

O fluxo também verifica o estado depois de requisições recusadas. Após uma tentativa de transferir uma reserva para sessão lotada, o GET individual e uma consulta SQL devem apontar para a sessão original. Uma reativação recusada deve preservar o status Cancelada. Uma edição com quantidade inválida ou sessão inexistente deve preservar a quantidade e a ocupação. Para um filme ausente, GET, PUT, PATCH e DELETE devem retornar 404.

Os roteiros encerram com erro se a otimização do Python desabilitar as asserções. Isso evita que a execução registre sucesso com verificações omitidas.
