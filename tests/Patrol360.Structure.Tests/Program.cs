using System.Xml.Linq;

var repoRoot = FindRepoRoot(AppContext.BaseDirectory);
var failures = new List<string>();

RequireDirectory("apps");
RequireDirectory("apps/api");
RequireDirectory("apps/web");
RequireDirectory("apps/worker");
RequireDirectory("libs/domain");
RequireDirectory("libs/application");
RequireDirectory("libs/contracts");
RequireDirectory("libs/infrastructure");
RequireDirectory(".github/workflows");
RequireDirectory("docs/adr");
RequireDirectory("docs/runbooks");
RequireDirectory("infra/docker");
RequireDirectory("infra/env");
RequireDirectory("legacy");
RequireDirectory("legacy/territory-patrol-panel");
RequireDirectory("tests");
RequireDirectory("tests/Patrol360.Domain.Tests");
RequireDirectory("tests/Patrol360.Application.Tests");
RequireDirectory("tests/Patrol360.Infrastructure.Tests");
RequireDirectory("tests/Patrol360.Api.Tests");
RequireDirectory("tests/Patrol360.Worker.Tests");
RequireDirectory("tests/Patrol360.Structure.Tests");
RequireDirectory("tests/web/unit");
RequireDirectory("tests/web/e2e");
RequireDirectory("tools");

RequireFile("Patrol360.slnx");
RequireFile(".editorconfig");
RequireFile(".gitattributes");
RequireFile(".gitignore");
RequireFile(".github/workflows/ci.yml");
RequireFile("docs/adr/0001-monorepo-modular-monolith.md");
RequireFile("docs/adr/0002-layer-dependency-rules.md");
RequireFile("docs/adr/0003-frontend-data-source-boundaries.md");
RequireFile("docs/runbooks/local-dev.md");
RequireFile("docs/runbooks/database-migrations.md");
RequireFile("docs/runbooks/release-checklist.md");
RequireFile("infra/README.md");
RequireFile("infra/env/.env.example");
RequireFile("legacy/README.md");
RequireFile("legacy/territory-patrol-panel/README.md");
RequireFile("tools/Verify-TextEncoding.ps1");
RequireFile("tools/Clean-Workspace.ps1");
RequireFile("tools/Test-All.ps1");
RequireFile("tools/Check-Structure.ps1");
RequireFile("tests/web/unit/run-unit-tests.mjs");
RequireFile("tests/web/e2e/README.md");

AssertReferences("libs/domain/Patrol360.Domain.csproj");
AssertReferences("libs/contracts/Patrol360.Contracts.csproj");
AssertReferences(
  "libs/application/Patrol360.Application.csproj",
  "libs/domain/Patrol360.Domain.csproj",
  "libs/contracts/Patrol360.Contracts.csproj");
AssertReferences(
  "libs/infrastructure/Patrol360.Infrastructure.csproj",
  "libs/application/Patrol360.Application.csproj",
  "libs/domain/Patrol360.Domain.csproj",
  "libs/contracts/Patrol360.Contracts.csproj");
AssertReferences(
  "apps/api/Patrol360.Api.csproj",
  "libs/application/Patrol360.Application.csproj",
  "libs/contracts/Patrol360.Contracts.csproj",
  "libs/infrastructure/Patrol360.Infrastructure.csproj");
AssertReferences(
    "apps/worker/Patrol360.Worker.csproj",
    "libs/application/Patrol360.Application.csproj",
    "libs/infrastructure/Patrol360.Infrastructure.csproj");
AssertReferences(
    "tests/Patrol360.Domain.Tests/Patrol360.Domain.Tests.csproj",
    "libs/domain/Patrol360.Domain.csproj");
AssertReferences(
    "tests/Patrol360.Application.Tests/Patrol360.Application.Tests.csproj",
    "libs/application/Patrol360.Application.csproj",
    "libs/contracts/Patrol360.Contracts.csproj");
AssertReferences(
    "tests/Patrol360.Infrastructure.Tests/Patrol360.Infrastructure.Tests.csproj",
    "libs/infrastructure/Patrol360.Infrastructure.csproj");
AssertReferences(
    "tests/Patrol360.Api.Tests/Patrol360.Api.Tests.csproj",
    "apps/api/Patrol360.Api.csproj");
