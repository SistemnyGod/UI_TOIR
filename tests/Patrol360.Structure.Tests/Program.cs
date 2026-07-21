using System.Xml.Linq;

var repoRoot = FindRepoRoot(AppContext.BaseDirectory);
var failures = new List<string>();

RequireDirectory("apps");
RequireDirectory("apps/api");
RequireDirectory("apps/web");
RequireDirectory("apps/web/src/app");
RequireDirectory("apps/web/src/features");
RequireDirectory("apps/web/src/features/dashboard");
RequireDirectory("apps/web/src/features/emu");
RequireDirectory("apps/web/src/features/inventory");
RequireDirectory("apps/web/src/features/mobileAccounts");
RequireDirectory("apps/web/src/features/patrol");
RequireDirectory("apps/web/src/features/perco");
RequireDirectory("apps/web/src/features/users");
RequireDirectory("apps/web/src/shared");
RequireDirectory("apps/web/src/shared/api");
RequireDirectory("apps/web/src/shared/styles");
RequireDirectory("apps/web/src/shared/ui");
RequireDirectory("apps/worker");
RequireDirectory("libs/domain");
RequireDirectory("libs/application");
RequireDirectory("libs/contracts");
RequireDirectory("libs/infrastructure");
RequireDirectory("libs/infrastructure/Persistence/Configurations");
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
RequireFile(".github/pull_request_template.md");
RequireFile("docs/adr/0001-monorepo-modular-monolith.md");
RequireFile("docs/adr/0002-layer-dependency-rules.md");
RequireFile("docs/adr/0003-frontend-data-source-boundaries.md");
RequireFile("docs/refactor-structure-plan.md");
RequireFile("docs/complexity-hotspots-refactor-plan.md");
RequireFile("docs/structure-remaining-work.md");
RequireFile("docs/runbooks/ci-contract.md");
RequireFile("docs/runbooks/branch-review-policy.md");
RequireFile("docs/runbooks/local-dev.md");
RequireFile("docs/runbooks/database-migrations.md");
RequireFile("docs/runbooks/release-checklist.md");
RequireFile("docs/runbooks/test-artifacts.md");
RequireFile("infra/README.md");
RequireFile("infra/env/.env.example");
RequireFile("legacy/README.md");
RequireFile("legacy/territory-patrol-panel/README.md");
RequireFile("tools/Verify-TextEncoding.ps1");
RequireFile("apps/api/Authorization/SiteBearerAuthenticationHandler.cs");
RequireFile("tools/Clean-Workspace.ps1");
RequireFile("tools/Test-All.ps1");
RequireFile("tools/Check-Structure.ps1");
RequireFile("tools/Set-GitHubBranchProtection.ps1");
RequireFile("tests/web/unit/run-unit-tests.mjs");
RequireFile("tests/web/e2e/README.md");
RequireFile("apps/web/src/shared/ui/index.ts");
RequireFile("apps/web/src/features/README.md");
RequireFile("libs/infrastructure/Persistence/Configurations/README.md");
RequireFile("libs/README.md");
RequireFile("apps/web/src/features/inventory/styles/inventory-ppe-industrial-calm.css");
RequireFile("apps/web/src/features/inventory/ppe/EmployeeStep.tsx");
RequireFile("apps/web/src/features/inventory/ppe/CardParamsStep.tsx");
RequireFile("apps/web/src/features/inventory/ppe/IssueChecklistStep.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PrintPreviewStep.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpeIssueLineEditor.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePrintValidationPanel.tsx");
RequireFile("apps/web/src/features/inventory/ppe/WizardLinesTable.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpeManualNormForm.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePickerCatalogGrid.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePickerSelectedItems.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePickerReferenceList.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePickerSummary.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePickerTabs.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpePositionNormList.tsx");
RequireFile("apps/web/src/features/inventory/ppe/PpeDrawerTables.tsx");

