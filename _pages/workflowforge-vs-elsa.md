---
permalink: /workflowforge-vs-elsa/
title: "WorkflowForge vs Elsa Workflows: .NET Workflow Engine Comparison"
excerpt: >-
  A head-to-head comparison of WorkflowForge and Elsa Workflows covering performance benchmarks, architecture, API design, and when to pick which .NET workflow engine.
author_profile: true
author: animat089
sitemap: true
toc: true
toc_label: "Comparison"
last_modified_at: 2026-03-26
faq:
  - q: "Is WorkflowForge faster than Elsa Workflows?"
    a: "Yes. Same BenchmarkDotNet suite we publish: 64x to 511x by scenario; state machines are the worst case for Elsa. We're in microseconds; Elsa sits in milliseconds on comparable hardware."
  - q: "Does WorkflowForge have a visual workflow designer like Elsa?"
    a: "No. Code-first only. Elsa Studio wins if analysts or PMs need to edit flows without touching C#."
  - q: "Can I migrate from Elsa to WorkflowForge?"
    a: "No auto-migrator. Treat it like a rewrite: map Elsa activities to WorkflowForge operations; business logic in each step usually moves over. WorkflowForge gives you compensation as a first-class concept."
---

I built WorkflowForge, so take this comparison with that bias. I've tried to be fair about where Elsa wins.

Two very different bets. WorkflowForge keeps the engine thin and fast: code-only, zero dependencies, compensation baked in. Elsa gives you a designer, built-in persistence, and a broader activity ecosystem. Which trade-off hurts less depends on your team.

All benchmark numbers come from [BenchmarkDotNet, 50 iterations per scenario](/technical/.net/workflow/workflow-forge-2-performance-unleashed/).

## At a Glance

| Dimension | WorkflowForge | Elsa Workflows |
|-----------|---------------|----------------|
| **Approach** | Code-first, C# API | Visual designer + code |
| **Core dependencies** | Zero | Multiple (EF Core, MediatR, etc.) |
| **Execution speed** | Microseconds | Milliseconds |
| **Memory baseline** | 3.49 KB | 1,032 KB |
| **Package count** | 13 (modular extensions) | Monolithic + modules |
| **License** | MIT | MIT |
| **Compensation/Saga** | Built-in | Via custom activities |
| **Visual designer** | No | Yes (Elsa Studio) |
| **Workflow persistence** | Extension package | Built-in |
| **Target user** | .NET developers | Developers + business users |
| **Current release** | v2.1.1 (2026) | v3.6.0 (March 2026) |

## Performance Benchmarks

All numbers from BenchmarkDotNet v0.15.8, .NET 8.0.23, Intel i7-1185G7, 50 iterations.

### Execution Time

| Scenario | WorkflowForge | Elsa | Advantage |
|----------|---------------|------|-----------|
| Sequential (10 ops) | 247 us | 17,617 us | **71x** |
| Data Passing (10 ops) | 262 us | 18,222 us | **70x** |
| Conditional (10 ops) | 266 us | 21,333 us | **80x** |
| Loop (50 items) | 497 us | 64,171 us | **129x** |
| Concurrent (8 workers) | 356 us | 94,018 us | **264x** |
| Error Handling | 111 us | 7,150 us | **64x** |
| Creation Overhead | 13 us | 2,107 us | **162x** |
| State Machine (25 transitions) | 68 us | 36,695 us | **511x** |
| Parallel (16 ops) | 55 us | 20,891 us | **380x** |

Sequential stuff is 70x. State machines hit 511x. The more branching and internal bookkeeping a scenario demands, the wider the gap gets.

### Memory Allocation

| Scenario | WorkflowForge | Elsa | Advantage |
|----------|---------------|------|-----------|
| Sequential (10 ops) | 16.31 KB | 2,984 KB | **183x** |
| State Machine (25) | 20.92 KB | 5,949 KB | **284x** |
| Concurrent (8 workers) | 121 KB | 19,139 KB | **158x** |
| Parallel (16 ops) | 8.1 KB | 4,647 KB | **573x** |
| Minimal Baseline | 3.49 KB | 1,032 KB | **296x** |

WorkflowForge stays in kilobytes. Elsa lands in megabytes. Parallel (16 ops) is the extreme case: 8.1 KB vs 4,647 KB.

## Architecture Differences

**WorkflowForge** has zero core dependencies. The main NuGet package pulls in nothing. DI, Polly, Serilog, OpenTelemetry are separate extension packages you add when you need them. ILRepack internalizes anything that is bundled, so no version conflicts with your project. Compensation is built in: every operation can declare its own rollback.

**Elsa** is a heavier stack: EF Core, MediatR, UI packages. That weight buys you persistence (SQL, Mongo, etc.), versioning, and Elsa Studio, a visual designer where non-developers can build and edit workflows. The activity model is geared toward long-running, human-in-the-loop processes.

## API Comparison

### Defining a Workflow

**WorkflowForge:**

```csharp
var workflow = WorkflowForge.CreateWorkflow("OrderProcess")
    .AddOperations(
        new ValidateOrder(),
        new ChargePayment(),
        new ShipOrder()
    )
    .Build();

using var smith = WorkflowForge.CreateSmith();
await smith.ForgeAsync(workflow);
```

**Elsa:**

```csharp
public class OrderWorkflow : WorkflowBase
{
    protected override void Build(IWorkflowBuilder builder)
    {
        builder
            .StartWith<ValidateOrder>()
            .Then<ChargePayment>()
            .Then<ShipOrder>();
    }
}
```

WorkflowForge builds inline, no class per workflow. Elsa needs a class that inherits `WorkflowBase`, which is how its designer and persistence wire things up.

## When to Pick Which

**WorkflowForge fits when** latency and memory matter for real (containers, tight SLAs, high-throughput pipelines). Your team writes C# and nobody needs a drag-and-drop designer. You want compensation baked in rather than bolted on.

**Elsa fits when** non-developers need to change flows. Elsa Studio is the reason to pick it. Persistence and versioning ship in the box. Long-running, human-in-the-loop processes are the primary use case. The broader activity catalogue saves you writing custom code.

## Resources

| Resource | WorkflowForge | Elsa |
|----------|---------------|------|
| GitHub | [animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge) | [elsa-workflows/elsa-core](https://github.com/elsa-workflows/elsa-core) |
| NuGet | [WorkflowForge](https://www.nuget.org/packages/WorkflowForge) | [Elsa](https://www.nuget.org/packages/Elsa) |
| Docs | [workflow-forge.animatlabs.com](https://workflow-forge.animatlabs.com) | [v3.elsa-workflows.io](https://v3.elsa-workflows.io) |

---

## Related Reading

- [WorkflowForge: The Complete Guide to .NET Workflow Automation](/workflowforge-guide/)
- [WorkflowForge 2.0 Benchmarks: 511x Faster Than Workflow Core and Elsa in .NET](/technical/.net/workflow/workflow-forge-2-performance-unleashed/)
- [WorkflowForge vs Workflow Core: Performance, Architecture, and API Comparison](/workflowforge-vs-workflow-core/)
