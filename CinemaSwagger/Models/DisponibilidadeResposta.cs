namespace CinemaSwagger.Models;

/// <summary>Situação de lugares de uma sessão: capacidade, reservados e livres.</summary>
public record DisponibilidadeResposta
{
    /// <summary>Id da sessão.</summary>
    public required int SessaoId { get; init; }
    /// <summary>Id do filme da sessão.</summary>
    public required int FilmeId { get; init; }
    /// <summary>Título do filme.</summary>
    public required string TituloFilme { get; init; }
    /// <summary>Sala da sessão.</summary>
    public required string Sala { get; init; }
    /// <summary>Início da sessão, em UTC.</summary>
    public required DateTime DataHora { get; init; }
    /// <summary>Preço de um ingresso, em reais.</summary>
    public required decimal Preco { get; init; }
    /// <summary>Total de lugares da sessão.</summary>
    public required int Capacidade { get; init; }
    /// <summary>Lugares ocupados por reservas Confirmadas.</summary>
    public required int LugaresReservados { get; init; }
    /// <summary>Capacidade menos os lugares reservados.</summary>
    public required int LugaresLivres { get; init; }
    /// <summary>true quando não há mais lugares livres.</summary>
    public required bool Esgotada { get; init; }
    /// <summary>true quando a sessão já começou (não aceita mais reservas).</summary>
    public required bool JaComecou { get; init; }
}
