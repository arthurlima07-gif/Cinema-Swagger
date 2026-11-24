# Demonstração acadêmica

1. Apresente o objetivo de manter uma programação de cinema com reserva de lugares. Mostre o diagrama do banco e explique por que uma reserva pertence a uma única sessão.
2. Abra Program.cs e siga o percurso de um POST desde ASP.NET Core e validação do DTO até o controller, a transação EF Core e o PostgreSQL. Mostre os campos de preço total e status definidos pelo servidor.
3. Abra o Swagger em /swagger. Em Filmes, crie um filme de 120 minutos e anote o ID retornado. Em Sessões, use esse ID, sala Mostra, capacidade 20, preço 25 e um horário futuro UTC com Z.
4. Consulte Disponibilidade pelo ID. Crie reservas de 5 e 10 lugares. Mostre a sequência de livres 20, 15 e 5. Uma terceira reserva de 6 deve retornar 409.
5. Cancele a primeira reserva para obter 10 livres. Reative-a e confira 5 livres. Tente iniciar outra sessão na mesma sala uma hora depois da primeira e explique o 409.
6. Tente excluir o filme e confira o conflito. Exclua a sessão, consulte as reservas pelo filtro sessaoId e então exclua o filme. Use apenas os registros criados para esta demonstração.
7. Mostre a suíte que disputa os últimos lugares e o resultado registrado em TESTES.md. Conclua relacionando transação, capacidade e disponibilidade exibida.
