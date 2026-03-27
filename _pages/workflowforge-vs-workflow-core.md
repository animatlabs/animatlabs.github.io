---
permalink: /workflowforge-vs-workflow-core/
title: "WorkflowForge vs Workflow Core: Performance, Architecture, and API Comparison"
excerpt: >-
  A detailed comparison of WorkflowForge and Workflow Core for .NET workflow automation, covering benchmarks, architecture, maintenance status, and migration guidance.
author_profile: true
author: animat089
sitemap: true
toc: true
toc_label: "Comparison"
last_modified_at: 2026-03-26
faq:
  - q: "Is Workflow Core still maintained?"
    a: "Yes. Workflow Core releases less frequently than WorkflowForge, but v3.17.0 shipped October 2025 with .NET 8 support, EF Core 9, RabbitMQ v7. Repo is active: last push March 2026, 5,830+ stars, 80+ contributors."
  - q: "How much faster is WorkflowForge than Workflow Core?"
    a: "On our benchmark hardware: 11x to 303x by scenario. Sequential flows land around 26x; state machines peak near 303x."
  - q: "Can I replace Workflow Core with WorkflowForge?"
    a: "Often, yes, for similar orchestration needs. You rewrite definitions to WorkflowForge's fluent API; your step logic usually carries over. WorkflowForge adds built-in compensation; Workflow Core expects you to handle rollback yourself."
---

I built WorkflowForge, so read this with that bias in mind. I've tried to be honest about where Workflow Core is the better pick.

Workflow Core was one of the first lightweight workflow engines for .NET and still ships regular updates (v3.17.0, October 2025). If you're weighing the two for a new project, or thinking about a migration, the numbers and architecture below tell the real story. Benchmark data from [BenchmarkDotNet, 50 iterations per scenario](/technical/.net/workflow/workflow-forge-2-performance-unleashed/).

## At a Glance

| Dimension | WorkflowForge | Workflow Core |
|-----------|---------------|---------------|
| **Approach** | Code-first, fluent API | Code-first, step-based |
| **Core dependencies** | Zero | Several (FluentValidation, etc.) |
| **Execution speed** | Microseconds | Milliseconds |
| **Memory baseline** | 3.49 KB | 37 KB |
| **Active maintenance** | Yes (2026) | Yes (v3.17.0, October 2025) |
| **License** | MIT | MIT |
| **Compensation/Saga** | Built-in | Not built-in |
| **Parallel execution** | Built-in | Limited |
| **DI integration** | Extension package | Built-in |
| **Current release** | v2.1.1 (2026) | v3.17.0 (October 2025) |
| **.NET version support** | .NET 6, 7, 8, 9 | .NET 8 supported in v3.17.0+ (broader range on older versions) |

## Performance Benchmarks

All numbers from BenchmarkDotNet v0.15.8, .NET 8.0.23, Intel i7-1185G7, 50 iterations.

### Execution Time

| Scenario | WorkflowForge | Workflow Core | Advantage |
|----------|---------------|---------------|-----------|
| Sequential (10 ops) | 247 us | 6,531 us | **26x** |
| Data Passing (10 ops) | 262 us | 6,737 us | **26x** |
| Conditional (10 ops) | 266 us | 8,543 us | **32x** |
| Loop (50 items) | 497 us | 35,421 us | **71x** |
| Concurrent (8 workers) | 356 us | 38,833 us | **109x** |
| Error Handling | 111 us | 1,228 us | **11x** |
| Creation Overhead | 13 us | 814 us | **63x** |
| State Machine (25 transitions) | 68 us | 20,624 us | **303x** |
| Parallel (16 ops) | 55 us | 2,437 us | **44x** |

Basic sequential workflows: 26x difference. State machines push it to 303x. The more branching and internal state a scenario needs, the wider the gap.

### Memory Allocation

| Scenario | WorkflowForge | Workflow Core | Advantage |
|----------|---------------|---------------|-----------|
| Sequential (10 ops) | 16.31 KB | 430 KB | **26x** |
| State Machine (25) | 20.92 KB | 1,106 KB | **53x** |
| Concurrent (8 workers) | 121 KB | 3,232 KB | **27x** |
| Parallel (16 ops) | 8.1 KB | 122 KB | **15x** |
| Minimal Baseline | 3.49 KB | 37 KB | **11x** |