AssertReferences(
    "tests/Patrol360.Worker.Tests/Patrol360.Worker.Tests.csproj",
    "apps/worker/Patrol360.Worker.csproj");

AssertFileContains(".editorconfig", "end_of_line = lf");
AssertFileContains(".gitattributes", "* text=auto eol=lf");
AssertGitIgnoreContains("bin/");
AssertGitIgnoreContains("obj/");
AssertGitIgnoreContains("node_modules/");
AssertGitIgnoreContains("dist/");
AssertGitIgnoreContains("output/");
AssertGitIgnoreContains("TestResults/");
AssertGitIgnoreContains("coverage/");

AssertSolutionContains("apps/api/Patrol360.Api.csproj");
AssertSolutionContains("apps/worker/Patrol360.Worker.csproj");
AssertSolutionContains("libs/domain/Patrol360.Domain.csproj");
AssertSolutionContains("libs/application/Patrol360.Application.csproj");
AssertSolutionContains("libs/contracts/Patrol360.Contracts.csproj");
AssertSolutionContains("libs/infrastructure/Patrol360.Infrastructure.csproj");
AssertSolutionContains("tests/Patrol360.Api.Tests/Patrol360.Api.Tests.csproj");
AssertSolutionContains("tests/Patrol360.Application.Tests/Patrol360.Application.Tests.csproj");
AssertSolutionContains("tests/Patrol360.Domain.Tests/Patrol360.Domain.Tests.csproj");
AssertSolutionContains("tests/Patrol360.Infrastructure.Tests/Patrol360.Infrastructure.Tests.csproj");
AssertSolutionContains("tests/Patrol360.Structure.Tests/Patrol360.Structure.Tests.csproj");
AssertSolutionContains("tests/Patrol360.Worker.Tests/Patrol360.Worker.Tests.csproj");
AssertFileDoesNotContain("Patrol360.slnx", "legacy/");
AssertFileDoesNotContain("Patrol360.slnx", "territory-patrol-panel");
AssertFileContains(".github/workflows/ci.yml", "Structure tests");
AssertFileContains(".github/workflows/ci.yml", "Frontend structural tests");
AssertFileContains(".github/workflows/ci.yml", "dotnet test");
AssertFileContains("apps/web/package.json", "\"test:run\"");
AssertFileContains("apps/web/package.json", "\"test:e2e\"");
RequireFile("apps/web/playwright.config.ts");
RequireFile("apps/web/e2e/dashboard.spec.ts");
RequireFile("apps/web/src/test/setup.ts");
RequireFile("apps/web/src/__tests__/ui.test.tsx");
AssertDirectoryDoesNotContain("libs/domain", [
    "Microsoft.EntityFrameworkCore",
    "Microsoft.AspNetCore",
    "Npgsql",
    "RabbitMQ",
    "Redis",
    "MinIO",
    "Persistence"
]);
AssertDirectoryDoesNotContain("libs/contracts", [
    "Microsoft.EntityFrameworkCore",
    "Microsoft.AspNetCore",
    "Npgsql",
    "Persistence.Entities"
]);
AssertDirectoryDoesNotContain("apps/api/Controllers", [
    "Persistence.Entities",
    "Patrol360DbContext"
]);

if (Directory.Exists(Path.Combine(repoRoot, "territory-patrol-panel")))
{
    failures.Add("Root territory-patrol-panel should be moved to legacy/territory-patrol-panel or explicitly removed.");
}

if (failures.Count > 0)
{
    Console.Error.WriteLine("Structure checks failed:");
    foreach (var failure in failures)
    {
        Console.Error.WriteLine($"- {failure}");
    }

    return 1;
}

Console.WriteLine("Structure checks passed.");
return 0;

void RequireDirectory(string relativePath)
{
    if (!Directory.Exists(Path.Combine(repoRoot, NormalizePath(relativePath))))
    {
        failures.Add($"Missing directory: {relativePath}");
    }
}

void RequireFile(string relativePath)
{
    if (!File.Exists(Path.Combine(repoRoot, NormalizePath(relativePath))))
    {
        failures.Add($"Missing file: {relativePath}");
    }
}

