using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ApplicationParts;
using Microsoft.AspNetCore.Mvc.Controllers;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Patrol360.Api.Controllers;
using Patrol360.Api.MobileAppUpdates;

namespace Patrol360.Api.Tests;

public sealed class MobileAppUpdateTests : IDisposable
{
    private const string Contour = "patrol360-test-contour";
    private readonly string releaseDirectory = Directory.CreateTempSubdirectory("patrol360-releases-").FullName;
    private readonly byte[] apkBytes = RandomNumberGenerator.GetBytes(256 * 1024 + 17);

    public void Dispose() => Directory.Delete(releaseDirectory, recursive: true);

    [Fact]
    public async Task ManifestDescribesThePublishedApkAndTheClientCanDownloadAndVerifyIt()
    {
        Publish(versionCode: 53, minimumVersionCode: 50);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        var manifest = await server.GetManifestAsync();
        Assert.Equal("0.1.53", manifest.GetProperty("versionName").GetString());
        Assert.Equal(53, manifest.GetProperty("versionCode").GetInt32());
        Assert.Equal(50, manifest.GetProperty("minimumVersionCode").GetInt32());
        Assert.Equal(apkBytes.Length, manifest.GetProperty("apkSizeBytes").GetInt64());
        Assert.Equal(Sha256(apkBytes), manifest.GetProperty("sha256").GetString());
        Assert.Equal("Исправлена отправка фото.", manifest.GetProperty("releaseNotes").GetString());
        var downloadUrl = manifest.GetProperty("downloadUrl").GetString()!;
        Assert.Equal("/api/v1/mobile/app-update/apk/53", downloadUrl);

        using var download = await server.SendAsync(HttpMethod.Get, downloadUrl);
        Assert.Equal(HttpStatusCode.OK, download.StatusCode);
        Assert.Equal(MobileAppUpdateController.ApkContentType, download.Content.Headers.ContentType?.MediaType);
        Assert.Equal(Sha256(apkBytes), download.Headers.GetValues(MobileAppUpdateController.ApkSha256Header).Single());
        var downloaded = await download.Content.ReadAsByteArrayAsync();
        Assert.Equal(manifest.GetProperty("sha256").GetString(), Sha256(downloaded));
    }