3.49 KB baseline for WorkflowForge vs 37 KB for Workflow Core. The ratios are smaller here than with Elsa, but still 11x-53x depending on scenario.

## Architecture Differences

**WorkflowForge** has zero core dependencies; extensions are opt-in (DI, Polly, Serilog, OpenTelemetry). ILRepack internalizes bundled libraries so they can't clash with yours. Compensation per operation is built in. Hooks (`OnBeforeExecute` / `OnAfterExecute`) give you cross-cutting behaviour without a middleware pipeline.

**Workflow Core** uses step-based builders with a wide persistence story (SQL Server, MongoDB, PostgreSQL, more). Supports suspension and resumption. Middleware layer for cross-cutting concerns. No built-in compensation, so you handle rollback inside steps or build your own saga abstraction.

## API Comparison

### Defining a Workflow

**WorkflowForge:**

```csharp
var workflow = WorkflowForge.CreateWorkflow("DataPipeline")
    .AddOperations(
        new ExtractData(),
        new TransformData(),
        new LoadData()
    )
    .Build();

using var smith = WorkflowForge.CreateSmith();
await smith.ForgeAsync(workflow);
```

**Workflow Core:**

```csharp
public class DataPipelineWorkflow : IWorkflow
{
    public string Id => "DataPipeline";
    public int Version => 1;

    public void Build(IWorkflowBuilder<object> builder)
    {
        builder
            .StartWith<ExtractData>()
            .Then<TransformData>()
            .Then<LoadData>();
    }
}
```

Both use builders. WorkflowForge defines workflows inline, no class required. Workflow Core needs a class that implements `IWorkflow` and declares a version number.

### Compensation (Key Differentiator)

**WorkflowForge** (built-in):

```csharp
public class ChargePayment : CompensableOperationBase
{
    protected override async Task<object?> ForgeAsyncCore(
        object? input, IWorkflowFoundry foundry, CancellationToken ct)
    {
        // Charge the customer
    }

    protected override async Task CompensateAsyncCore(
        object? input, IWorkflowFoundry foundry, CancellationToken ct)
    {
        // Refund the customer automatically on failure
    }
}
```

**Workflow Core** (manual):

Workflow Core does not have a built-in compensation mechanism. You would need to implement try-catch logic within individual steps or build a custom compensation framework on top.

## Maintenance Status

| Aspect | WorkflowForge | Workflow Core |
|--------|---------------|---------------|
| Last NuGet release | 2026 | October 2025 (v3.17.0) |
| GitHub activity | Active (issues, PRs, releases) | Active (last push March 2026) |
| .NET 8 support | Yes | Yes (v3.17.0) |
| Documentation | Maintained site | README + wiki |

Both engines ship updates. WorkflowForge is faster; Workflow Core has more persistence providers built in.

## When to Pick Which

**WorkflowForge fits when** performance and memory matter for real: containers, tight SLAs, scale-out scenarios. You want compensation baked in instead of hand-rolling rollback in every step. New project, or a migration where the fluent API matches how your team thinks.

**Workflow Core fits when** you're already running it and replatforming doesn't justify the effort. You rely on a persistence provider or integration that Workflow Core ships today (SQL Server, Mongo, PostgreSQL, etc.).

## Resources

| Resource | WorkflowForge | Workflow Core |
|----------|---------------|---------------|
| GitHub | [animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge) | [danielgerlag/workflow-core](https://github.com/danielgerlag/workflow-core) |
| NuGet | [WorkflowForge](https://www.nuget.org/packages/WorkflowForge) | [WorkflowCore](https://www.nuget.org/packages/WorkflowCore) |
| Docs | [workflow-forge.animatlabs.com](https://workflow-forge.animatlabs.com) | [GitHub Wiki](https://github.com/danielgerlag/workflow-core/wiki) |

---

## Related Reading

- [WorkflowForge: The Complete Guide to .NET Workflow Automation](/workflowforge-guide/)
- [WorkflowForge 2.0 Benchmarks: 511x Faster Than Workflow Core and Elsa in .NET](/technical/.net/workflow/workflow-forge-2-performance-unleashed/)
- [WorkflowForge vs Elsa Workflows: .NET Workflow Engine Comparison](/workflowforge-vs-elsa/)
