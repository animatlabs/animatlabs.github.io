---
permalink: /workflowforge-guide/
title: "WorkflowForge: The Complete Guide to .NET Workflow Automation"
excerpt: >-
  Everything you need to build, schedule, and orchestrate workflows in .NET with WorkflowForge. From getting started to saga compensation, HTMX dashboards, and production CI/CD pipelines.
author_profile: true
author: animat089
sitemap: true
toc: true
toc_label: "Guide Contents"
last_modified_at: 2026-03-26
---

WorkflowForge is a zero-dependency .NET workflow engine. Code-first, compensation built in, microsecond execution. Everything I've written about it is linked below.

## Getting Started

New to WorkflowForge? Start here.

- [WorkflowForge Introduction](/technical/.net/workflow/workflow-forge-introduction/). What it is, why I built it, and how to install from NuGet.

## Performance and Benchmarks

- [WorkflowForge 2.0 Benchmarks](/technical/.net/workflow/workflow-forge-2-performance-unleashed/). BenchmarkDotNet numbers against Workflow Core and Elsa. Execution time and memory, scenario by scenario.

## Integrations and Patterns

WorkflowForge paired with scheduling, messaging, and UI.

- [WorkflowForge + Coravel](/technical/.net/workflow/workflowforge-coravel-scheduled-workflows/). Coravel handles cron scheduling; WorkflowForge runs the workflow and compensates on failure.
- [MassTransit Saga + WorkflowForge](/technical/.net/workflow/masstransit-workflowforge-saga/). MassTransit for messaging, WorkflowForge for saga rollback. Working code, not theory.
- [HTMX Dashboard in .NET](/technical/.net/workflow/htmx-dotnet/). Stream workflow status to the browser with HTMX SSE and server-rendered HTML fragments.

## Supporting Topics

Tech used alongside WorkflowForge in the posts above.

- [Server-Sent Events in ASP.NET Core](/technical/.net/server-sent-events-dotnet/). The SSE plumbing behind the HTMX dashboard.
- [Polly v8 Resilience Patterns](/technical/.net/.net-core/polly-v8-resilience-patterns/). Retry, circuit-break, and timeout within workflow operations.
- [Traefik for .NET Docker Services](/technical/.net/infra/dotnet-docker-traefik/). Run WorkflowForge behind Traefik in Docker.

## Comparisons

How WorkflowForge compares to the other .NET workflow engines.

- [WorkflowForge vs Elsa](/workflowforge-vs-elsa/). Benchmarks, architecture, API, and when Elsa is the better pick.
- [WorkflowForge vs Workflow Core](/workflowforge-vs-workflow-core/). Performance numbers, maintenance status, compensation differences.

## Shipping to Production

- [.NET OSS Release Pipeline](/technical/.net/open-source/shipping-quality-dotnet-oss-release/). The CI/CD behind WorkflowForge releases. SonarCloud, Sigstore signing, CycloneDX SBOM, environment-gated NuGet push.

## Resources

| Resource | Link |
|----------|------|
| GitHub | [animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge) |
| NuGet | [WorkflowForge on NuGet](https://www.nuget.org/packages/WorkflowForge) |
| Documentation | [workflow-forge.animatlabs.com](https://workflow-forge.animatlabs.com) |
