ARG DOTNET_VERSION=10.0

FROM mcr.microsoft.com/dotnet/sdk:${DOTNET_VERSION} AS build
WORKDIR /src

COPY global.json Directory.Build.props ./
COPY apps/worker/Patrol360.Worker.csproj apps/worker/
COPY libs/application/Patrol360.Application.csproj libs/application/
COPY libs/contracts/Patrol360.Contracts.csproj libs/contracts/
COPY libs/domain/Patrol360.Domain.csproj libs/domain/
COPY libs/infrastructure/Patrol360.Infrastructure.csproj libs/infrastructure/
RUN dotnet restore apps/worker/Patrol360.Worker.csproj

COPY apps/worker apps/worker
COPY libs libs
RUN dotnet publish apps/worker/Patrol360.Worker.csproj --configuration Release --no-restore --output /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:${DOTNET_VERSION} AS runtime
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgssapi-krb5-2 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "Patrol360.Worker.dll"]
