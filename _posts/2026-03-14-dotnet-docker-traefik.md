---
title: "Run .NET Behind Traefik: Fix Port Conflicts Forever"
excerpt: >-
  "I kept a lookup of port numbers. Five services, Redis, PostgreSQL. Someone would clone the repo and crash on port 5000. Traefik killed that problem."
categories:
  - Technical
  - .NET
  - Infra
tags:
  - .NET
  - Docker
  - Traefik
  - Containers
  - DevOps
  - Reverse Proxy
author: animat089
last_modified_at: 2026-03-21
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## I Kept a Port Lookup Reference

Five .NET services, a React frontend, Redis, and PostgreSQL. I had a text file. Service A on 5000. Service B on 5001. Frontend on 3000.

Someone would clone the repo, run `dotnet run`, and Service A would crash because their machine already had something on 5000. Every. Single. Time.

I added instructions to the README: "Change the port in launchSettings.json." Nobody read them. I changed the ports. Someone else changed them back. I gave up.

Traefik fixed all of this. Every service runs on the same internal port, and routing happens by hostname instead of port number.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/TraefikDotNet){: .btn .btn--primary}

## The docker-compose

```yaml
services:
  traefik:
    image: traefik:v3.6
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entryPoints.web.address=:80"
    ports:
      - "80:80"
      - "8080:8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - traefik-net

  api-service:
    build: ./ApiService
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.localhost`)"
      - "traefik.http.routers.api.entrypoints=web"
      - "traefik.http.services.api.loadbalancer.server.port=8080"
    networks:
      - traefik-net

  web-service:
    build: ./WebService
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`web.localhost`)"
      - "traefik.http.routers.web.entrypoints=web"
      - "traefik.http.services.web.loadbalancer.server.port=8080"
    networks:
      - traefik-net

networks:
  traefik-net:
    driver: bridge
```

That's the full thing. Traefik plus two .NET services. `docker-compose up --build` and you get:
- `http://api.localhost` (API)
- `http://web.localhost` (Web frontend)
- `http://localhost:8080` (Traefik dashboard)

Neither service publishes a port to the host. Third service? Add another block with a different hostname. Traefik picks it up. You don't touch any ports.

All images are free and open-source (Traefik is MIT). The compose commands work with Docker, Podman, or Rancher Desktop.

## The Dockerfile

Both services share the same Dockerfile pattern. `ApiService/Dockerfile`:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src
COPY ["ApiService.csproj", "."]
RUN dotnet restore
COPY . .
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "ApiService.dll"]
```

`WebService/Dockerfile` is identical (swap `ApiService` for `WebService`). Both expose 8080.

## How Traefik Routes

Three concepts: entrypoints (ports Traefik listens on), routers (rules that match requests), and services (the backends that handle them).

In our compose, `web` is an entrypoint on port 80. The router rule `Host(`api.localhost`)` matches the HTTP Host header. And `loadbalancer.server.port=8080` tells Traefik which port *inside the container* to hit.

So `http://api.localhost/orders` goes to Traefik on port 80, Host header matches, Traefik forwards to `api-service:8080`. No port published on the host. No coordination lookup.

You can combine matchers too: `Host(`api.localhost`) && PathPrefix(`/v2`)` for path-based routing on top of hostnames.

## HTTPS With Let's Encrypt

For staging or production, Traefik handles certs. You don't install certbot, you don't set up cron jobs, you don't think about renewal.

```yaml
services:
  traefik:
    image: traefik:v3.6
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entryPoints.web.address=:80"
      - "--entryPoints.websecure.address=:443"
      - "--certificatesresolvers.le.acme.httpchallenge=true"
      - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.le.acme.email=you@example.com"
      - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
      - "--entryPoints.web.http.redirections.entrypoint.to=websecure"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./letsencrypt:/letsencrypt
```

And the service labels:

```yaml
labels:
  - "traefik.http.routers.api.rule=Host(`api.yourdomain.com`)"
  - "traefik.http.routers.api.entrypoints=websecure"
  - "traefik.http.routers.api.tls.certresolver=le"
```

Issues the cert. Renews before expiry. Redirects HTTP to HTTPS. I set this up once six months ago and haven't touched it since.

## Debugging

I hit all of these at least once.

The 502 I burned the most time on was a port mismatch. My `loadbalancer.server.port` label said 5000 but the container was listening on 8080. Dashboard at `localhost:8080` showed the router in red. Obvious in hindsight. Check `docker ps`, verify the container is alive, then look at the dashboard.

The 404-on-everything problem? Missing `traefik.enable=true`. We set `exposedbydefault=false` in the compose (you should), which means every service needs that label. I missed it on a third service and spent twenty minutes reading Traefik docs before I noticed.

Then there's the backtick thing:

```yaml
# Broken
- "traefik.http.routers.api.rule=Host('api.localhost')"

# Works
- "traefik.http.routers.api.rule=Host(`api.localhost`)"
```

Single quotes vs backticks. The error message doesn't help. You just have to know.

One more: if service A calls service B, skip Traefik entirely. Use the compose service name and internal port:

```csharp
var client = new HttpClient { BaseAddress = new Uri("http://api-service:8080") };
```

That stays inside the Docker network.

## How I Actually Use It

I don't run everything in Docker during development. Too slow for hot reload. What I do: start Traefik once with `docker-compose up -d traefik`, then run individual services with `dotnet watch`. When I need the full containerized setup (integration testing, demo), `docker-compose up --build` brings everything up.

Staging gets TLS and health checks. Production adds rate limiting and access logs on top. Same compose file, different labels. Haven't changed the core config in months.

The playground has two .NET services behind Traefik:

```bash
cd playground/TraefikDotNet
docker-compose up --build
```

Open `http://api.localhost`, `http://web.localhost`, and `http://localhost:8080` (dashboard). Both services run on 8080 internally. No port conflicts.

**Playground:** [TraefikDotNet](https://github.com/animat089/playground/tree/main/TraefikDotNet)

---
