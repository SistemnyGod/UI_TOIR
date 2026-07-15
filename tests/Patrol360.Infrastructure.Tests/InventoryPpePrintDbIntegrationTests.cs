using System.IO.Compression;
using System.Text;
using System.Xml.Linq;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Patrol360.Application;
using Patrol360.Contracts;
using Patrol360.Infrastructure.Persistence;

namespace Patrol360.Infrastructure.Tests;

public sealed class InventoryPpePrintDbIntegrationTests
{
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

        var section = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var helmet = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var suit = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var jacket = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var notIssued = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var personalCard = UseExport(provider, export => export.PrintPpeCard(cardId, "card", "docx"));
        var signatureSheet = UseExport(provider, export => export.PrintPpeCard(cardId, "sheet", "docx"));

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

        Assert.Contains(helmetNorm, sheetXml, StringComparison.Ordinal);
        Assert.Contains("СОМЗ", sheetXml, StringComparison.Ordinal);
        Assert.Contains("1 шт.", sheetXml, StringComparison.Ordinal);
        Assert.Contains(suitNorm, sheetXml, StringComparison.Ordinal);
        Assert.Contains("Форвард", sheetXml, StringComparison.Ordinal);
        Assert.Contains(jacketNorm, sheetXml, StringComparison.Ordinal);
        Assert.Contains("Эксперт К3, SIM-06/K", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(winterSection, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain(raincoatNorm, sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Плащ влагозащитный Prosafe", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Каска защ. синяя СОМЗ", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Костюм утепленный Форвард", sheetXml, StringComparison.Ordinal);
        Assert.DoesNotContain("Куртка Эксперт К3 / SIM-06/K", sheetXml, StringComparison.Ordinal);
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

        var issued = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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
                IssuedAt: DateTimeOffset.UtcNow.AddDays(-1),
                BrandModelArticle: "SafeBrand H1 updated",
                QuantityText: "1 custom pcs. updated",
                IsSectionTitle: false)));
        Assert.True(updated.Succeeded);
        Assert.NotNull(updated.Value);

        var section = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var personalCard = UseExport(provider, export => export.PrintPpeCard(cardId, "card", "docx"));
        var signatureSheet = UseExport(provider, export => export.PrintPpeCard(cardId, "sheet", "docx"));

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
        Assert.Contains(issuedNorm, sheetXml, StringComparison.Ordinal);
        Assert.Contains("1 custom pcs. updated", sheetXml, StringComparison.Ordinal);
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
    public async Task PpeDocxPrintUsesNormNamesAndFiltersSignatureRows()
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

        var issued = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var replacement = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var returned = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var notIssued = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var personalCard = UseExport(provider, export => export.PrintPpeCard(cardId, "card", "docx"));
        var signatureSheet = UseExport(provider, export => export.PrintPpeCard(cardId, "sheet", "docx"));

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
        Assert.DoesNotContain(issuedItem.Name, sheetXml, StringComparison.Ordinal);
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

        var line = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var print = UseExport(provider, export => export.PrintPpeCard(card.Value!.Id, "card", "docx"));

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

        var line = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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

        var personalCard = UseExport(provider, export => export.PrintPpeCard(card.Value!.Id, "card", "docx"));
        var signatureSheet = UseExport(provider, export => export.PrintPpeCard(card.Value!.Id, "sheet", "docx"));

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
    public async Task PpeIssueReturnAndWriteOffCreateMovementDocumentsWithoutRestocking()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var warehouse = UseCommand(provider, command => command.CreateWarehouse(new CreateInventoryWarehouseDto("PPE lifecycle test warehouse", true)));
        Assert.True(warehouse.Succeeded);
        Assert.NotNull(warehouse.Value);
        var item = CreatePpeItem(provider, "Каска защитная от механических воздействий", brand: "СОМЗ");

        var initialStock = UseCommand(provider, command => command.SetInitialStock(new InventoryInitialStockDto(
            item.Id,
            warehouse.Value!.Id,
            3,
            DateTimeOffset.UtcNow,
            "PPE lifecycle test stock")));
        Assert.True(initialStock.Succeeded);

        var card = UseWorkflow(provider, workflow => workflow.CreatePpeCard(new CreateInventoryPpeCardDto(employee.Id, "PPE movement lifecycle test")));
        Assert.True(card.Succeeded);
        Assert.NotNull(card.Value);
        var cardId = card.Value!.Id;

        var issued = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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
        Assert.Equal(3, GetStock(provider, item.Id, warehouse.Value!.Id).StockAvailable);

        var returnedMovement = UseWorkflow(provider, workflow => workflow.GetPpeMovements(
            new InventoryListQuery(PageSize: 10),
            employee.Id,
            item.Id)).Rows.Single(row => row.LineId == issued.Value!.Id);
        Assert.Equal("returned", returnedMovement.Status);
        Assert.NotNull(returnedMovement.ReturnedAt);
        var returnDocument = UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(
                PageSize: 10,
                Status: "ppe_return")))
            .Rows
            .Single(row =>
                row.ItemName == item.Name &&
                row.EmployeeName == employee.FullName &&
                row.Quantity == 1);
        Assert.Equal("ppe_return", returnDocument.Type);
        Assert.Equal("ppe_return", returnDocument.Comment);
        Assert.NotEqual(cardId, returnDocument.Id);

        var writeOffLine = UseWorkflow(provider, workflow => workflow.AddPpeCardLine(
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
        var writeOffDocument = UseQuery(provider, query => query.GetDocuments(new InventoryListQuery(
                PageSize: 10,
                Status: "ppe_write_off")))
            .Rows
            .Single(row =>
                row.ItemName == item.Name &&
                row.EmployeeName == employee.FullName &&
                row.Quantity == 0);
        Assert.Equal("ppe_write_off", writeOffDocument.Type);
        Assert.Equal("ppe_write_off", writeOffDocument.Comment);
        Assert.NotEqual(cardId, writeOffDocument.Id);
    }

    [DbIntegrationFact]
    public async Task InventoryIssueOperationCanBeRecordedWithoutUserWarehouse()
    {
        await using var database = await TemporaryPostgresDatabase.CreateAsync();
        using var provider = BuildProvider(database.ConnectionString);

        await provider.InitializePatrolDatabaseAsync();

        var employee = UseWorkflow(provider, workflow => workflow.GetEmployees(new InventoryListQuery(PageSize: 1)).Rows.Single());
        var item = CreatePpeItem(provider, "Инструмент для выдачи без склада", brand: "");

        var created = UseCommand(provider, command => command.CreateOperation(new CreateInventoryOperationDto(
            "issue",
            item.Id,
            WarehouseId: null,
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

    private static ServiceProvider BuildProvider(string connectionString)
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:Patrol360"] = connectionString,
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
