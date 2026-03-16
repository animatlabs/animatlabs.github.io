---
title: "Run .NET Behind Traefik: Fix Port Conflicts Forever"
excerpt: >-
  "Tired of port conflicts when running multiple .NET services? Here's how I use Traefik to route everything through port 80/443."
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
last_modified_at: 2026-03-14
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## I Kept a Port Spreadsheet

Five .NET services, a React frontend, Redis, and PostgreSQL. I had a text file tracking which port belonged to which. Service A on 5000, Service B on 5001, the frontend on 3000.

Someone would clone the repo, run `dotnet run`, and Service A would crash because their machine already had something on 5000.

I added instructions to the README: "Change the port in launchSettings.json." Nobody read them. I changed the ports. Someone else changed them back.

Traefik fixed all of this. Every service runs on the same internal port. Routing happens by hostname. Here's the setup I use.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/TraefikDotNet){: .btn .btn--primary}

## The docker-compose

This is the full thing. Traefik plus two .NET services:

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

`docker-compose up --build` and you get:
- `http://api.localhost` -- API
- `http://web.localhost` -- Web frontend
- `http://localhost:8080` -- Traefik dashboard

Neither service exposes a port to the host. Traefik does all external routing. Third service? Add another block with a different hostname. Traefik picks it up automatically.

## The Dockerfile

Every .NET service uses the same pattern. Here's `ApiService/Dockerfile`:

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

The `WebService/Dockerfile` is identical -- swap `ApiService` for `WebService`. Both expose 8080. Multi-stage keeps the image small -- the final layer is runtime-only, no SDK.

## How Traefik Routes

Three concepts.

**Entrypoints** are the ports Traefik listens on. We have one: `web` on port 80.

**Routers** match incoming requests to a backend. Each router has a rule. Ours is `Host(`api.localhost`)` -- match the Host header.

**Services** are the backends. The `loadbalancer.server.port` label tells Traefik which port inside the container to forward to.

When you request `http://api.localhost/orders`:

1. Request hits Traefik on port 80
2. Host header says `api.localhost`
3. Router matches, forwards to `api-service:8080`
4. Response comes back through Traefik

No port published on the host. No coordination between services. Add another service, give it a hostname, done.

Rules can combine matchers: `Host(`api.localhost`) && PathPrefix(`/v2`)`. Useful when you need path-based routing on top of hostname routing.

## HTTPS With Let's Encrypt

For staging or production, Traefik handles certs automatically:

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

Service labels change slightly:

```yaml
labels:
  - "traefik.http.routers.api.rule=Host(`api.yourdomain.com`)"
  - "traefik.http.routers.api.entrypoints=websecure"
  - "traefik.http.routers.api.tls.certresolver=le"
```

Traefik issues the cert, renews it before expiry, and redirects HTTP to HTTPS. I don't think about certificates anymore.

## Debugging

Most Traefik problems are one of three things.

**502 Bad Gateway.** The container crashed or the port label is wrong. Check `docker ps` -- is the container running? Check the Traefik dashboard at `localhost:8080` -- is the router green or red? Most common cause: `loadbalancer.server.port` says 5000 but the container runs on 8080.

**404 on every route.** Missing `traefik.enable=true`. Traefik defaults to not exposing containers (`exposedbydefault=false`), so you need the label on each service.

**Backtick problem.** The Host rule needs backticks, not quotes:

```yaml
# Broken
- "traefik.http.routers.api.rule=Host('api.localhost')"

# Works
- "traefik.http.routers.api.rule=Host(`api.localhost`)"
```

This one bites everyone once.

**Container-to-container calls.** Containers on the same Docker network reach each other by service name:

```csharp
var client = new HttpClient { BaseAddress = new Uri("http://api-service:8080") };
```

Internal traffic doesn't go through Traefik. Use the service name from docker-compose as the hostname.

## My Local Dev Setup

I don't run everything in Docker during development. Too slow for hot reload.

My workflow: start Traefik once with `docker-compose up -d traefik`. Run individual services with `dotnet watch`. When I need the full containerized setup for integration testing, `docker-compose up --build` and everything comes up.

For staging, I add TLS certs and health checks. For production, I add rate limiting and access logs. Same Traefik config, different labels.

## Run It

The playground has two .NET services behind Traefik:

```bash
cd playground/TraefikDotNet
docker-compose up --build
```

Open `http://api.localhost`, `http://web.localhost`, and `http://localhost:8080` (dashboard). Both services run on 8080 internally. No port conflicts.

**Playground:** [TraefikDotNet](https://github.com/animat089/playground/tree/main/TraefikDotNet)

---

*How do you handle port management across multiple services? Still using a spreadsheet?*
