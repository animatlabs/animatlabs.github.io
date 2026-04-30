# Blog Publishing Schedule

**Quality over quantity | April 2026 - December 2026**

> **Local-First:** All posts run locally with Docker/Podman. No cloud subscriptions. Each playground project ships its own `docker-compose.yml`.

> **Content Mix:** Visual/geometry, infrastructure, and WorkflowForge anchor posts on rotation. No generic tutorials.

---

## Published

| Date | Post | Status |
|------|------|--------|
| Jan 26, 2026 | WorkflowForge 2.0: Performance Unleashed | **PUBLISHED** |
| Feb 3, 2026 | Source Generators: Eliminate Boilerplate, Boost Performance | **PUBLISHED** |
| Feb 9, 2026 | WorkflowForge + Coravel: Scheduled Workflows | **PUBLISHED** |
| Mar 8, 2026 | Ship a Quality .NET OSS Release | **PUBLISHED** |
| Mar 10, 2026 | Polly v8 Resilience Patterns | **PUBLISHED** |
| Mar 14, 2026 | Traefik Reverse Proxy for .NET Docker Services | **PUBLISHED** |
| Mar 15, 2026 | MassTransit Saga + WorkflowForge Compensation | **PUBLISHED** |
| Mar 16, 2026 | Server-Sent Events in ASP.NET Core | **PUBLISHED** |
| Mar 24, 2026 | HTMX Dashboard with WorkflowForge | **PUBLISHED** |
| Apr 27, 2026 | CDC with Debezium + Kafka: PostgreSQL Changes to Typed .NET Events | **PUBLISHED** |

---

## Roadmap: May - December 2026

### May 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| May 4 | CDC Events to the Browser: Kafka + SignalR + SSE in .NET | Real-time | `KafkaSignalR/` | READY |
| May 5 | Computational Geometry in C#: Math.NET Spatial + NetTopologySuite | Visual | `ComputationalGeometry/` | READY |
| May 19 | 3D Shapes in C# with WPF and Helix Toolkit | Visual | `HelixToolkit3D/` | READY |

### June 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Jun 2 | Parsing Building Models in C#: IFC Files with xBIM | Visual | `IFC.xBIM/` | DRAFT |
| Jun 16 | FastEndpoints: Why I Stopped Using Minimal APIs | Technical | `FastEndpoints/` | DRAFT |

### July 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Jul 7 | Reading AutoCAD Files in .NET: DWG/DXF with ACadSharp | Visual | `CAD.ACadSharp/` | DRAFT |
| Jul 21 | Transactional Outbox with CDC: Never Lose an Event | Infra | `OutboxPattern/` | DRAFT |

### August 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Aug 4 | WorkflowForge + Geometry Pipeline: Orchestrated CAD Processing | WF Anchor | `WorkflowForge/` | DRAFT |
| Aug 18 | SharpGLTF: Building 3D Models in Code | Visual | `SharpGLTF/` | DRAFT |

### September 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Sep 1 | Elsa Workflows 3.0 vs WorkflowForge: Honest Comparison | WF Anchor | Both | DRAFT |
| Sep 15 | System.IO.Pipelines + Channels for High-Throughput Parsing | Technical | `IoPipelines/` | DRAFT |

### October 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Oct 6 | Hidden .NET Performance APIs You're Not Using | Technical | `HiddenPerfApis/` | DRAFT |
| Oct 20 | Zero Dependencies: How I Built WorkflowForge | WF Anchor | - | DRAFT |

### November 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Nov 3 | Wolverine: I Replaced MediatR and MassTransit | Infra | `WolverineMessaging/` | DRAFT |

### December 2026

| Date | Post | Type | Playground | Status |
|------|------|------|------------|--------|
| Dec 1 | Marten: PostgreSQL as Document DB + Event Store | Infra | `MartenEventStore/` | DRAFT |
| Dec 15 | Saga Pattern in .NET: Automatic Compensation | WF Anchor | `WorkflowForge/` | DRAFT |

---

## Content Chains

### Geometry & CAD
Math.NET Spatial -> Helix Toolkit 3D -> xBIM IFC -> ACadSharp DWG/DXF -> SharpGLTF -> WF Geometry Pipeline

### CDC Pipeline
CDC + Debezium -> Kafka + SignalR/SSE -> Transactional Outbox with CDC

### WorkflowForge Anchors
Geometry Pipeline -> Elsa Comparison -> Zero Deps Philosophy -> Saga Deep Dive

---

## Backlog (2027, unscheduled)

- Testcontainers
- Threading Channels
- Local-first CRDTs
- Podman
- BenchmarkDotNet mastery
- n8n vs code workflows
- .NET Aspire
- IAsyncEnumerable patterns
- Developer Toolbox 2026
- Postmortem Playbook
- 5 Hidden SPOFs
- Vertical Slice vs Clean
- I/O Pipelines
- Domain Events
- Native AOT
- gRPC
- EF Core 10
- .NET 10 Performance
- Records vs Classes
- Rate Limiting
- TimeProvider
- Blazor WASM Geometry Viewer (capstone)
- Mapperly
- ErrorOr/OneOf
- YARP
- Humanizer

## Moved to Someday (low-value or redundant)

- Microsoft.Extensions.AI
- Spectre.Console CLI
- Serilog structured logging
- Health checks and metrics
- RAG with Ollama
- Scalar vs Swagger
- Kafka alternatives comparison
- OpenTelemetry complete guide
- HTMX+SSE dashboard (duplicate)
- FluentValidation patterns
- Pattern matching deep dive
- Minimal APIs deep dive
- DORA Metrics (process-heavy, no code)
- 4 Pillars of Architecture (generic)
- Architecture Decision Records (widely covered)
- EF Core vs Dapper benchmarks (done to death)
- AI Code Review Bot (AI content deferred)
- Verify.NET snapshot testing (niche)
- Kiota API client generation (MS tooling intro)
- Semantic Kernel + Ollama (AI content deferred)

---

## Quality Bar

- Working playground code, clone-and-run in 5 minutes
- Docker-compose for infra deps (PostgreSQL, Kafka, etc.)
- All tools free and open source (Podman/Rancher compatible)
- .NET 10 where possible, .NET 8 LTS where libraries need it
- Visual output or tangible demo
- Humanized content, ZeroGPT target under 15% AI
- GitHub playground button in every post
- README with run instructions matching the blog
