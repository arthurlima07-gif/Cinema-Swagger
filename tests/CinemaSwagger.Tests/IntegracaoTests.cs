using System.Diagnostics;
using Xunit;
using Xunit.Abstractions;

namespace CinemaSwagger.Tests;

public class IntegracaoTests(ITestOutputHelper relatorio)
{
    [Theory]
    [InlineData("python3", "banco.py")]
    [InlineData("bash", "integracao.sh")]
    public async Task ExecutaSuiteEmClusterPrivado(string executavel, string roteiro)
    {
        var pasta = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../.."));
        var inicio = new ProcessStartInfo(executavel)
        {
            WorkingDirectory = pasta,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        inicio.Environment["CINEMA_TEST_BUILD"] = new DirectoryInfo(AppContext.BaseDirectory).Parent!.Name;
        inicio.ArgumentList.Add(roteiro);
        using var processo = Process.Start(inicio)!;
        var saida = processo.StandardOutput.ReadToEndAsync();
        var erros = processo.StandardError.ReadToEndAsync();
        await processo.WaitForExitAsync();
        relatorio.WriteLine(await saida);
        relatorio.WriteLine(await erros);
        Assert.True(processo.ExitCode == 0, $"A suíte {roteiro} terminou com código {processo.ExitCode}.");
    }
}
