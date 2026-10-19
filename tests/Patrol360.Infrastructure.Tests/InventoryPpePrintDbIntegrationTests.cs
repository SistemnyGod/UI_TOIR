using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;
using Patrol360.Infrastructure.Persistence.Entities;

namespace Patrol360.Infrastructure.Tests;

[Collection("Postgres integration")]
public sealed class InventoryPpePrintDbIntegrationTests
{
    [DbIntegrationFact]
    public async Task PpeMigrationPreservesPopulatedLegacyCardsAndDoesNotInventIssueDocuments()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var item = CreatePpeItem(provider, "Старая каска", "Тест");
        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(employee.Id, "Старая карточка")));
        Assert.True(card.Succeeded);
        var line = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider, card.Value!.Id,
            new UpsertInventoryPpeCardLineDto(item.Id, null, 1, 1_000, "issued", null, "Сохранить факт",
                NormPoint: "", PrintItemName: "Старая каска", IssuePeriodText: "12 месяцев", IssuedAt: DateTimeOffset.UtcNow)));
        Assert.True(line.Succeeded);
        using var scope = provider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var migrator = context.GetService<IMigrator>();
        // Only the helper-created disposable database is rolled back to the pre-feature schema.
        await migrator.MigrateAsync("20260831120000_PerformanceSearchIndexes");
        await context.Database.MigrateAsync();
        await context.Database.MigrateAsync();
        var retained = await context.InventoryPpeCardLines.AsNoTracking().SingleAsync(row => row.Id == line.Value!.Id);
        Assert.Equal(item.Id, retained.ItemId);
        Assert.Equal(1, retained.Quantity);
        Assert.Equal("issued", retained.Status);
        Assert.Equal("", retained.NormPoint);
        Assert.Null(retained.IssueDocumentId);
        Assert.Empty(await context.Set<Patrol360.Infrastructure.Persistence.Entities.PpeIssueDocumentEntity>().ToListAsync());
        var legacyNorms = await context.InventoryPpeNormSets.AsNoTracking().ToListAsync();
        Assert.All(legacyNorms, norm => Assert.False(norm.ScopeConfirmed));
    }

    [DbIntegrationFact]
    public async Task CatalogIdentityLookupIgnoresSearchPageAndDoesNotReturnAnUnrelatedItem()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        for (var index = 0; index < 35; index++) CreatePpeItem(provider, $"А Каска {index:D2}", "Тест");
        var target = CreatePpeItem(provider, "Я Каска выбранная", "Тест");
        var found = UseQuery(provider, query => query.GetItems(new InventoryListQuery(PageSize: 1, ItemId: target.Id)));
        Assert.Equal(target.Id, Assert.Single(found.Rows).Id);
        Assert.Equal(1, found.Total);
        Assert.Empty(UseQuery(provider, query => query.GetItems(new InventoryListQuery(ItemId: Guid.NewGuid()))).Rows);
    }

    [DbIntegrationFact]
    public async Task PpePrintCanonKeepsNormCatalogModelAndSectionRowsSeparated()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var helmetNorm = "Каска защитная от механических воздействий";
        var suitNorm = "Костюм для защиты от пониженных температур";
        var jacketNorm = "Куртка для защиты от пониженных температур";
        var raincoatNorm = "Плащ для защиты от воды 3 класса защиты";
        var winterSection = "При выполнении наружных работ зимой, дополнительно:";

        var helmetItem = CreatePpeItem(provider, helmetNorm, "СОМЗ", catalogName: "Каска защ. синяя СОМЗ");
        var suitItem = CreatePpeItem(provider, suitNorm, "Форвард", catalogName: "Костюм утепленный Форвард");
        var jacketItem = CreatePpeItem(provider, jacketNorm, "Эксперт К3", catalogName: "Куртка Эксперт К3 / SIM-06/K", article: "SIM-06/K");
        var raincoatItem = CreatePpeItem(provider, raincoatNorm, "Prosafe", catalogName: "Плащ влагозащитный Prosafe");
        var sectionItem = CreatePpeItem(provider, winterSection, "", catalogName: winterSection);

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(
            employee.Id,
            "PPE print canon test",
            CompleteEmployeeDetails())));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);
        var cardId = card.Value!.Id;

        var section = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                sectionItem.Id,
                null,
                1,
                null,
                "not_issued",
                null,
                "Section title",
                PrintItemName: winterSection,
                NormPoint: "",
                IssuePeriodText: "")));
        Assert.True(section.Succeeded);

        var rejectedIssuedSection = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
            cardId,
            new UpsertInventoryPpeCardLineDto(
                sectionItem.Id,
                null,
                1,
                null,
                "issued",
                null,
                "Section title must not be issued",
                PrintItemName: winterSection,
                NormPoint: "",
                IssuePeriodText: "",
                IssuedAt: DateTimeOffset.UtcNow)));
        Assert.False(rejectedIssuedSection.Succeeded);
        Assert.True(rejectedIssuedSection.Errors.ContainsKey("status"));

        var helmet = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                helmetItem.Id,
                null,
                1,
                12_300,
                "issued",
                DateTimeOffset.UtcNow.AddYears(2),
                "Helmet issued",
                PrintItemName: helmetNorm,
                NormPoint: "п. 1.3.1 Приложения № 2",
                IssuePeriodText: "шт., 2 года",
                BrandModelArticle: "СОМЗ",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-3))));
        Assert.True(helmet.Succeeded);

        var suit = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                suitItem.Id,
                null,
                1,
                45_000,
                "replacement",
                DateTimeOffset.UtcNow.AddYears(2),
                "Suit replacement",
                PrintItemName: suitNorm,
                NormPoint: "п. 4.7 Приложения № 2",
                IssuePeriodText: "шт., 2 года",
                BrandModelArticle: "Форвард",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-2))));
        Assert.True(suit.Succeeded);

        var jacket = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                jacketItem.Id,
                null,
                1,
                39_000,
                "issued",
                DateTimeOffset.UtcNow.AddYears(3),
                "Jacket issued",
                PrintItemName: jacketNorm,
                NormPoint: "п. 4.7.1 Приложения № 2",
                IssuePeriodText: "шт., 3 года",
                BrandModelArticle: "Эксперт К3, SIM-06/K",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-1))));
        Assert.True(jacket.Succeeded);

        var notIssued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                raincoatItem.Id,
                null,
                1,
                20_000,
                "not_issued",
                DateTimeOffset.UtcNow.AddYears(1),
                "Raincoat not issued",
                PrintItemName: raincoatNorm,
                NormPoint: "п. 4.9 Приложения № 2",
                IssuePeriodText: "шт., 1 год",
                BrandModelArticle: "Prosafe")));
        Assert.True(notIssued.Succeeded);

        var personalCard = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "card"));
        var signatureSheet = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "sheet"));

        Assert.True(personalCard.Succeeded);
        Assert.True(signatureSheet.Succeeded);
        Assert.NotNull(personalCard.Value);
        Assert.NotNull(signatureSheet.Value);

        var cardXml = ReadDocxDocumentXml(personalCard.Value!.Content);
        var sheetXml = ReadDocxDocumentXml(signatureSheet.Value!.Content);
        var cardDocument = XDocument.Parse(cardXml);
        var sheetDocument = XDocument.Parse(sheetXml);

        Assert.Equal(6, CountTableRows(cardDocument, tableIndex: 1));
        Assert.Equal(6, CountTableRows(sheetDocument, tableIndex: 0));

        Assert.Contains(winterSection, cardXml, StringComparison.Ordinal);
        Assert.Contains(helmetNorm, cardXml, StringComparison.Ordinal);
        Assert.Contains(suitNorm, cardXml, StringComparison.Ordinal);
        Assert.Contains(jacketNorm, cardXml, StringComparison.Ordinal);
        Assert.Contains(raincoatNorm, cardXml, StringComparison.Ordinal);
        Assert.Contains("п. 1.3.1 Приложения № 2", cardXml, StringComparison.Ordinal);
        Assert.Contains("шт., 2 года", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Каска защ. синяя СОМЗ", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Костюм утепленный Форвард", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Куртка Эксперт К3 / SIM-06/K", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("СОМЗ", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Форвард", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Эксперт К3, SIM-06/K", cardXml, StringComparison.Ordinal);

        Assert.Contains("Каска защ. синяя СОМЗ", sheetXml, StringComparison.Ordinal);
        Assert.Contains("СОМЗ", sheetXml, StringComparison.Ordinal);
        Assert.Contains("1 шт.", sheetXml, StringComparison.Ordinal);
        Assert.Contains("Костюм утепленный Форвард", sheetXml, StringComparison.Ordinal);
        Assert.Contains("Форвард", sheetXml, StringComparison.Ordinal);
        Assert.Contains("Куртка Эксперт К3 / SIM-06/K", sheetXml, StringComparison.Ordinal);
        Assert.Contains("Эксперт К3, SIM-06/K", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(winterSection, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(raincoatNorm, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Плащ влагозащитный Prosafe", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(helmetNorm, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(suitNorm, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(jacketNorm, sheetXml, StringComparison.Ordinal);
    }

    [DbIntegrationFact]
    public async Task PpePrintQuantityTextAndExplicitSectionFlagsRoundTripThroughDatabase()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var issuedNorm = "Harness with custom quantity text";
        var sectionTitle = "Outdoor work additionally:";
        var issuedItem = CreatePpeItem(provider, issuedNorm, brand: "SafeBrand", catalogName: "Warehouse harness SafeBrand");
        var sectionItem = CreatePpeItem(provider, sectionTitle, brand: "", catalogName: sectionTitle);

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(
            employee.Id,
            "PPE quantity text DB round-trip",
            CompleteEmployeeDetails())));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);
        var cardId = card.Value!.Id;

        var issued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                issuedItem.Id,
                null,
                1,
                12_300,
                "issued",
                DateTimeOffset.UtcNow.AddYears(2),
                "Issued with custom quantity text",
                PrintItemName: issuedNorm,
                NormPoint: "p. 1.3.1 Appendix 2",
                IssuePeriodText: "pcs., 2 years",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-1),
                BrandModelArticle: "SafeBrand H1",
                QuantityText: "1 custom pcs.",
                IsSectionTitle: false)));
        Assert.True(issued.Succeeded);
        Assert.NotNull(issued.Value);
        Assert.Equal("1 custom pcs.", issued.Value!.QuantityText);
        Assert.False(issued.Value.IsSectionTitle);

        var updated = UseWorkflow(provider, workflow => workflow.UpdatePpeCardLine(
            cardId,
            issued.Value.Id,
            new UpsertInventoryPpeCardLineDto(
                issuedItem.Id,
                null,
                1,
                12_300,
                "issued",
                DateTimeOffset.UtcNow.AddYears(3),
                "Updated custom quantity text",
                PrintItemName: issuedNorm,
                NormPoint: "p. 1.3.1 Appendix 2 updated",
                IssuePeriodText: "pcs., 3 years",
                BrandModelArticle: "SafeBrand H1 updated",
                QuantityText: "1 custom pcs. updated",
                IsSectionTitle: false)));
        Assert.True(updated.Succeeded);
        Assert.NotNull(updated.Value);

        var section = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                sectionItem.Id,
                null,
                1,
                null,
                "not_issued",
                null,
                "Explicit section row",
                PrintItemName: sectionTitle,
                NormPoint: "",
                IssuePeriodText: "",
                QuantityText: "",
                IsSectionTitle: true)));
        Assert.True(section.Succeeded);
        Assert.NotNull(section.Value);
        Assert.True(section.Value!.IsSectionTitle);
        Assert.Equal(string.Empty, section.Value.NormPoint);
        Assert.Equal(string.Empty, section.Value.IssuePeriodText);
        Assert.Equal(string.Empty, section.Value.QuantityText);

        var detail = UseWorkflow(provider, workflow => workflow.GetPpeCard(cardId));
        Assert.True(detail.Succeeded);
        Assert.NotNull(detail.Value);
        var persistedLine = detail.Value!.Lines.Single(line => line.Id == issued.Value.Id);
        var persistedSection = detail.Value.Lines.Single(line => line.Id == section.Value.Id);

        Assert.Equal("1 custom pcs. updated", persistedLine.QuantityText);
        Assert.Equal("p. 1.3.1 Appendix 2 updated", persistedLine.NormPoint);
        Assert.Equal("pcs., 3 years", persistedLine.IssuePeriodText);
        Assert.False(persistedLine.IsSectionTitle);
        Assert.True(persistedSection.IsSectionTitle);
        Assert.Equal(string.Empty, persistedSection.QuantityText);

        var personalCard = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "card"));
        var signatureSheet = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "sheet"));

        Assert.True(personalCard.Succeeded);
        Assert.True(signatureSheet.Succeeded);
        Assert.NotNull(personalCard.Value);
        Assert.NotNull(signatureSheet.Value);

        var cardXml = ReadDocxDocumentXml(personalCard.Value!.Content);
        var sheetXml = ReadDocxDocumentXml(signatureSheet.Value!.Content);

        Assert.Contains(issuedNorm, cardXml, StringComparison.Ordinal);
        Assert.Contains(sectionTitle, cardXml, StringComparison.Ordinal);
        Assert.Contains("1 custom pcs. updated", cardXml, StringComparison.Ordinal);
        Assert.Contains("p. 1.3.1 Appendix 2 updated", cardXml, StringComparison.Ordinal);
        Assert.Contains("pcs., 3 years", cardXml, StringComparison.Ordinal);
        Assert.Contains("Warehouse harness SafeBrand", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(sectionTitle, sheetXml, StringComparison.Ordinal);

        var norm = UseCommand(provider, command => command.UpsertPositionNorm(new UpsertInventoryPositionNormDto(
            "Test PPE position",
            sectionItem.Id,
            1,
            null,
            NormItemName: sectionTitle,
            NormPoint: "",
            IssuePeriodText: "",
            QuantityText: "",
            IsSectionTitle: true)));
        Assert.True(norm.Succeeded);
        Assert.NotNull(norm.Value);
        Assert.True(norm.Value!.IsSectionTitle);
        Assert.Equal(string.Empty, norm.Value.QuantityText);

        var storedNorm = UseQuery(provider, query => query.GetSettings())
            .PositionNorms
            .Single(row => row.Id == norm.Value.Id);
        Assert.True(storedNorm.IsSectionTitle);
        Assert.Equal(string.Empty, storedNorm.QuantityText);
        Assert.Equal(sectionTitle, storedNorm.NormItemName);
    }

    [DbIntegrationFact]
    public async Task PpeDocxPrintSeparatesNormNamesFromActualCatalogRows()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var issuedNormName = "Каска защитная от механических воздействий";
        var replacementNormName = "Костюм для защиты от пониженных температур";
        var returnedNormName = "Перчатки защитные нитриловые";
        var notIssuedNormName = "Плащ для защиты от атмосферных осадков";
        var issuedItem = CreatePpeItem(provider, issuedNormName, brand: "СОМЗ");
        var replacementItem = CreatePpeItem(provider, replacementNormName, brand: "Форвард");
        var returnedItem = CreatePpeItem(provider, returnedNormName, brand: "Ansell");
        var notIssuedItem = CreatePpeItem(provider, notIssuedNormName, brand: "Форвард");

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(
            employee.Id,
            "DOCX print test",
            CompleteEmployeeDetails())));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);
        var cardId = card.Value!.Id;

        var issued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                issuedItem.Id,
                null,
                2,
                12_300,
                "issued",
                DateTimeOffset.UtcNow.AddMonths(12),
                "Issued line for DOCX",
                PrintItemName: issuedNormName,
                NormPoint: "п. 1.3.1 Приложения № 2",
                IssuePeriodText: "шт., 2 года",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-2))));
        Assert.True(issued.Succeeded);

        var replacement = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                replacementItem.Id,
                null,
                1,
                45_000,
                "replacement",
                DateTimeOffset.UtcNow.AddMonths(24),
                "Replacement line for DOCX",
                PrintItemName: replacementNormName,
                NormPoint: "п. 4.7 Приложения № 2",
                IssuePeriodText: "шт., 2 года",
                BrandModelArticle: "Форвард",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-2).AddMinutes(5))));
        Assert.True(replacement.Succeeded);

        var returned = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                returnedItem.Id,
                null,
                1,
                5_000,
                "issued",
                DateTimeOffset.UtcNow.AddMonths(6),
                "Returned line for DOCX",
                PrintItemName: returnedNormName,
                NormPoint: "п. 2.1.1 Приложения № 2",
                IssuePeriodText: "пара, 6 месяцев",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-1))));
        Assert.True(returned.Succeeded);
        Assert.NotNull(returned.Value);

        var notIssued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                notIssuedItem.Id,
                null,
                1,
                20_000,
                "not_issued",
                DateTimeOffset.UtcNow.AddMonths(24),
                "Not issued line must stay out of signature sheet",
                PrintItemName: notIssuedNormName,
                NormPoint: "п. 4.7 Приложения № 2",
                IssuePeriodText: "шт., 2 года")));
        Assert.True(notIssued.Succeeded);

        var closed = UseWorkflow(provider, workflow => workflow.UpdatePpeCardLineStatus(
            cardId,
            returned.Value!.Id,
            new UpdateInventoryStatusDto("returned", "Returned line must not be printed as new issue")));
        Assert.True(closed.Succeeded);

        var personalCard = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "card"));
        var signatureSheet = UseExport(provider, export => export.BuildPpeCardDocx(cardId, "sheet"));

        Assert.True(personalCard.Succeeded);
        Assert.True(signatureSheet.Succeeded);
        Assert.NotNull(personalCard.Value);
        Assert.NotNull(signatureSheet.Value);
        Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", personalCard.Value!.ContentType);
        Assert.Equal("application/vnd.openxmlformats-officedocument.wordprocessingml.document", signatureSheet.Value!.ContentType);
        Assert.StartsWith("ppe-personal-card-", personalCard.Value.DownloadName, StringComparison.Ordinal);
        Assert.StartsWith("ppe-signature-sheet-", signatureSheet.Value.DownloadName, StringComparison.Ordinal);
        Assert.EndsWith(".docx", personalCard.Value.DownloadName, StringComparison.Ordinal);
        Assert.EndsWith(".docx", signatureSheet.Value.DownloadName, StringComparison.Ordinal);

        WritePrintFixture(
            Environment.GetEnvironmentVariable("PATROL360_PPE_PRINT_FIXTURE_DIR"),
            employee.FullName,
            employee.PersonnelNo,
            cardId,
            personalCard.Value,
            signatureSheet.Value);

        var cardXml = ReadDocxDocumentXml(personalCard.Value.Content);
        var sheetXml = ReadDocxDocumentXml(signatureSheet.Value.Content);
        var cardDocument = XDocument.Parse(cardXml);
        var sheetDocument = XDocument.Parse(sheetXml);

        Assert.Equal(2, CountTables(cardDocument));
        Assert.Equal(5, CountTableRows(cardDocument, tableIndex: 1));
        Assert.Equal(4, CountTableCells(cardDocument, tableIndex: 1, rowIndex: 0));
        Assert.Equal(1, CountTables(sheetDocument));
        Assert.Equal(6, CountTableRows(sheetDocument, tableIndex: 0));
        Assert.Equal(10, CountTableCells(sheetDocument, tableIndex: 0, rowIndex: 1));

        Assert.Contains(employee.FullName.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0], cardXml, StringComparison.Ordinal);
        Assert.Contains(issuedNormName, cardXml, StringComparison.Ordinal);
        Assert.Contains(replacementNormName, cardXml, StringComparison.Ordinal);
        Assert.Contains(returnedNormName, cardXml, StringComparison.Ordinal);
        Assert.Contains(notIssuedNormName, cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain(issuedItem.Name, cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Каски", cardXml, StringComparison.Ordinal);
        Assert.Contains("п. 1.3.1 Приложения № 2", cardXml, StringComparison.Ordinal);
        Assert.Contains("Дата изменения профессии", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Дата оформления карточки", cardXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Итого к выдаче", cardXml, StringComparison.Ordinal);

        Assert.Contains(issuedNormName, sheetXml, StringComparison.Ordinal);
        Assert.Contains("СОМЗ", sheetXml, StringComparison.Ordinal);
        Assert.Contains("2 шт.", sheetXml, StringComparison.Ordinal);
        Assert.Contains(replacementNormName, sheetXml, StringComparison.Ordinal);
        Assert.Contains("Форвард", sheetXml, StringComparison.Ordinal);
        Assert.Contains("1 шт.", sheetXml, StringComparison.Ordinal);
        Assert.Contains(issuedItem.Name, sheetXml, StringComparison.Ordinal);
        Assert.Contains(returnedNormName, sheetXml, StringComparison.Ordinal);
        Assert.Contains("Ansell", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(notIssuedNormName, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Дата оформления", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("СИЗ выдал", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Сотрудник:", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Итого к выдаче", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("returned", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("written_off", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("lost", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("archived", sheetXml, StringComparison.Ordinal);
    }

    [DbIntegrationFact]
    public async Task PpePrintRejectsCategoryInsteadOfNormName()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var item = CreatePpeItem(provider, "Каска защитная от механических воздействий", brand: "СОМЗ");
        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(
            employee.Id,
            "Category validation test",
            CompleteEmployeeDetails())));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);

        var line = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            card.Value!.Id,
            new UpsertInventoryPpeCardLineDto(
                item.Id,
                null,
                1,
                12_300,
                "issued",
                DateTimeOffset.UtcNow.AddMonths(12),
                "Category must be rejected by print validation",
                PrintItemName: "Каски",
                NormPoint: "п. 1.3.1 Приложения № 2",
                IssuePeriodText: "шт., 2 года",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-2))));
        Assert.True(line.Succeeded);

        var print = UseExport(provider, export => export.BuildPpeCardDocx(card.Value!.Id, "card"));

        Assert.False(print.Succeeded);
        Assert.True(print.Errors.ContainsKey("ppePrint"));
        Assert.Contains("категорию", string.Join(" ", print.Errors["ppePrint"]), StringComparison.OrdinalIgnoreCase);
    }

    [DbIntegrationFact]
    public async Task PpeDocxPrintAllowsEmptyEmployeeDetails()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var normName = "Respirator with optional employee detail fields";
        var item = CreatePpeItem(provider, normName, brand: "SafeBrand", model: "R1");
        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(
            employee.Id,
            "Empty employee details must not block PPE print",
            new InventoryPpeEmployeeDetailsDto())));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);

        var line = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            card.Value!.Id,
            new UpsertInventoryPpeCardLineDto(
                item.Id,
                null,
                1,
                10_000,
                "issued",
                DateTimeOffset.UtcNow.AddMonths(12),
                "Issued with empty employee details",
                PrintItemName: normName,
                NormPoint: "p. 1.1",
                IssuePeriodText: "pcs., 1 year",
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-1),
                BrandModelArticle: "SafeBrand R1")));
        Assert.True(line.Succeeded);

        var personalCard = UseExport(provider, export => export.BuildPpeCardDocx(card.Value!.Id, "card"));
        var signatureSheet = UseExport(provider, export => export.BuildPpeCardDocx(card.Value!.Id, "sheet"));

        Assert.True(personalCard.Succeeded);
        Assert.True(signatureSheet.Succeeded);
        Assert.NotNull(personalCard.Value);
        Assert.NotNull(signatureSheet.Value);

        var cardXml = ReadDocxDocumentXml(personalCard.Value!.Content);
        var sheetXml = ReadDocxDocumentXml(signatureSheet.Value!.Content);

        Assert.Contains(normName, cardXml, StringComparison.Ordinal);
        Assert.Contains(normName, sheetXml, StringComparison.Ordinal);
        Assert.Contains("SafeBrand R1", sheetXml, StringComparison.Ordinal);
    }

    [DbIntegrationFact]
    public async Task PpeIssueReturnAndWriteOffPreserveHistoryWithoutStockDocuments()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var warehouse = UseCommand(provider, command => command.CreateWarehouse(new CreateInventoryWarehouseDto("PPE lifecycle test warehouse", true)));
        Assert.True(warehouse.Succeeded);
        Assert.NotNull(warehouse.Value);
        var item = CreatePpeItem(provider, "Каска защитная от механических воздействий", brand: "СОМЗ");

        SeedHistoricalStock(provider, item.Id, warehouse.Value!.Id, 3);

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(employee.Id, "PPE movement lifecycle test")));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);
        var cardId = card.Value!.Id;

        var issued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                item.Id,
                warehouse.Value!.Id,
                1,
                10_000,
                "issued",
                DateTimeOffset.UtcNow.AddYears(1),
                "Issued for movement test",
                PrintItemName: "Каска защитная от механических воздействий",
                NormPoint: "п. 1.3.1 Приложения № 2",
                IssuePeriodText: "шт., 1 год",
                BrandModelArticle: "СОМЗ",
                IssuedAt: DateTimeOffset.UtcNow)));
        Assert.True(issued.Succeeded);
        Assert.NotNull(issued.Value);

        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Value!.Id).StockAvailable);
        var issuedMovement = UseWorkflow(provider, workflow => workflow.GetPpeMovements(
            new InventoryListQuery(PageSize: 10),
            employee.Id,
            item.Id)).Rows.Single(row => row.LineId == issued.Value!.Id);
        Assert.Equal("issued", issuedMovement.Status);
        Assert.NotNull(issuedMovement.IssuedAt);

        var returned = UseWorkflow(provider, workflow => workflow.UpdatePpeCardLineStatus(
            cardId,
            issued.Value!.Id,
            new UpdateInventoryStatusDto("returned", "Returned from employee")));
        Assert.True(returned.Succeeded);
        Assert.Equal(issued.Value!.Quantity, returned.Value!.ReturnedQuantity);
        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Value!.Id).StockAvailable);

        var returnedMovement = UseWorkflow(provider, workflow => workflow.GetPpeMovements(
            new InventoryListQuery(PageSize: 10),
            employee.Id,
            item.Id)).Rows.Single(row => row.LineId == issued.Value!.Id);
        Assert.Equal("returned", returnedMovement.Status);
        Assert.NotNull(returnedMovement.ReturnedAt);
        Assert.Empty(UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(PageSize: 10, Status: "ppe_return"))).Rows);
        Assert.Null(issued.Value.WarehouseId);

        var writeOffLine = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            cardId,
            new UpsertInventoryPpeCardLineDto(
                item.Id,
                warehouse.Value!.Id,
                1,
                10_000,
                "issued",
                DateTimeOffset.UtcNow.AddYears(1),
                "Write-off movement test",
                PrintItemName: "Каска защитная от механических воздействий",
                NormPoint: "п. 1.3.1 Приложения № 2",
                IssuePeriodText: "шт., 1 год",
                BrandModelArticle: "СОМЗ",
                IssuedAt: DateTimeOffset.UtcNow)));
        Assert.True(writeOffLine.Succeeded);
        Assert.NotNull(writeOffLine.Value);
        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Value!.Id).StockAvailable);

        var writtenOff = UseWorkflow(provider, workflow => workflow.UpdatePpeCardLineStatus(
            cardId,
            writeOffLine.Value!.Id,
            new UpdateInventoryStatusDto("written_off", "Written off after use")));
        Assert.True(writtenOff.Succeeded);
        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Value!.Id).StockAvailable);

        var writtenOffMovement = UseWorkflow(provider, workflow => workflow.GetPpeMovements(
            new InventoryListQuery(PageSize: 10),
            employee.Id,
            item.Id)).Rows.Single(row => row.LineId == writeOffLine.Value!.Id);
        Assert.Equal("written_off", writtenOffMovement.Status);
        Assert.NotNull(writtenOffMovement.WrittenOffAt);
        Assert.Empty(UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(PageSize: 10, Status: "ppe_write_off"))).Rows);
    }

    [DbIntegrationFact]
    public async Task PartialPpeReturnsAccumulateWithoutStockDocuments()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var warehouse = UseCommand(provider, command => command.CreateWarehouse(new CreateInventoryWarehouseDto("PPE partial return warehouse", true)));
        Assert.True(warehouse.Succeeded);
        Assert.NotNull(warehouse.Value);
        var item = CreatePpeItem(provider, "Каска для частичного возврата", brand: "СОМЗ");

        SeedHistoricalStock(provider, item.Id, warehouse.Value!.Id, 4);

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(employee.Id, "PPE partial return test")));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);

        var issued = UseWorkflow(provider, workflow => SeedHistoricalPpeLine(provider,
            card.Value!.Id,
            new UpsertInventoryPpeCardLineDto(
                item.Id,
                warehouse.Value!.Id,
                2,
                10_000,
                "issued",
                DateTimeOffset.UtcNow.AddYears(1),
                "Partial return line",
                PrintItemName: "Каска для частичного возврата",
                NormPoint: "п. 1",
                IssuePeriodText: "шт., 1 год",
                BrandModelArticle: "СОМЗ",
                IssuedAt: DateTimeOffset.UtcNow)));
        Assert.True(issued.Succeeded);
        Assert.NotNull(issued.Value);

        var defective = UseWorkflow(provider, workflow => workflow.ApplyPpeLineAction(card.Value!.Id, issued.Value!.Id,
            new ApplyInventoryPpeLineActionDto("defective", DateTimeOffset.UtcNow, Comment: "Обнаружен дефект")));
        Assert.True(defective.Succeeded);
        Assert.Equal("defective", defective.Value!.Status);
        Assert.Null(defective.Value.WriteOffActDate);
        Assert.False(UseWorkflow(provider, workflow => workflow.ArchivePpeCardLine(card.Value!.Id, issued.Value!.Id)).Succeeded);

        var returned = UseWorkflow(provider, workflow => workflow.ApplyPpeLineAction(
            card.Value!.Id,
            issued.Value!.Id,
            new ApplyInventoryPpeLineActionDto(
                "returned",
                DateTimeOffset.UtcNow,
                Quantity: 0.5m,
                Comment: "Partial return")));
        Assert.True(returned.Succeeded);
        Assert.NotNull(returned.Value);
        Assert.Equal(0.5m, returned.Value!.ReturnedQuantity);

        Assert.Equal("issued", returned.Value.Status);
        Assert.Empty(UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(PageSize: 10, Status: "ppe_return"))).Rows);
        var completed = UseWorkflow(provider, workflow => workflow.ApplyPpeLineAction(card.Value.Id, issued.Value.Id,
            new ApplyInventoryPpeLineActionDto("returned", DateTimeOffset.UtcNow, Quantity: 1.5m)));
        Assert.True(completed.Succeeded);
        Assert.Equal(2m, completed.Value!.ReturnedQuantity);
        Assert.Equal("returned", completed.Value.Status);
        var duplicate = UseWorkflow(provider, workflow => workflow.ApplyPpeLineAction(card.Value.Id, issued.Value.Id,
            new ApplyInventoryPpeLineActionDto("returned", DateTimeOffset.UtcNow, Quantity: 0.5m)));
        Assert.False(duplicate.Succeeded);
        Assert.Equal(4m, GetStock(provider, item.Id, warehouse.Value.Id).StockAvailable);
    }
    [DbIntegrationFact]
    public Task InventoryIssueOperationCanBeRecordedWithoutUserWarehouse() => RecordIssueWithoutStock(null);

    [DbIntegrationFact]
    public Task ObsoleteWarehouseIdCannotEnableStockAccounting() => RecordIssueWithoutStock("0169c100-726b-490e-84b2-433a3b5cc074");

    private static async Task RecordIssueWithoutStock(string? obsoleteWarehouseId)
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var item = CreatePpeItem(provider, "Инструмент для выдачи без склада", brand: "");

        var created = UseCommand(provider, command => command.CreateOperation(new CreateInventoryOperationDto(
            "issue",
            item.Id,
            WarehouseId: obsoleteWarehouseId is null ? null : Guid.Parse(obsoleteWarehouseId),
            Quantity: 2,
            EmployeeId: employee.Id,
            MovedAt: DateTimeOffset.UtcNow,
            Comment: "Issue without user-facing warehouse")));

        Assert.True(created.Succeeded);
        Assert.NotNull(created.Value);
        Assert.Equal("issue", created.Value!.Type);
        Assert.Equal(-2, created.Value.Quantity);
        Assert.Equal(string.Empty, created.Value.WarehouseName);

        var documents = UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(
            PageSize: 10,
            Status: "issue")));
        var document = documents.Rows.Single(row => row.Id == created.Value.Id);

        Assert.Equal(employee.FullName, document.EmployeeName);
        Assert.Equal(item.Name, document.ItemName);
        Assert.Equal(-2, document.Quantity);
        Assert.Equal(string.Empty, document.WarehouseName);
    }

    [DbIntegrationFact]
    public async Task InitialStockCommandCannotChangeHistoricalBalances()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);
        await provider.InitializePatrolDatabaseAsync();
        var item = CreatePpeItem(provider, "Проверка отключённого складского API", brand: "");
        var warehouse = UseCommand(provider, command => command.CreateWarehouse(new CreateInventoryWarehouseDto("Исторический склад", true))).Value!;
        SeedHistoricalStock(provider, item.Id, warehouse.Id, 3);
        var result = UseCommand(provider, command => command.SetInitialStock(new InventoryInitialStockDto(item.Id, warehouse.Id, 100)));
        Assert.False(result.Succeeded);
        Assert.Contains("stockAccounting", result.Errors.Keys);
        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Id).StockPhysical);
        using var scope = provider.CreateScope();
        Assert.Single(scope.ServiceProvider.GetRequiredService<Patrol360DbContext>().InventoryStockMoves.Where(move => move.ItemId == item.Id));
    }

    private static void SeedHistoricalStock(ServiceProvider provider, Guid itemId, Guid warehouseId, decimal quantity)
    {
        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        db.InventoryStockMoves.Add(new InventoryStockMoveEntity
        {
            Id = Guid.NewGuid(),
            ItemId = itemId,
            WarehouseId = warehouseId,
            QuantityDelta = quantity,
            MovedAt = DateTimeOffset.UtcNow,
            MoveType = "initial_balance",
            ReferenceType = "historical_test_fixture"
        });
        db.SaveChanges();
    }

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
                ["Patrol360:BootstrapAdminPassword"] = "Patrol360!",
                ["Patrol360:SeedDemoData"] = "true",
            })
            .Build();

        services.AddPatrolInfrastructure(configuration);
        services.AddSingleton<IConfiguration>(configuration);

        return services.BuildServiceProvider();
    }

    private static T UseWorkflow<T>(ServiceProvider provider, Func<IInventoryWorkflowService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryWorkflowService>());
    }

    // Print/return tests exercise pre-existing legacy data, not permission to issue
    // new PPE without reviewed norms. Seed the historical state directly in the test DB.
    private static InventoryCommandResult<InventoryPpeCardLineDto> SeedHistoricalPpeLine(
        ServiceProvider provider, Guid cardId, UpsertInventoryPpeCardLineDto request)
    {
        var historical = request.Status is "issued" or "partial" or "replacement" or "reissued" or "returned" or "written_off" or "defective";
        var created = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(cardId,
            historical ? request with { Status = "not_issued", IssuedAt = null } : request));
        if (!created.Succeeded || !historical) return created;
        using var scope = provider.CreateScope();
        var context = scope.ServiceProvider.GetRequiredService<Patrol360DbContext>();
        var line = context.InventoryPpeCardLines.Single(x => x.Id == created.Value!.Id);
        line.Status = request.Status!;
        line.IssuedAt = request.IssuedAt ?? DateTimeOffset.UtcNow;
        context.Set<Patrol360.Infrastructure.Persistence.Entities.InventoryPpeCardLineEventEntity>().Add(new()
        {
            Id = Guid.NewGuid(),
            LineId = line.Id,
            EventType = "issued",
            FromStatus = "not_issued",
            ToStatus = line.Status,
            Comment = "Historical test fixture",
            CreatedAt = line.IssuedAt.Value
        });
        context.SaveChanges();
        var card = scope.ServiceProvider.GetRequiredService<IInventoryWorkflowService>().GetPpeCard(cardId);
        return new(card.Value!.Lines.Single(x => x.Id == line.Id), new Dictionary<string, string[]>());
    }

    private static InventoryItemDto CreatePpeItem(
        ServiceProvider provider,
        string normName,
        string brand,
        string? catalogName = null,
        string model = "",
        string? article = null,
        string protectionClass = "")
    {
        var itemName = catalogName ?? $"{normName} {Guid.NewGuid():N}";
        var item = UseCommand(provider, command => command.CreateItem(new UpsertInventoryItemDto(
            itemName,
            Sku: $"PPE-{Guid.NewGuid():N}"[..16],
            ItemKind: "ppe",
            NormItemName: normName,
            ActualItemName: itemName,
            BrandName: brand,
            ModelName: model,
            Article: article ?? $"ART-{Guid.NewGuid():N}"[..16],
            ProtectionClass: protectionClass,
            DefaultLifeMonths: 12,
            DefaultUnitPriceMinor: 99_999,
            TrackLife: true,
            TrackingType: "quantity",
            Comment: "Created by PPE DOCX integration test")));

        Assert.True(item.Succeeded);
        Assert.NotNull(item.Value);
        return item.Value!;
    }
    private static T UseCommand<T>(ServiceProvider provider, Func<IInventoryCatalogCommandService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryCatalogCommandService>());
    }

    private static T UseQuery<T>(ServiceProvider provider, Func<IInventoryCatalogQuery, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryCatalogQuery>());
    }

    private static T UseExport<T>(ServiceProvider provider, Func<IInventoryExportService, T> action)
    {
        using var scope = provider.CreateScope();
        return action(scope.ServiceProvider.GetRequiredService<IInventoryExportService>());
    }

    private static InventoryStockBalanceDto GetStock(ServiceProvider provider, Guid itemId, Guid warehouseId) =>
        UseQuery(provider, query => query.GetStock(new InventoryListQuery(ItemId: itemId, PageSize: 50))
            .Rows
            .Single(row => row.ItemId == itemId && row.WarehouseId == warehouseId));

    private static string ReadDocxDocumentXml(byte[] docx)
    {
        using var archive = new ZipArchive(new MemoryStream(docx), ZipArchiveMode.Read);
        var entry = archive.GetEntry("word/document.xml") ?? throw new InvalidOperationException("DOCX does not contain word/document.xml.");
        using var stream = entry.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static InventoryPpeEmployeeDetailsDto CompleteEmployeeDetails() =>
        new(
            "муж.",
            "176",
            "52-54",
            "43",
            "58",
            "полумаска 2",
            "10");

    private static void WritePrintFixture(
        string? directory,
        string employeeName,
        string personnelNo,
        Guid cardId,
        InventoryGeneratedFileDto personalCard,
        InventoryGeneratedFileDto signatureSheet)
    {
        if (string.IsNullOrWhiteSpace(directory))
        {
            return;
        }

        Directory.CreateDirectory(directory);
        WriteGeneratedDocument(directory, "personal-card", personalCard);
        WriteGeneratedDocument(directory, "signature-sheet", signatureSheet);

        var readme = string.Join(Environment.NewLine, [
            "# PPE print fixture",
            "",
            "Generated by InventoryPpePrintDbIntegrationTests.",
            $"Employee: {employeeName}",
            $"Personnel no: {personnelNo}",
            $"Card id: {cardId}",
            $"Personal card source: {personalCard.DownloadName}",
            $"Signature sheet source: {signatureSheet.DownloadName}",
            "",
            "Files:",
            "- personal-card.docx - личная карточка учета выдачи СИЗ.",
            "- personal-card.document.xml - raw Word XML for data/placeholder checks.",
            "- signature-sheet.docx - лист подписи получения СИЗ.",
            "- signature-sheet.document.xml - raw Word XML for data/placeholder checks.",
            ""
        ]);
        File.WriteAllText(Path.Combine(directory, "README.md"), readme, Encoding.UTF8);
    }

    private static void WriteGeneratedDocument(string directory, string baseName, InventoryGeneratedFileDto file)
    {
        File.WriteAllBytes(Path.Combine(directory, $"{baseName}.docx"), file.Content);
        File.WriteAllText(
            Path.Combine(directory, $"{baseName}.document.xml"),
            ReadDocxDocumentXml(file.Content),
            Encoding.UTF8);
    }

    private static int CountTables(XDocument document) =>
        document.Descendants(W("tbl")).Count();

    private static int CountTableRows(XDocument document, int tableIndex) =>
        document.Descendants(W("tbl")).ElementAt(tableIndex).Descendants(W("tr")).Count();

    private static int CountTableCells(XDocument document, int tableIndex, int rowIndex) =>
        document.Descendants(W("tbl")).ElementAt(tableIndex).Descendants(W("tr")).ElementAt(rowIndex).Elements(W("tc")).Count();

    private static XName W(string name) =>
        XName.Get(name, "http://schemas.openxmlformats.org/wordprocessingml/2006/main");
}
