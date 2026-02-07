---
title: "Run .NET 10 Behind Traefik: Fix Port Conflicts Forever"
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
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Port Conflict Problem

When running multiple .NET services locally, port management becomes a constant headache. Service A needs port 5000, Service B needs 5001, Service C... you get the idea. Then you add a frontend on 3000, maybe Redis on 6379, and suddenly you're juggling a spreadsheet of port assignments.

It gets worse when you need to test with real domain names, or when you want HTTPS locally, or when a colleague clones your repo and their port 5000 is already in use.

The solution is a reverse proxy that routes traffic based on hostnames, not ports. All your services run on the same internal port, and the proxy figures out where to send each request. This is what Traefik does, and it integrates beautifully with Docker.

## Project Setup

### Dockerfile for .NET

Here's a production-ready multi-stage Dockerfile for .NET services:

```dockerfile
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
WORKDIR /app
EXPOSE 8080

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY ["MyService.csproj", "."]
RUN dotnet restore
COPY . .
RUN dotnet build -c Release -o /app/build

FROM build AS publish
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "MyService.dll"]
```

Key points:
- All services expose port 8080 internally - Traefik handles the external routing
- Multi-stage build keeps the final image small
- The base image is the runtime-only `aspnet` image, not the full SDK

### docker-compose.yml

Here's the complete docker-compose setup with Traefik and multiple .NET services:

```yaml
version: '3.8'

services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"  # Traefik dashboard
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks:
      - traefik-network

  api-service:
    build: ./ApiService
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.localhost`)"
      - "traefik.http.routers.api.entrypoints=web"
      - "traefik.http.services.api.loadbalancer.server.port=8080"
    networks:
      - traefik-network

  web-service:
    build: ./WebService
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.web.rule=Host(`web.localhost`)"
      - "traefik.http.routers.web.entrypoints=web"
      - "traefik.http.services.web.loadbalancer.server.port=8080"
    networks:
      - traefik-network

  auth-service:
    build: ./AuthService
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.auth.rule=Host(`auth.localhost`)"
      - "traefik.http.routers.auth.entrypoints=web"
      - "traefik.http.services.auth.loadbalancer.server.port=8080"
    networks:
      - traefik-network

networks:
  traefik-network:
    driver: bridge
```

Now you can access:
- `http://api.localhost` → API Service
- `http://web.localhost` → Web Service  
- `http://auth.localhost` → Auth Service
- `http://localhost:8080` → Traefik Dashboard

No port conflicts. No port spreadsheets.

## Traefik Configuration Explained

Traefik's configuration model has three core concepts:

### Entrypoints

Entrypoints are the ports Traefik listens on. In our config, we have two:
- `web` on port 80 for HTTP
- `websecure` on port 443 for HTTPS

```yaml
- "--entrypoints.web.address=:80"
- "--entrypoints.websecure.address=:443"
```

### Routers

Routers match incoming requests and route them to services. Each router has:
- A **rule** that determines which requests it handles
- An **entrypoint** it listens on
- A **service** it routes to

```yaml
- "traefik.http.routers.api.rule=Host(`api.localhost`)"
- "traefik.http.routers.api.entrypoints=web"
```

Rules can match on:
- `Host()` - hostname
- `Path()` - URL path
- `PathPrefix()` - URL path prefix
- `Headers()` - request headers
- Combinations with `&&` and `||`

### Services

Services are the actual backend applications. The load balancer configuration tells Traefik which port to forward to:

```yaml
- "traefik.http.services.api.loadbalancer.server.port=8080"
```

## Running Multiple .NET Services on Same Port

The magic is that all your .NET services run on port 8080 internally. They don't need to know about each other or coordinate ports. Traefik handles the routing based on the `Host` header in the incoming request.

Here's what happens when you request `http://api.localhost/users`:

1. Request arrives at Traefik on port 80
2. Traefik checks the `Host` header: `api.localhost`
3. The router rule `Host(`api.localhost`)` matches
4. Traefik forwards to `api-service:8080`
5. Response returns through Traefik

