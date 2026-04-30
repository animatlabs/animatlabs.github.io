---
title: "Elsa Workflows 3.0 vs WorkflowForge: An Honest Comparison"
excerpt: >-
  Two .NET workflow libraries, different philosophies. An honest comparison with real code.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - WorkflowForge
  - Elsa Workflows
  - Workflow Engine
  - Open Source
  - Comparison
author: animat089
last_modified_at: 2026-04-30
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

You open NuGet, type "workflow," and get a wall of options. One team wants a designer. Another wants something that drops into a library with no ceremony.

A third needs long running instances that survive restarts and wake up on a signal. Picking the wrong engine is expensive. You bake in persistence shapes, UI expectations, and mental models that are painful to unwind.

I built [WorkflowForge](https://www.nuget.org/packages/WorkflowForge/) (MIT licensed, latest 2.1.1). That means I am not a neutral party.

I care about code first orchestration, compensation, and a core with zero external dependencies. Elsa Workflows is the popular, feature rich option in this space, and it deserves a fair read.

This post is where I would use each, with pros and cons stated plainly and examples that match.

## What Elsa Workflows 3.x is

Elsa is a mature .NET workflow engine with an activity model, a visual designer (Elsa Studio), persistence, bookmarks, signals, and a large surface for HTTP and integration scenarios. You think in activities and graphs.

You often host it inside ASP.NET Core, wire `AddElsa`, and run definitions through `IWorkflowRunner` or long running hosts.

The project is MIT licensed and has a strong community. Docs for the current 3.x line live at [elsaworkflows.io](https://docs.elsaworkflows.io/). If stakeholders want to see a flow on a canvas, Elsa is an obvious shortlist.

## What WorkflowForge is

WorkflowForge is the library I wrote when I wanted orchestration to feel like plain C#. You chain operations, share state through a foundry, and opt into compensation with `RestoreAsync` or explicit companion operations.

The core package takes no extra NuGet dependencies. Extensions add logging, Polly, OpenTelemetry, persistence, and the rest when you want them.

It is not a product UI. It is an embeddable engine for pipelines and sagas.

## Two philosophies, both valid

Elsa optimizes for **expressing workflows as data and graphs**. That unlocks designers, versioning, and operational patterns that fit "workflow" in the enterprise sense.

WorkflowForge optimizes for **expressing workflows as code**. That fits tight loops inside services, testable steps, and teams that live in the IDE.

Neither goal is wrong. They pull architecture in different directions.

## Comparison table

| Dimension | Elsa Workflows 3.x | WorkflowForge 2.1.1 |
|-----------|-------------------|---------------------|
| **Primary model** | Activities, variables, workflow definitions | Fluent operations, foundry properties, middleware |
| **Visual designer** | Yes (Elsa Studio) | No (code first by design) |
| **Core dependencies** | Heavier stack (hosted services, packages) | Zero in the core package |
| **Persistence** | First class providers, long running workflows | Pluggable extensions; you choose depth |
| **Signals, bookmarks, human tasks** | Strong fit out of the box | You build or integrate when you need them |
| **Compensation / saga style** | Achievable with modeling and custom activities | First class hooks (`RestoreAsync`, reverse walk) |
| **Learning curve** | Moderate: concepts map to BPM style thinking | Moderate if you insist on saga discipline everywhere |
| **Community and ecosystem** | Large, examples, integrations | Smaller, library focused |
| **Honest drawback** | More moving parts to host and tune | No designer, less "workflow server" narrative |
| **Honest strength** | End to end workflow platform story | Lightweight embed, predictable performance posture |

Stars and download counts shift over time. Elsa routinely leads on visibility. WorkflowForge is smaller by design and by age. Judge them on fit, not leaderboard points.

## The same greeting, twice

Below is essentially the Elsa console sample from the official Hello World guide: a `Sequence` of `WriteLine` activities, DI with `AddElsa`, execution through `IWorkflowRunner`.

```csharp
using Elsa.Extensions;
using Elsa.Workflows;
using Elsa.Workflows.Activities;
using Microsoft.Extensions.DependencyInjection;

var services = new ServiceCollection();
services.AddElsa();
var serviceProvider = services.BuildServiceProvider();

var workflow = new Sequence
{
    Activities =
    {
        new WriteLine("Hello World!"),
        new WriteLine("We can do more than a one-liner!")
    }
};

var workflowRunner = serviceProvider.GetRequiredService<IWorkflowRunner>();
await workflowRunner.RunAsync(workflow);
```

Here is the same idea in WorkflowForge: two operations, shared logger on the foundry, `WorkflowForge.CreateSmith()`, then `ForgeAsync`.

```csharp
using WorkflowForge;

var workflow = WorkflowForge.CreateWorkflow("HelloSequence")
    .AddOperation("FirstLine", async (foundry, ct) =>
    {
        foundry.Logger.LogInformation("Hello World!");
        await Task.CompletedTask;
    })
    .AddOperation("SecondLine", async (foundry, ct) =>
    {
        foundry.Logger.LogInformation("We can do more than a one-liner!");
        await Task.CompletedTask;
    })
    .Build();

using var smith = WorkflowForge.CreateSmith();
await smith.ForgeAsync(workflow);
```

Elsa's snippet shows how tightly it integrates with a service provider. WorkflowForge stays minimal until you pass an `IServiceProvider` into a foundry for richer apps. Same logical flow. Different substrate.

## Where Elsa pulls ahead

If you need a **visual authoring experience** or non developers adjusting branches, Elsa is in its element. Persistence and **resume after restart** are part of the story people expect when they say "workflow engine," and Elsa invests there.

Activities like HTTP endpoints, timers, and integration building blocks save time when your definition is declarative **and** operational concerns live in Elsa shaped packages. Signals and bookmarks matter when work must pause until the outside world calls back.

I would not pretend WorkflowForge replaces that entire surface out of the box. You can bolt persistence and HTTP yourself, but Elsa bundles a coherent worldview for it.

## Where WorkflowForge pulls ahead for my scenarios

Inside a microservice boundary, when the graph is modest and **developers own every branch**, code first wins me maintainability and diff reviews without exporting JSON.

Compensation is explicit: completed steps unwind in reverse when something throws, which maps cleanly to saga style rollback in the samples I publish. Extensions stay optional so a security review sees a thin core footprint.

I publish BenchmarkDotNet work comparing WorkflowForge to Elsa (and Workflow Core). The gap is enormous in those benches, because the contenders do more per tick and allocate more context. Benchmarks do not erase Elsa's feature depth. Treat numbers as directional: if latency and allocation dominate your path, profile your own workloads.

## Practical selection guide

Pick **Elsa** when a designer matters, workflows are long lived, bookmarks and signals matter, and you accept hosting and package surface for those wins.

Pick **WorkflowForge** when you want **inline orchestration** in C#, saga style compensation without a separate choreography language, minimal core dependency baggage, or you assemble cross cutting behavior through middleware rather than authoring everything as custom activities inside another host.

Hybrid reality: many shops use Elsa where business wants visibility, and simpler internal pipelines remain plain code. That hybrid is sane.

## Testing and change review

WorkflowForge invites unit tests against operations and `FakeWorkflowFoundry`. I treat each step like any other dependency injected class where that pays off.

Elsa workflows can still be tested, often by driving activities through the host or inspecting outcomes after `RunAsync`. The setup is heavier because the runner and model carry more semantics. Neither path removes the need for integration tests once persistence and HTTP join the picture.

## Operations and versioning

Teams that export workflow JSON from a designer wrestle with review mechanics: diff noise, renaming activities, rollout of breaking changes across environments. That is a solved problem for some orgs and a chronic headache for others.

Code first definitions version like the rest of your repository. The trade is you lose the friendly canvas unless you build your own visualization. I accept that trade for internal orchestration. I would not force it on a group that already centered process design in a studio.

## Footprint and supply chain

Elsa's power shows up in packages, hosted services, and optional modules. That is normal for a platform.

WorkflowForge keeps the core dependency free by policy. Extensions pull in Serilog, Polly, OpenTelemetry, or ASP.NET pieces only when you reference those packages. Security reviews sometimes care about that split; feature teams sometimes do not.

## What I try not to do

I avoid telling teams to chase raw speed when they need Elsa's designer backed governance. I also avoid pretending a canvas is worthless when compliance or operations wants one. Respect the constraint.

Fair criticism of my library: **no studio**, smaller community, fewer off the shelf cookbooks than Elsa. If you rely on strangers on Stack Overflow for answers, Elsa wins today.

## One more sanity check before you commit

Neither library removes the boring work of idempotency, timeouts, poison messages, and observability across real infrastructure.

Elsa tends to bundle more answers for persistence and authoring. WorkflowForge pushes more of those choices to your codebase on purpose.

If neither model fits, a plain state machine library or queue driven saga might still beat a full workflow host. Engines are helpful; they are not mandatory.

---

**WorkflowForge on GitHub:** [GitHub Repository](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

Install:

```bash
dotnet add package WorkflowForge
```

Elsa installs with `dotnet add package Elsa` (plus feature packages such as HTTP when needed). Pair each install with each project's docs for your target 3.x line.

For deeper numbers from my BenchmarkDotNet runs against Elsa (and Workflow Core), see [WorkflowForge 2.0 benchmarks](/technical/.net/workflow/workflow-forge-2-performance-unleashed/).

Comments are open. If you run both engines in anger, correction and nuance are welcome. I benefit when Elsa adopters poke holes in my assumptions too.
