---
title: "Podman: Docker Without the Daemon (and Why It Matters)"
excerpt: >-
  "Docker Desktop licensing changed. ingress-nginx is retiring. Podman is daemonless, rootless, and .NET Aspire now supports it."
categories:
  - Technical
  - DevOps
tags:
  - Podman
  - Docker
  - Containers
  - DevOps
  - .NET Aspire
  - Daemonless
  - Infrastructure
author: animat089
last_modified_at: 2026-08-03
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- Why Podman now? (Docker Desktop licensing, ingress-nginx retiring)
- Podman vs Docker: architecture differences
- Daemonless and rootless containers
- Installation on Windows/Linux/Mac
- Podman with .NET Aspire (DOTNET_ASPIRE_CONTAINER_RUNTIME=podman)
- Podman Compose vs Docker Compose
- Podman Quadlets for systemd integration
- Migration path from Docker to Podman
- Current limitations and workarounds
- When to stick with Docker

UNIQUE ANGLE: Timely (ingress-nginx retiring March 2026). Practical migration guide.
-->

## Why Podman Now?

*Content to be written*

## Podman vs Docker

| Feature | Docker | Podman |
|---------|--------|--------|
| Daemon | Required (dockerd) | None (daemonless) |
| Root | Root by default | Rootless by default |
| License | Docker Desktop requires license | Fully open source |
| .NET Aspire | Default | Supported (preview) |

## Getting Started

*Content to be written*

## Conclusion

*Content to be written*

---

*Made the switch to Podman? Let me know your experience in the comments!*
