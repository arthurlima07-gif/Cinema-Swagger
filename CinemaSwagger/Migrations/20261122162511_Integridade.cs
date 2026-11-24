using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CinemaSwagger.Migrations
{
    /// <inheritdoc />
    public partial class Integridade : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM "Sessoes" s JOIN "Reservas" r ON r."SessaoId" = s."Id"
                        WHERE r."Status" = 'Confirmada' GROUP BY s."Id"
                        HAVING SUM(r."QuantidadeLugares") > s."Capacidade"
                    ) THEN
                        RAISE EXCEPTION 'Existem sessões acima da capacidade. Revise as reservas antes de migrar.';
                    END IF;
                END $$;
                """);

            migrationBuilder.AddCheckConstraint(
                name: "CK_Sessoes_Limites",
                table: "Sessoes",
                sql: "\"Capacidade\" BETWEEN 1 AND 1000 AND \"Preco\" BETWEEN 0 AND 10000");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Reservas_Limites",
                table: "Reservas",
                sql: "\"QuantidadeLugares\" BETWEEN 1 AND 10 AND \"Status\" IN ('Confirmada', 'Cancelada')");

            migrationBuilder.AddCheckConstraint(
                name: "CK_Filmes_Duracao",
                table: "Filmes",
                sql: "\"DuracaoMinutos\" BETWEEN 1 AND 600");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_Sessoes_Limites",
                table: "Sessoes");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Reservas_Limites",
                table: "Reservas");

            migrationBuilder.DropCheckConstraint(
                name: "CK_Filmes_Duracao",
                table: "Filmes");
        }
    }
}
