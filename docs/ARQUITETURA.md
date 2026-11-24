# Arquitetura

Na pasta CinemaSwagger, Program.cs registra os controllers, o DbContext por requisição, o provedor Npgsql e o Swagger com comentários XML. O perfil HTTP em Properties escolhe a porta 5254.

Controllers recebe os pedidos e aplica as regras específicas de cada recurso. Em Models, os DTOs restringem os campos aceitos e os modelos de resposta projetam os dados relacionados. O cliente informa a quantidade, enquanto o servidor define status inicial, data e valor da reserva.

Data/AppDbContext configura relacionamentos, precisão e restrições. Migrations contém o histórico incremental e o snapshot que o EF usa para calcular a próxima alteração.

Data/TransacaoDeEscrita abre uma transação antes de executar uma ação de escrita e adquire um advisory lock transacional do PostgreSQL. As instâncias da API compartilham a chave. A próxima ação lê as mudanças confirmadas pela anterior com o isolamento padrão Read Committed. Uma exceção descarta a transação. O bloqueio único simplifica a disputa entre operações que alteram duas sessões, a grade de salas ou a duração de filmes. Ele limita a vazão de escritas independentes. Escritores SQL externos precisam seguir o mesmo protocolo para preservar as regras entre registros.

As leituras seguem em paralelo. Disponibilidade projeta filme, capacidade e soma das reservas confirmadas numa consulta. A pasta tests reúne o projeto xUnit e os roteiros que exercitam PostgreSQL e HTTP.