    [Fact]
    public async Task ApkDownloadSupportsRangeRequests()
    {
        Publish(versionCode: 53);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var request = server.Request(HttpMethod.Get, "/api/v1/mobile/app-update/apk/53");
        request.Headers.Range = new RangeHeaderValue(1000, 1999);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.PartialContent, response.StatusCode);
        Assert.Equal(apkBytes[1000..2000], await response.Content.ReadAsByteArrayAsync());
        Assert.Equal(apkBytes.Length, response.Content.Headers.ContentRange?.Length);
    }

    [Fact]
    public async Task ApkOfAnotherVersionIsNotServed()
    {
        Publish(versionCode: 53);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var response = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update/apk/52");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("app_update_version_unavailable", await ReadCodeAsync(response));
    }

    [Fact]
    public async Task ContourMustMatchViaHeaderOrQuery()
    {
        Publish(versionCode: 53);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var withoutContour = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update", contour: null);
        using var wrongContour = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update", contour: "other-contour");
        using var wrongApkContour = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update/apk/53", contour: "other-contour");
        using var queryContour = await server.SendAsync(HttpMethod.Get, $"/api/v1/mobile/app-update?contourId={Contour}", contour: null);

        Assert.Equal(HttpStatusCode.BadRequest, withoutContour.StatusCode);
        Assert.Equal("wrong_contour", await ReadCodeAsync(wrongContour));
        Assert.Equal(HttpStatusCode.BadRequest, wrongApkContour.StatusCode);
        Assert.Equal(HttpStatusCode.OK, queryContour.StatusCode);
    }

    [Fact]
    public async Task NothingIsOfferedWithoutAPublishedRelease()
    {
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var manifest = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update");
        using var bootstrap = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/bootstrap", versionCode: 1);

        Assert.Equal(HttpStatusCode.NotFound, manifest.StatusCode);
        Assert.Equal("app_update_not_published", await ReadCodeAsync(manifest));
        // No APK to install means no phone may be blocked.
        Assert.Equal(HttpStatusCode.OK, bootstrap.StatusCode);
    }

    [Theory]
    [InlineData("{\"versionName\":\"0.1.53\",\"versionCode\":53,\"apkFileName\":\"../patrol360.apk\"}")]
    [InlineData("{\"versionName\":\"0.1.53\",\"versionCode\":53,\"apkFileName\":\"patrol360.zip\"}")]
    [InlineData("{\"versionName\":\"0.1.53\",\"versionCode\":53,\"minimumVersionCode\":60,\"apkFileName\":\"patrol360.apk\"}")]
    [InlineData("{\"versionName\":\"\",\"versionCode\":53,\"apkFileName\":\"patrol360.apk\"}")]
    [InlineData("{\"versionName\":\"0.1.53\",\"versionCode\":53,\"apkFileName\":\"missing.apk\"}")]
    [InlineData("{\"versionName\":\"0.1.53\",\"versionCode\":53,\"apkFileName\":\"patrol360.apk\",\"sha256\":\"0000000000000000000000000000000000000000000000000000000000000000\"}")]
    [InlineData("not json")]
    public async Task InvalidOrInconsistentReleaseIsNotOffered(string manifestJson)
    {
        File.WriteAllBytes(Path.Combine(releaseDirectory, "patrol360.apk"), apkBytes);
        File.WriteAllText(Path.Combine(releaseDirectory, MobileAppReleaseCatalog.ManifestFileName), manifestJson);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var response = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task ManifestSha256IsAcceptedWhenItMatchesTheFile()
    {
        Publish(versionCode: 53, sha256: Sha256(apkBytes).ToUpperInvariant());
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        var manifest = await server.GetManifestAsync();

        Assert.Equal(Sha256(apkBytes), manifest.GetProperty("sha256").GetString());
    }

    [Fact]
    public async Task PublishingANewApkReplacesTheOfferAndItsHash()
    {
        Publish(versionCode: 53);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);
        Assert.Equal(Sha256(apkBytes), (await server.GetManifestAsync()).GetProperty("sha256").GetString());

        var nextApk = RandomNumberGenerator.GetBytes(1024);
        Publish(versionCode: 54, apk: nextApk, apkFileName: "patrol360-54.apk");
        var manifest = await server.GetManifestAsync();

        Assert.Equal(54, manifest.GetProperty("versionCode").GetInt32());
        Assert.Equal(Sha256(nextApk), manifest.GetProperty("sha256").GetString());
        Assert.Equal(nextApk.Length, manifest.GetProperty("apkSizeBytes").GetInt64());
    }

    [Fact]
    public async Task ConfiguredMinimumWinsButNeverExceedsThePublishedVersion()
    {
        Publish(versionCode: 53, minimumVersionCode: 40);
        await using var raised = await UpdateServer.StartAsync(releaseDirectory, new() { ["MinimumVersionCode"] = "51" });
        Assert.Equal(51, (await raised.GetManifestAsync()).GetProperty("minimumVersionCode").GetInt32());

        await using var capped = await UpdateServer.StartAsync(releaseDirectory, new() { ["MinimumVersionCode"] = "99" });
        Assert.Equal(53, (await capped.GetManifestAsync()).GetProperty("minimumVersionCode").GetInt32());
    }

    [Fact]
    public async Task OutdatedClientGetsTypedUpdateRequiredError()
    {
        Publish(versionCode: 53, minimumVersionCode: 50);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var response = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/bootstrap", versionCode: 49);

        Assert.Equal(HttpStatusCode.UpgradeRequired, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<JsonElement>();
        Assert.Equal(MobileAppVersionGateMiddleware.UpdateRequiredCode, body.GetProperty("code").GetString());
        Assert.Equal(49, body.GetProperty("installedVersionCode").GetInt32());
        Assert.Equal(50, body.GetProperty("minimumVersionCode").GetInt32());
        Assert.Equal(53, body.GetProperty("latestVersionCode").GetInt32());
        Assert.Equal("0.1.53", body.GetProperty("latestVersionName").GetString());
        Assert.Contains("Требуется обновление", body.GetProperty("message").GetString());
    }

    [Theory]
    [InlineData(50)]
    [InlineData(53)]
    public async Task SupportedClientPassesTheGate(int versionCode)
    {
        Publish(versionCode: 53, minimumVersionCode: 50);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var response = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/bootstrap", versionCode: versionCode);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task OutdatedClientCanStillDrainItsQueueAndFetchTheUpdate()
    {
        Publish(versionCode: 53, minimumVersionCode: 50);
        await using var server = await UpdateServer.StartAsync(releaseDirectory);

        using var outbox = await server.SendAsync(HttpMethod.Post, "/api/v1/mobile/outbox", versionCode: 40);
        using var manifest = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update", versionCode: 40);
        using var apk = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update/apk/53", versionCode: 40);
        using var adminApi = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile-accounts", versionCode: 40);

        Assert.Equal(HttpStatusCode.OK, outbox.StatusCode);
        Assert.Equal(HttpStatusCode.OK, manifest.StatusCode);
        Assert.Equal(HttpStatusCode.OK, apk.StatusCode);
        Assert.Equal(HttpStatusCode.OK, adminApi.StatusCode);
    }

    [Theory]
    [InlineData(false, HttpStatusCode.OK)]
    [InlineData(true, HttpStatusCode.UpgradeRequired)]
    public async Task ClientsWithoutVersionHeaderAreRejectedOnlyWhenConfigured(bool reject, HttpStatusCode expected)
    {
        Publish(versionCode: 53, minimumVersionCode: 50);
        await using var server = await UpdateServer.StartAsync(
            releaseDirectory,
            new() { ["RejectClientsWithoutVersionCode"] = reject.ToString() });

        using var response = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/bootstrap");
        using var garbage = await server.SendAsync(HttpMethod.Get, "/api/v1/mobile/bootstrap", rawVersionCode: "abc");

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(expected, garbage.StatusCode);
    }

    [Fact]
    public void QueueDrainAndSignInEndpointsAreTheOnlyMobileEndpointsOpenToOutdatedApps()
    {
        var exempt = typeof(MobileController).GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly)
            .Where(method => method.GetCustomAttribute<AllowOutdatedMobileAppAttribute>() is not null)
            .Select(method => method.Name)
            .Order()
            .ToArray();

        Assert.Equal(
            new[]
            {
                nameof(MobileController.Health),
                nameof(MobileController.Login),
                nameof(MobileController.Logout),
                nameof(MobileController.Outbox),
                nameof(MobileController.OutboxResult),
                nameof(MobileController.Refresh),
                nameof(MobileController.UploadFile)
            }.Order(),
            exempt);
        Assert.Null(typeof(MobileController).GetCustomAttribute<AllowOutdatedMobileAppAttribute>());
        Assert.Null(typeof(MobileV2Controller).GetCustomAttribute<AllowOutdatedMobileAppAttribute>());
        Assert.NotNull(typeof(MobileAppUpdateController).GetCustomAttribute<AllowOutdatedMobileAppAttribute>());
        Assert.NotNull(typeof(MobileAppUpdateController).GetCustomAttribute<AllowAnonymousAttribute>());
    }

    [Theory]
    [InlineData("53", 53)]
    [InlineData(" 7 ", 7)]
    [InlineData("0", null)]
    [InlineData("-3", null)]
    [InlineData("5.1", null)]
    [InlineData("", null)]
    [InlineData(null, null)]
    public void VersionCodeHeaderParsing(string? value, int? expected)
    {
        Assert.Equal(expected, MobileAppVersionGateMiddleware.TryReadVersionCode(value));
    }

    private void Publish(
        int versionCode,
        int? minimumVersionCode = null,
        string? sha256 = null,
        byte[]? apk = null,
        string apkFileName = "patrol360.apk")
    {
        File.WriteAllBytes(Path.Combine(releaseDirectory, apkFileName), apk ?? apkBytes);
        File.WriteAllText(
            Path.Combine(releaseDirectory, MobileAppReleaseCatalog.ManifestFileName),
            JsonSerializer.Serialize(new
            {
                versionName = $"0.1.{versionCode}",
                versionCode,
                minimumVersionCode,
                apkFileName,
                sha256,
                releaseNotes = "Исправлена отправка фото."
            }));
    }

    private static string Sha256(byte[] bytes) => Convert.ToHexStringLower(SHA256.HashData(bytes));

    private static async Task<string?> ReadCodeAsync(HttpResponseMessage response) =>
        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("code").GetString();

    private sealed class UpdateServer : IAsyncDisposable
    {
        private readonly WebApplication app;

        private UpdateServer(WebApplication app, HttpClient client)
        {
            this.app = app;
            Client = client;
        }

        public HttpClient Client { get; }

        public static async Task<UpdateServer> StartAsync(string releaseDirectory, Dictionary<string, string?>? updateSettings = null)
        {
            var builder = WebApplication.CreateSlimBuilder(new WebApplicationOptions { EnvironmentName = "Development" });
            builder.WebHost.UseUrls("http://127.0.0.1:0");
            builder.Logging.ClearProviders();
            var settings = new Dictionary<string, string?>
            {
                ["Patrol360:Mobile:ContourId"] = Contour,
                [$"{MobileAppReleaseCatalog.ConfigurationSection}:ReleaseDirectory"] = releaseDirectory
            };
            foreach (var (key, value) in updateSettings ?? [])
            {
                settings[$"{MobileAppReleaseCatalog.ConfigurationSection}:{key}"] = value;
            }

            builder.Configuration.AddInMemoryCollection(settings);
            builder.Services.AddControllers()
                .AddApplicationPart(typeof(MobileAppUpdateController).Assembly)
                .ConfigureApplicationPartManager(manager =>
                {
                    manager.FeatureProviders.Clear();
                    manager.FeatureProviders.Add(new SingleControllerFeatureProvider(typeof(MobileAppUpdateController)));
                });
            builder.Services.AddMobileAppUpdates();
            builder.Services.AddRateLimiter(options => options.AddMobileApkDownloadLimiter());

            var app = builder.Build();
            app.UseRateLimiter();
            app.UseMobileAppVersionGate();
            app.MapControllers();
            // Stand-ins with the same routes and metadata as MobileController.
            app.MapGet("/api/v1/mobile/bootstrap", () => Results.Ok(new { ok = true }));
            app.MapPost("/api/v1/mobile/outbox", () => Results.Ok()).WithMetadata(new AllowOutdatedMobileAppAttribute());
            app.MapGet("/api/v1/mobile-accounts", () => Results.Ok());
            await app.StartAsync();

            var address = app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()!.Addresses.First();
            return new UpdateServer(app, new HttpClient { BaseAddress = new Uri(address) });
        }

        public HttpRequestMessage Request(HttpMethod method, string path, string? contour = Contour, int? versionCode = null, string? rawVersionCode = null)
        {
            var request = new HttpRequestMessage(method, path);
            if (contour is not null) request.Headers.Add(MobileAppUpdateController.ContourHeader, contour);
            var version = rawVersionCode ?? versionCode?.ToString();
            if (version is not null) request.Headers.Add(MobileAppVersionGateMiddleware.VersionCodeHeader, version);
            return request;
        }

        public Task<HttpResponseMessage> SendAsync(HttpMethod method, string path, string? contour = Contour, int? versionCode = null, string? rawVersionCode = null) =>
            Client.SendAsync(Request(method, path, contour, versionCode, rawVersionCode));

        public async Task<JsonElement> GetManifestAsync()
        {
            using var response = await SendAsync(HttpMethod.Get, "/api/v1/mobile/app-update", versionCode: 52);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            return await response.Content.ReadFromJsonAsync<JsonElement>();
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private sealed class SingleControllerFeatureProvider(Type controllerType) : IApplicationFeatureProvider<ControllerFeature>
    {
        public void PopulateFeature(IEnumerable<ApplicationPart> parts, ControllerFeature feature) =>
            feature.Controllers.Add(controllerType.GetTypeInfo());
    }
}