This pattern scales to any number of services. Add a new service, give it a hostname, and Traefik routes automatically.

## HTTPS with Let's Encrypt

For production (or even local development with proper HTTPS), Traefik can automatically obtain and renew Let's Encrypt certificates:

```yaml
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.insecure=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      # Let's Encrypt configuration
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.httpchallenge.entrypoint=web"
      - "--certificatesresolvers.letsencrypt.acme.email=your@email.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      # Redirect HTTP to HTTPS
      - "--entrypoints.web.http.redirections.entrypoint.to=websecure"
      - "--entrypoints.web.http.redirections.entrypoint.scheme=https"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./letsencrypt:/letsencrypt  # Persist certificates
```

Update your service labels to use HTTPS:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.api.rule=Host(`api.yourdomain.com`)"
  - "traefik.http.routers.api.entrypoints=websecure"
  - "traefik.http.routers.api.tls.certresolver=letsencrypt"
```

Traefik handles certificate issuance, renewal, and the HTTP challenge - all automatically.

## Debugging Common Issues

### Issue 1: Service Not Accessible

**Symptom:** `502 Bad Gateway` or connection refused

**Debug steps:**
1. Check Traefik dashboard at `http://localhost:8080`
2. Look for your router - is it green or red?
3. Verify the service container is running: `docker ps`
4. Check container logs: `docker logs api-service`

**Common causes:**
- Service crashed during startup
- Port mismatch in `loadbalancer.server.port` label
- Container not on the same Docker network

### Issue 2: 404 on All Routes

**Symptom:** Every request returns 404

**Debug steps:**
1. Verify `traefik.enable=true` label is present
2. Check the router rule syntax - backticks are required: `` Host(`api.localhost`) ``
3. Ensure `exposedbydefault=false` is set (then services need explicit `enable=true`)

**The backtick gotcha:** Docker Compose YAML requires backticks for Host rules. Single quotes won't work:
```yaml
# Wrong
- "traefik.http.routers.api.rule=Host('api.localhost')"

# Correct  
- "traefik.http.routers.api.rule=Host(`api.localhost`)"
```

### Issue 3: Container Can't Connect to Another Container

**Symptom:** Service A can't reach Service B

**Solution:** Use Docker's internal DNS. Containers on the same network can reach each other by service name:

```csharp
// In api-service, connecting to auth-service
var client = new HttpClient { BaseAddress = new Uri("http://auth-service:8080") };
```

The hostname is the service name from docker-compose, not the external hostname. Internal traffic doesn't go through Traefik.

## My Recommended Setup

For local development, I use a `docker-compose.override.yml` that extends the base config:

```yaml
# docker-compose.override.yml (local dev)
services:
  api-service:
    build:
      context: ./ApiService
      dockerfile: Dockerfile.dev  # Uses SDK image for hot reload
    volumes:
      - ./ApiService:/app
    environment:
      - DOTNET_WATCH=true
```

My day-to-day workflow:
1. `docker-compose up -d traefik` - Start Traefik once
2. Run individual services with `dotnet watch` for hot reload
3. Use Traefik labels on the services when I need the full containerized setup

For staging/production, I add:
- TLS certificates (Let's Encrypt or provided)
- Health checks on all services
- Rate limiting middleware
- Access logs for debugging

## Conclusion

Traefik eliminates port management headaches entirely. Every service runs on the same internal port, and routing happens based on hostnames. The Docker provider makes configuration declarative - just add labels to your services.

Start with the basic setup, add HTTPS when you need it, and use the Traefik dashboard to debug routing issues. Once you've worked this way, you'll never go back to managing port numbers manually.

**Sample repository:** [GitHub](https://github.com/animat089/traefik-dotnet-sample){: .btn .btn--primary}

---

*Questions about Traefik configuration or Docker networking? Let me know in the comments!*
