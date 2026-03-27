---
title: "WorkflowForge 2.0 Benchmarks: 511x Faster Than Workflow Core and Elsa in .NET"
excerpt: >-
  We benchmarked WorkflowForge 2.0 against Workflow Core and Elsa Workflows. Up to 511x faster execution and 573x less memory usage, with new extensions and a documentation site.
last_modified_at: 2026-03-26
sitemap: true
categories:
  - Technical
  - .NET  
  - Workflow
tags:
  - .NET
  - Workflow
  - WorkflowForge
  - Performance
  - Benchmarks
  - Zero Dependencies
  - Enterprise Architecture
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
faq:
  - q: "How fast is WorkflowForge compared to other .NET workflow engines?"
    a: "In our BenchmarkDotNet suite against Workflow Core and Elsa, WorkflowForge 2.0 landed between roughly 26× and 511× faster depending on the scenario—the state-machine case was the eye-watering end of that range."
  - q: "How much memory does WorkflowForge use versus Elsa and Workflow Core?"
    a: "Same story: tiny allocations on our runs (baseline ~3.5 KB vs tens to a megabyte for the others). Parallel scenarios were hundreds of times leaner—again, check the benchmark tables for your workload."
  - q: "What is new in WorkflowForge 2.0?"
    a: "More packages (13 vs 6), lifecycle hooks, bulk APIs, a `FakeWorkflowFoundry` testing package, and vendored deps so version conflicts hurt less. Details are in the post tables."
---

## The Question Everyone Asked

*"Your internal benchmarks look great, but how does WorkflowForge actually compare to other popular alternatives?"*

Fair question. Internal metrics only tell half the story. So for version 2.0, I ran head-to-head benchmarks against the two most popular workflow frameworks in .NET, with BenchmarkDotNet, 50 iterations per scenario, and full transparency on methodology.

Honestly, I was curious whether the gap would shrink once I stopped cherry-picking scenarios.

The short answer: WorkflowForge operates in microseconds while the alternatives work in milliseconds. The gap widens as complexity increases. Not even close on the heavy cases.

Let me show you the numbers.

