namespace Patrol360.Application;

public interface IMobilePushDeliveryService
{
    Task<int> SendQueuedAsync(CancellationToken cancellationToken);
}

public interface IMobilePushSender
{
    bool IsConfigured { get; }

    Task SendAsync(MobilePushMessage message, CancellationToken cancellationToken);
}

public sealed record MobilePushMessage(
    string Token,
    string Title,
    string Body,
    IReadOnlyDictionary<string, string> Data,
    string ChannelId);
