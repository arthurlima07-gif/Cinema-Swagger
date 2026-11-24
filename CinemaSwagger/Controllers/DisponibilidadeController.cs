using CinemaSwagger.Data;
using CinemaSwagger.Models;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CinemaSwagger.Controllers;

[ApiController]
[Route("api/[controller]")]
[Produces("application/json")]
public class DisponibilidadeController : ControllerBase
{
    private readonly AppDbContext _db;

    public DisponibilidadeController(AppDbContext db) => _db = db;

    /// <summary>Lista a disponibilidade de lugares das sessões.</summary>
    /// <remarks>
    /// Calculada em tempo real: capacidade da sessão menos os lugares das reservas Confirmadas.
    /// Reservas canceladas não ocupam lugares. Os filtros podem ser combinados.
    /// </remarks>
    /// <param name="filmeId">Filtra pelas sessões de um filme (consulte os Ids em GET /api/Filmes).</param>
    /// <param name="apenasComLugares">true = somente sessões com pelo menos 1 lugar livre.</param>
    /// <param name="apenasFuturas">true = somente sessões que ainda não começaram.</param>
    /// <response code="200">Lista de disponibilidade, da sessão mais próxima para a mais distante (pode estar vazia).</response>
    /// <response code="400">filmeId menor ou igual a zero.</response>
    [HttpGet]
    [ProducesResponseType(typeof(List<DisponibilidadeResposta>), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ValidationProblemDetails), StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<List<DisponibilidadeResposta>>> Listar(
        [FromQuery] int? filmeId,
        [FromQuery] bool? apenasComLugares,
        [FromQuery] bool? apenasFuturas)
    {
        if (filmeId is <= 0)
        {
            ModelState.AddModelError(nameof(filmeId), "O filmeId deve ser maior que zero.");
            return ValidationProblem(ModelState);
        }

        var consulta = Consultar(DateTime.UtcNow);
        if (filmeId.HasValue)
            consulta = consulta.Where(s => s.FilmeId == filmeId.Value);
        if (apenasFuturas == true)
            consulta = consulta.Where(s => !s.JaComecou);
        if (apenasComLugares == true)
            consulta = consulta.Where(s => s.LugaresLivres > 0);

        return await consulta.OrderBy(s => s.DataHora).ToListAsync();
    }

    /// <summary>Consulta a disponibilidade de uma sessão.</summary>
    /// <param name="sessaoId">Id da sessão (consulte em GET /api/Sessoes).</param>
    /// <response code="200">Capacidade, lugares reservados e lugares livres da sessão.</response>
    /// <response code="404">Não existe sessão com esse Id.</response>
    [HttpGet("{sessaoId:int}")]
    [ProducesResponseType(typeof(DisponibilidadeResposta), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ErroResposta), StatusCodes.Status404NotFound)]
    public async Task<ActionResult<DisponibilidadeResposta>> BuscarPorSessao(int sessaoId)
    {
        var sessao = await Consultar(DateTime.UtcNow).FirstOrDefaultAsync(s => s.SessaoId == sessaoId);
        return sessao is null ? NotFound(new ErroResposta("Sessão não encontrada.")) : sessao;
    }

    private IQueryable<DisponibilidadeResposta> Consultar(DateTime agora) =>
        from s in _db.Sessoes.AsNoTracking()
        let ocupados = _db.ReservasConfirmadas.Where(r => r.SessaoId == s.Id).Sum(r => r.QuantidadeLugares)
        select new DisponibilidadeResposta
        {
            SessaoId = s.Id, FilmeId = s.FilmeId, TituloFilme = s.Filme.Titulo, Sala = s.Sala,
            DataHora = s.DataHora, Preco = s.Preco, Capacidade = s.Capacidade,
            LugaresReservados = ocupados, LugaresLivres = s.Capacidade - ocupados,
            Esgotada = ocupados == s.Capacidade, JaComecou = s.DataHora <= agora
        };
}