**Full codebase and benchmarks:** [GitHub Repository](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

**Documentation:** [animatlabs.com/workflow-forge](https://animatlabs.com/workflow-forge)

---

## The Benchmarks

**Test environment:** Windows 11 (25H2), .NET 8.0.23, Intel i7-1185G7, BenchmarkDotNet v0.15.8

### Execution Time

| Scenario | WorkflowForge | Workflow Core | Elsa | Advantage |
|----------|---------------|---------------|------|-----------|
| Sequential (10 ops) | 247μs | 6,531μs | 17,617μs | **26-71x** |
| Data Passing (10 ops) | 262μs | 6,737μs | 18,222μs | **26-70x** |
| Conditional (10 ops) | 266μs | 8,543μs | 21,333μs | **32-80x** |
| Loop (50 items) | 497μs | 35,421μs | 64,171μs | **71-129x** |
| Concurrent (8 workers) | 356μs | 38,833μs | 94,018μs | **109-264x** |
| Error Handling | 111μs | 1,228μs | 7,150μs | **11-64x** |
| Creation Overhead | 13μs | 814μs | 2,107μs | **63-162x** |
| State Machine (25 transitions) | 68μs | 20,624μs | 36,695μs | **303-511x** |
| Parallel (16 ops) | 55μs | 2,437μs | 20,891μs | **44-380x** |

The pattern is clear: simple workflows show 26-71x improvement, but state machines hit **511x faster**. Complexity amplifies the gap. Once you stack branching, persistence, and compensation on top of each other, the slower engines do not just get a little worse; they allocate and schedule their way into a completely different cost class than a library that keeps the hot path thin.

### Memory Allocation

| Scenario | WorkflowForge | Workflow Core | Elsa | Advantage |
|----------|---------------|---------------|------|-----------|
| Sequential (10 ops) | 16.31KB | 430KB | 2,984KB | **26-183x** |
| State Machine (25) | 20.92KB | 1,106KB | 5,949KB | **53-284x** |
| Concurrent (8 workers) | 121KB | 3,232KB | 19,139KB | **27-158x** |
| Parallel (16 ops) | 8.1KB | 122KB | 4,647KB | **15-573x** |
| Minimal Baseline | 3.49KB | 37KB | 1,032KB | **11-296x** |

WorkflowForge stays in kilobytes. The competition allocates megabytes. Baseline overhead is just **3.49 KB**.

---

## What's New in 2.0

Beyond benchmarks, version 2.0 brings real improvements based on community feedback.

### 13 Packages (Up from 6)

| Package | What It Does |
|---------|--------------|
| **WorkflowForge** | Zero-dependency core |
| **WorkflowForge.Testing** | Unit testing with `FakeWorkflowFoundry` |
| **WorkflowForge.Extensions.DependencyInjection** | ASP.NET Core integration |
| **WorkflowForge.Extensions.Validation** | DataAnnotations validation |
| **WorkflowForge.Extensions.Audit** | Compliance trails |
| **WorkflowForge.Extensions.Logging.Serilog** | Structured logging |
| **WorkflowForge.Extensions.Resilience.Polly** | Circuit breakers, retries |
| **WorkflowForge.Extensions.Persistence.Recovery** | Resume interrupted workflows |
| **WorkflowForge.Extensions.Observability.OpenTelemetry** | Distributed tracing |

Plus 4 more for resilience, persistence, and health checks.

### Lifecycle Hooks

The most requested feature: setup and teardown without middleware.

```csharp
public class AuditedOperation : WorkflowOperationBase
{
    protected override async Task OnBeforeExecuteAsync(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        foundry.SetProperty("StartTime", DateTime.UtcNow);
    }

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        return await ProcessAsync(inputData, ct);
    }

    protected override async Task OnAfterExecuteAsync(
        object? inputData, object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var duration = DateTime.UtcNow - foundry.GetProperty<DateTime>("StartTime");
        foundry.Logger.LogInformation("Completed in {Duration}ms", duration.TotalMilliseconds);
    }
}
```

### Cleaner APIs

Build workflows faster with bulk operations:

```csharp
var workflow = WorkflowForge.CreateWorkflow("BatchProcess")
    .AddOperations(
        new ValidateOperation(),
        new TransformOperation(),
        new PersistOperation()
    )
    .Build();

// Or parallel execution
var workflow = WorkflowForge.CreateWorkflow("ParallelFetch")
    .AddOperation(new InitOperation())
    .AddParallelOperations(
        new FetchFromApiA(),
        new FetchFromApiB(),
        new FetchFromApiC()
    )
    .AddOperation(new AggregateResults())
    .Build();
```

### First-Class Testing

The new `WorkflowForge.Testing` package makes unit testing trivial:

```csharp
[Fact]
public async Task Operation_ProcessesData_Successfully()
{
    var foundry = new FakeWorkflowFoundry();
    var operation = new MyOperation();
    
    var result = await operation.ForgeAsync(null, foundry, CancellationToken.None);
    
    Assert.True(foundry.ExecutedOperations.Contains("MyOperation"));
}
```

### Zero Dependency Conflicts

Extensions now internalize third-party dependencies via ILRepack. Microsoft/System packages stay external. Result: no version conflicts with your existing projects.

---

## Breaking Changes

Upgrading from 1.x? This changed:

**Event interfaces split** (Single Responsibility Principle):
- `IWorkflowEvents` → `IWorkflowLifecycleEvents`, `IOperationLifecycleEvents`, `ICompensationLifecycleEvents`

**Base class method renamed** (to support lifecycle hooks):
```csharp
// 1.x
public override async Task<object?> ForgeAsync(...)

// 2.0
protected override async Task<object?> ForgeAsyncCore(...)
```

**ISystemTimeProvider** now uses DI instead of static instance.

---

## Get Started

```bash
dotnet add package WorkflowForge
dotnet add package WorkflowForge.Testing  # Optional
```

### Hello World

```csharp
using WorkflowForge;

var workflow = WorkflowForge.CreateWorkflow("HelloWorld")
    .AddOperation("Greet", async (foundry, ct) => {
        foundry.Logger.LogInformation("Hello from WorkflowForge 2.0!");
    })
    .Build();

using var smith = WorkflowForge.CreateSmith();
await smith.ForgeAsync(workflow);
```

---

## Resources

| What | Where |
|------|-------|
| Documentation | [animatlabs.com/workflow-forge](https://animatlabs.com/workflow-forge) |
| GitHub | [github.com/animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge) |
| NuGet | [nuget.org/packages/WorkflowForge](https://www.nuget.org/packages/WorkflowForge) |
| Benchmarks | [Full Methodology](https://animatlabs.com/workflow-forge/performance/competitive-analysis/) |
| Samples | [33 Examples](https://github.com/animatlabs/workflow-forge/tree/main/src/samples) |

---

## The Bottom Line

WorkflowForge 2.0 isn't just about claiming performance. It's about proving it. The benchmarks are reproducible, the methodology is documented, and the code is open source.

If workflow performance matters for your .NET application (high-throughput processing, real-time orchestration, microservice coordination), run your own benchmarks. The numbers speak for themselves. I think that's the only way to trust a claim this loud.

**Questions?** → [Open an Issue](https://github.com/animatlabs/workflow-forge/issues)

Happy forging.

{% include cta-workflowforge.html %}

---

## More on This Topic

- [WorkflowForge introduction](/technical/.net/workflow/workflow-forge-introduction/)
- [WorkflowForge with Coravel](/technical/.net/workflow/workflowforge-coravel-scheduled-workflows/)
- [Shipping a quality .NET OSS release](/technical/.net/open-source/shipping-quality-dotnet-oss-release/)
- [WorkflowForge vs Elsa](/workflowforge-vs-elsa/)
- [WorkflowForge vs Workflow Core](/workflowforge-vs-workflow-core/)