void AssertReferences(string projectRelativePath, params string[] expectedReferences)
{
    var actual = ReadProjectReferences(projectRelativePath);
    var expected = expectedReferences.Select(NormalizeProjectPath).Order(StringComparer.OrdinalIgnoreCase).ToArray();

    var missing = expected.Except(actual, StringComparer.OrdinalIgnoreCase).ToArray();
    var extra = actual.Except(expected, StringComparer.OrdinalIgnoreCase).ToArray();

    foreach (var item in missing)
    {
        failures.Add($"{projectRelativePath} is missing ProjectReference to {item}");
    }

    foreach (var item in extra)
    {
        failures.Add($"{projectRelativePath} has forbidden ProjectReference to {item}");
    }
}

string[] ReadProjectReferences(string projectRelativePath)
{
    var projectPath = Path.Combine(repoRoot, NormalizePath(projectRelativePath));
    if (!File.Exists(projectPath))
    {
        failures.Add($"Cannot read missing project: {projectRelativePath}");
        return [];
    }

    var projectDirectory = Path.GetDirectoryName(projectPath) ?? repoRoot;
    var document = XDocument.Load(projectPath);

    return document
      .Descendants("ProjectReference")
      .Select(reference => reference.Attribute("Include")?.Value)
      .Where(include => !string.IsNullOrWhiteSpace(include))
      .Select(include => Path.GetFullPath(Path.Combine(projectDirectory, include!)))
      .Select(path => Path.GetRelativePath(repoRoot, path).Replace('\\', '/'))
      .Order(StringComparer.OrdinalIgnoreCase)
      .ToArray();
}

void AssertFileContains(string relativePath, string expectedText)
{
    var filePath = Path.Combine(repoRoot, NormalizePath(relativePath));
    if (!File.Exists(filePath))
    {
        failures.Add($"Cannot inspect missing file: {relativePath}");
        return;
    }

    var text = File.ReadAllText(filePath);
    if (!text.Contains(expectedText, StringComparison.Ordinal))
    {
        failures.Add($"{relativePath} should contain '{expectedText}'");
    }
}

void AssertFileDoesNotContain(string relativePath, string forbiddenText)
{
    var filePath = Path.Combine(repoRoot, NormalizePath(relativePath));
    if (!File.Exists(filePath))
    {
        failures.Add($"Cannot inspect missing file: {relativePath}");
        return;
    }

    var text = File.ReadAllText(filePath);
    if (text.Contains(forbiddenText, StringComparison.OrdinalIgnoreCase))
    {
        failures.Add($"{relativePath} should not contain '{forbiddenText}'");
    }
}

void AssertDirectoryDoesNotContain(string relativePath, string[] forbiddenTexts)
{
    var directoryPath = Path.Combine(repoRoot, NormalizePath(relativePath));
    if (!Directory.Exists(directoryPath))
    {
        failures.Add($"Cannot inspect missing directory: {relativePath}");
        return;
    }

    foreach (var filePath in Directory.EnumerateFiles(directoryPath, "*.*", SearchOption.AllDirectories)
        .Where(path => path.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) ||
                       path.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase)))
    {
        var text = File.ReadAllText(filePath);
        foreach (var forbiddenText in forbiddenTexts)
        {
            if (text.Contains(forbiddenText, StringComparison.OrdinalIgnoreCase))
            {
                var displayPath = Path.GetRelativePath(repoRoot, filePath).Replace('\\', '/');
                failures.Add($"{displayPath} contains forbidden structural dependency marker '{forbiddenText}'");
            }
        }
    }
}

void AssertGitIgnoreContains(string pattern)
{
    AssertFileContains(".gitignore", pattern);
}

void AssertSolutionContains(string projectRelativePath)
{
    AssertFileContains("Patrol360.slnx", $"Path=\"{projectRelativePath}\"");
}

string NormalizeProjectPath(string path)
{
    return path.Replace('\\', '/');
}

string NormalizePath(string path)
{
    return path.Replace('/', Path.DirectorySeparatorChar);
}

static string FindRepoRoot(string startPath)
{
    var current = new DirectoryInfo(startPath);

    while (current is not null)
    {
        if (File.Exists(Path.Combine(current.FullName, "Patrol360.slnx")))
        {
            return current.FullName;
        }

        current = current.Parent;
    }

    throw new InvalidOperationException("Cannot find repository root with Patrol360.slnx.");
}
