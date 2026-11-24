using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;

namespace CinemaSwagger.Data;

/// <summary>Serializa as alterações da API antes de consultar agenda ou ocupação.</summary>
public sealed class TransacaoDeEscrita(AppDbContext db) : IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        if (HttpMethods.IsGet(context.HttpContext.Request.Method))
        {
            await next();
            return;
        }

        var cancelamento = context.HttpContext.RequestAborted;
        await using var transacao = await db.Database.BeginTransactionAsync(cancelamento);
        // Chave compartilhada entre as instâncias desta API. O PostgreSQL libera-a no fim da transação.
        await db.Database.ExecuteSqlRawAsync("SELECT pg_advisory_xact_lock(5254, 1)", cancelamento);
        var resultado = await next();
        if (resultado.Exception is null)
            await transacao.CommitAsync(cancelamento);
    }
}