AssertFileLineCountAtMost("apps/web/src/styles.css", 28029);
AssertFileLineCountAtMost("libs/infrastructure/Persistence/Patrol360DbContext.cs", 2274);
AssertFileLineCountAtMost("apps/web/src/hooks/useEmuWorkspace.ts", 2031);
AssertFileLineCountAtMost("apps/web/src/repositories/mockInventoryRepository.ts", 2114);
AssertFileLineCountAtMost("apps/web/src/features/perco/PercoIntegrationScreen.tsx", 2040);
AssertFileLineCountAtMost("apps/web/src/features/patrol/AssignmentScreen.tsx", 2016);
RequireFile("apps/web/src/features/inventory/ppe/ppeFormatters.ts");
RequireFile("apps/web/src/features/inventory/ppe/ppePrintMapping.ts");
RequireFile("apps/web/src/features/inventory/ppe/ppeWizardDomain.ts");
RequireFile("apps/web/src/features/patrol/assignments/AssignmentIcons.tsx");
RequireFile("apps/web/src/features/patrol/assignments/assignmentDateUtils.ts");
RequireFile("apps/web/src/features/patrol/assignments/assignmentStorage.ts");
RequireFile("libs/infrastructure/Persistence/Inventory/EfInventoryExportService.Print.cs");
RequireFile("libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Issue.cs");
RequireFile("libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.ReturnWriteOff.cs");
RequireFile("libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.History.cs");
RequireFile("libs/infrastructure/Persistence/Inventory/EfInventoryWorkflowService.Validation.cs");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./EmployeeStep\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./CardParamsStep\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./IssueChecklistStep\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./PrintPreviewStep\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./WizardLinesTable\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "from \"./ppeWizardDomain\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeWizard.tsx", "export { PpeItemPickerModal } from \"./PpeItemPickerModal\"");
AssertFileContains("apps/web/src/features/inventory/ppe/WizardLinesTable.tsx", "from \"./PpeIssueLineEditor\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./ppeWizardDomain\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerContent\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerDatalists\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerFilters\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerFooterActions\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerSelectedPanel\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerSummary\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpeItemPickerModal.tsx", "from \"./PpePickerTabs\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpePickerSelectedPanel.tsx", "from \"./PpePickerSelectedItems\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpePickerContent.tsx", "from \"./PpePickerReferenceList\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpePickerContent.tsx", "from \"./PpeManualNormForm\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpePickerContent.tsx", "from \"./PpePickerCatalogGrid\"");
AssertFileContains("apps/web/src/features/inventory/ppe/PpePickerContent.tsx", "from \"./PpePositionNormList\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeDrawer.tsx", "from \"./PpeDrawerTables\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeCommon.tsx", "from \"./ppeFormatters\"");
AssertFileContains("apps/web/src/features/inventory/ppe/ppeCommon.tsx", "from \"./ppePrintMapping\"");
AssertFileContains("apps/web/src/features/patrol/AssignmentScreen.tsx", "from \"./assignments/AssignmentIcons\"");
AssertFileContains("apps/web/src/features/patrol/AssignmentScreen.tsx", "from \"./assignments/assignmentDateUtils\"");
AssertFileContains("apps/web/src/features/patrol/AssignmentScreen.tsx", "from \"./assignments/assignmentStorage\"");
AssertFileContains("libs/infrastructure/Persistence/EfInventoryExportService.cs", "internal sealed partial class EfInventoryExportService");
AssertFileContains("libs/infrastructure/Persistence/EfInventoryWorkflowService.cs", "internal sealed partial class EfInventoryWorkflowService");

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
AssertGitIgnoreContains(".tmp/");
AssertGitIgnoreContains("apk-check/");
AssertGitIgnoreContains("artifacts/");
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
AssertFileContains(".github/workflows/ci.yml", "dotnet format");
AssertFileContains(".github/workflows/ci.yml", "actions/upload-artifact@v4");
AssertFileContains(".github/workflows/ci.yml", "TestResults/**");
AssertFileContains(".github/workflows/ci.yml", "npm run test:ci");
AssertFileContains(".github/workflows/ci.yml", "postgres:17-alpine");
AssertFileContains(".github/workflows/ci.yml", "PATROL360_RUN_DB_INTEGRATION");
AssertFileContains(".github/workflows/ci.yml", "notExecuted");
AssertFileContains(".github/pull_request_template.md", ".\\tools\\Test-All.ps1");
AssertFileContains("apps/api/Program.cs", "AddAuthentication");
AssertFileContains("apps/api/Program.cs", "FallbackPolicy");
AssertFileContains("apps/api/Program.cs", "UseAuthentication");
AssertFileContains("apps/api/Program.cs", "--migrate");
AssertFileContains("libs/infrastructure/Persistence/Patrol360DatabaseInitializer.cs", "pg_advisory_lock");
AssertFileContains("infra/docker/compose.yaml", "service_completed_successfully");
AssertFileContains("apps/api/Authorization/SiteBearerAuthenticationHandler.cs", "GetCurrentUser");
AssertFileContains("Directory.Build.props", "<TreatWarningsAsErrors>true</TreatWarningsAsErrors>");
AssertFileContains("Directory.Build.props", "NU1901;NU1902;NU1903;NU1904");
AssertFileContains(".github/workflows/ci.yml", "NuGet vulnerability audit did not complete");
AssertFileContains(".github/pull_request_template.md", "Generated artifacts are not committed");
AssertFileContains("docs/runbooks/ci-contract.md", "CI / verify");
AssertFileContains("docs/runbooks/ci-contract.md", "actions/upload-artifact");
AssertFileContains("docs/structure-remaining-work.md", "DB-backed integration tests");
AssertFileContains("docs/structure-remaining-work.md", "Set-GitHubBranchProtection.ps1");
AssertFileContains("docs/structure-remaining-work.md", "CODEOWNERS");
AssertFileContains("docs/refactor-structure-plan.md", "modular monolith");
AssertFileContains("docs/refactor-structure-plan.md", "Do not mix mechanical moves with behavioral fixes.");
AssertFileContains("docs/refactor-structure-plan.md", "src/features/emu");
AssertFileContains("docs/runbooks/branch-review-policy.md", "require status checks `CI / verify` и `CI / PostgreSQL integration`");
AssertFileContains("docs/runbooks/branch-review-policy.md", "squash merge");
AssertFileContains("docs/runbooks/branch-review-policy.md", "Set-GitHubBranchProtection.ps1");
AssertFileContains("tools/Set-GitHubBranchProtection.ps1", "required_status_checks");
AssertFileContains("tools/Set-GitHubBranchProtection.ps1", "CI / verify");
AssertFileContains("tools/Set-GitHubBranchProtection.ps1", "CI / PostgreSQL integration");
AssertFileContains("tools/Set-GitHubBranchProtection.ps1", "gh api");
AssertFileContains("tools/Test-All.ps1", "--logger");
AssertFileContains("tools/Test-All.ps1", "dotnet format");
AssertFileContains("tools/Test-All.ps1", "npm run test:ci");
AssertFileContains("tools/Test-All.ps1", "TestResults");
AssertFileContains("apps/web/package.json", "\"test:unit\"");
AssertFileContains("apps/web/package.json", "\"test:unit:ci\"");
AssertFileContains("apps/web/package.json", "\"test:structural\"");
AssertFileContains("apps/web/package.json", "\"test:ci\"");
AssertFileContains("apps/web/package.json", "\"test:run\"");
AssertFileContains("apps/web/package.json", "\"test:e2e\"");
RequireFile("apps/web/playwright.config.ts");
AssertFileContains("apps/web/playwright.config.ts", "playwright-junit.xml");
AssertFileContains("apps/web/playwright.config.ts", "playwright-report");
RequireFile("apps/web/e2e/dashboard.spec.ts");
RequireFile("apps/web/src/test/setup.ts");
RequireFile("apps/web/src/__tests__/ui.test.tsx");
RequireFile("apps/web/src/__tests__/domain.test.ts");
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
AssertNoMojibakeMarkers([
    "apps/api",
    "apps/worker",
    "apps/web/src",
    "docs",
    "libs"
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

void AssertNoMojibakeMarkers(string[] relativeRoots)
{
    var extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        ".cs",
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".css",
        ".html",
        ".json",
        ".md"
    };

    foreach (var relativeRoot in relativeRoots)
    {
        var rootPath = Path.Combine(repoRoot, NormalizePath(relativeRoot));
        if (!Directory.Exists(rootPath))
        {
            failures.Add($"Cannot inspect missing directory for mojibake: {relativeRoot}");
            continue;
        }

        foreach (var filePath in Directory.EnumerateFiles(rootPath, "*.*", SearchOption.AllDirectories))
        {
            if (!extensions.Contains(Path.GetExtension(filePath)) || IsGeneratedOrVendorPath(filePath))
            {
                continue;
            }

            var lines = File.ReadAllLines(filePath);
            for (var index = 0; index < lines.Length; index++)
            {
                if (!ContainsLikelyMojibake(lines[index]))
                {
                    continue;
                }

                var displayPath = Path.GetRelativePath(repoRoot, filePath).Replace('\\', '/');
                failures.Add($"{displayPath}:{index + 1} contains likely mojibake text. Decode it or move it to an explicit test fixture.");
            }
        }
    }
}

bool IsGeneratedOrVendorPath(string filePath)
{
    var relativePath = Path.GetRelativePath(repoRoot, filePath).Replace('\\', '/');
    return relativePath.Contains("/bin/", StringComparison.OrdinalIgnoreCase) ||
           relativePath.Contains("/obj/", StringComparison.OrdinalIgnoreCase) ||
           relativePath.Contains("/node_modules/", StringComparison.OrdinalIgnoreCase) ||
           relativePath.Contains("/dist/", StringComparison.OrdinalIgnoreCase) ||
           relativePath.Contains("/coverage/", StringComparison.OrdinalIgnoreCase);
}

bool ContainsLikelyMojibake(string line)
{
    if (line.Contains("mojibake", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    for (var index = 0; index < line.Length - 1; index++)
    {
        var current = line[index];
        if ((current == 'Р' || current == 'С') && IsMojibakeTrail(line[index + 1]))
        {
            return true;
        }
    }

    return false;
}

bool IsMojibakeTrail(char character)
{
    return character is >= '\u0080' and <= '\u00BF' ||
           character is >= '\u0402' and <= '\u040F' ||
           character is >= '\u0452' and <= '\u045F' ||
           character is '\u2013' or '\u2014' or '\u2018' or '\u2019' or '\u201A' or '\u201C' or '\u201D' ||
           character is '\u2020' or '\u2021' or '\u2026' or '\u20AC' or '\u2116';
}

void AssertGitIgnoreContains(string pattern)
{
    AssertFileContains(".gitignore", pattern);
}

void AssertFileLineCountAtMost(string relativePath, int maximumLines)
{
    var fullPath = Path.Combine(repoRoot, NormalizePath(relativePath));
    if (!File.Exists(fullPath))
    {
        failures.Add($"Cannot enforce line budget for missing file: {relativePath}");
        return;
    }

    var actualLines = File.ReadLines(fullPath).Count();
    if (actualLines > maximumLines)
    {
        failures.Add($"{relativePath} has {actualLines:N0} lines; budget is {maximumLines:N0}. Split the hotspot before adding code.");
    }
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
