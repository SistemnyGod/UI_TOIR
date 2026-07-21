using Microsoft.AspNetCore.Mvc;
using Patrol360.Api.Authorization;

namespace Patrol360.Api.Controllers;

public abstract class MobileApiControllerBase : ControllerBase
{
    protected string MobileAccessToken =>
        BearerTokenReader.Read(Request)
        ?? throw new InvalidOperationException("The mobile authorization policy did not provide a bearer token.");
}
