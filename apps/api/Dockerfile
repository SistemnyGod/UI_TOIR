# syntax=docker/dockerfile:1.7

ARG DOTNET_VERSION=10.0

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
WORKDIR /src

COPY global.json Directory.Build.props ./
COPY apps/api/Patrol360.Api.csproj apps/api/
COPY libs/application/Patrol360.Application.csproj libs/application/
COPY libs/contracts/Patrol360.Contracts.csproj libs/contracts/
COPY libs/domain/Patrol360.Domain.csproj libs/domain/
COPY libs/infrastructure/Patrol360.Infrastructure.csproj libs/infrastructure/
RUN --mount=type=cache,id=patrol360-nuget,target=/root/.nuget/packages \
    dotnet restore apps/api/Patrol360.Api.csproj --disable-parallel

COPY apps/api apps/api
COPY libs libs
RUN --mount=type=cache,id=patrol360-nuget,target=/root/.nuget/packages \
    dotnet publish apps/api/Patrol360.Api.csproj --configuration Release --no-restore --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 8080

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Patrol360.Api.dll"]
