using Microsoft.Extensions.Hosting;

namespace Patrol360.Worker.Tests;

public class WorkerSmokeTests
{
    [Fact]
    public void WorkerHostTypeIsBackgroundService()
    {
        Assert.True(typeof(Patrol360.Worker.Worker).IsAssignableTo(typeof(BackgroundService)));
    }

    [Fact]
    public void WebOnlyReleaseChecksBuildExitBeforePublishingExistingDist()
    {
        var repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var script = File.ReadAllText(Path.Combine(repositoryRoot, "infra", "scripts", "update-patrol360-web-only.ps1"));
        var build = script.LastIndexOf("Invoke-ReleaseNative npm run build", StringComparison.Ordinal);
        var merge = script.IndexOf("Merge-PreviousWebAssets", build, StringComparison.Ordinal);
        var imageBuild = script.IndexOf("docker compose @composeArgs build web", build, StringComparison.Ordinal);

        Assert.True(build >= 0 && build < merge && build < imageBuild);
    }

    [Fact]
    public async Task ReleaseNativeWrapperStopsOnStubbedNonZeroExit()
    {
        var repositoryRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", ".."));
        var helper = Path.Combine(repositoryRoot, "infra", "scripts", "ReleaseNative.ps1");
        var command = $". '{helper.Replace("'", "''")}'; Invoke-ReleaseNative cmd.exe /d /c exit 23";
        using var process = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("powershell.exe")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            Arguments = $"-NoProfile -NonInteractive -Command \"{command}\""
        })!;
        await process.WaitForExitAsync();
        Assert.NotEqual(0, process.ExitCode);
    }

    [Fact]
    public void DiagnosticsKeepLastSuccessAndExposeLaterFailure()
    {
        var path = Path.Combine(Path.GetTempPath(), $"worker-heartbeat-{Guid.NewGuid():N}.json");
        try
        {
            var diagnostics = new WorkerDiagnostics(path);
            diagnostics.RecordSuccess("push", "sent=1");
            diagnostics.RecordFailure("push", new TimeoutException("provider unavailable"));

            var json = File.ReadAllText(path);
            Assert.Contains("sent=1", json);
            Assert.Contains("provider unavailable", json);
            Assert.Contains("lastSuccessAt", json, StringComparison.OrdinalIgnoreCase);
            Assert.Contains("lastErrorAt", json, StringComparison.OrdinalIgnoreCase);
        }
        finally
        {
            File.Delete(path);
        }
    }

    [Fact]
    public async Task ProviderTimeoutIsAttemptFailureAndDoesNotStopIndependentDirection()
    {
        var independentRuns = 0;
        Exception? recorded = null;
        var push = WorkerAttempt.RunAsync(_ => throw new OperationCanceledException("provider timeout"), ex => recorded = ex, CancellationToken.None);
        var emu = WorkerAttempt.RunAsync(_ => { independentRuns++; return Task.CompletedTask; }, _ => { }, CancellationToken.None);

        Assert.False(await push);
        Assert.True(await emu);
        Assert.IsType<OperationCanceledException>(recorded);
        Assert.Equal(1, independentRuns);
    }

    [Fact]
    public async Task HostCancellationIsPropagated()
    {
        using var cancellation = new CancellationTokenSource();
        cancellation.Cancel();
        await Assert.ThrowsAsync<OperationCanceledException>(() =>
            WorkerAttempt.RunAsync(_ => throw new OperationCanceledException(cancellation.Token), _ => { }, cancellation.Token));
    }

    [Fact]
    public void DiagnosticsIoFailureDoesNotEscapeIntoWorkerCycle()
    {
        var directoryAsFile = Path.GetTempPath().TrimEnd(Path.DirectorySeparatorChar);
        var diagnostics = new WorkerDiagnostics(directoryAsFile);
        Exception? logged = null;
        var exception = Record.Exception(() => WorkerAttempt.RunDiagnostic(
            () => diagnostics.RecordSuccess("push", "sent=0"), ex => logged = ex));
        Assert.Null(exception);
        Assert.NotNull(logged);
    }
}
