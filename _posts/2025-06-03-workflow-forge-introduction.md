---
title: "WorkflowForge: A forge for workflows"
excerpt: >-
  "Tired of workflow frameworks that consume memory and slow down applications? WorkflowForge delivers microsecond operations with zero core dependencies, proven concurrency scaling, and a developer experience built for code, not drag-and-drop designers. Now available on NuGet with production-ready extensions."
categories:
  - Technical
  - .NET  
  - Workflow
  - Performance
tags:
  - .NET
  - Workflow
  - WorkflowForge
  - Performance
  - Zero Dependencies
  - Microservices
  - Enterprise Architecture
  - Developer Experience
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

## TL;DR: WorkflowForge in 30 Seconds

**Performance**: Verified 4-56 μs operations with 15x concurrency scaling  
**Zero Dependencies**: Core package has 0 external dependencies, ~50KB footprint  
**Developer Focused**: Fluent API with industrial metaphor that maps to real workflows  
**Production Ready**: Available on NuGet with 6 specialized extension packages  
**Built-in Compensation**: Automatic saga pattern without manual orchestration  

```bash
dotnet add package WorkflowForge
```

No configuration files. No heavy containers. Just workflows that work.

---

## The Problem with Existing Solutions

After working with various .NET workflow frameworks, the same issues kept surfacing:

- **Performance bottlenecks** - Operations taking milliseconds when they should take microseconds
- **Dependency bloat** - Core packages requiring 20+ dependencies for basic functionality
- **Configuration complexity** - Hours of setup for simple workflow scenarios
- **Memory inefficiency** - Frameworks consuming megabytes for kilobytes of logic
- **Poor abstractions** - APIs designed for visual designers, not developers

Most enterprise workflow solutions optimize for drag-and-drop editors and XML configurations rather than code quality and runtime performance.

## WorkflowForge: Built for Developers

WorkflowForge takes a different approach with a developer-first philosophy:

- **Start minimal, scale incrementally** - Zero dependencies in core, optional extensions when needed
- **Performance verified** - All claims backed by BenchmarkDotNet results
- **Intuitive design** - Industrial metaphor that maps to how workflows actually operate
- **Production tested** - Built-in compensation, observability, and resilience patterns

### The Industrial Metaphor

Instead of abstract "engines" and "executors", WorkflowForge uses intuitive industrial concepts:

- **The Forge** - Factory that creates workflows and components
- **Foundries** - Execution environments where operations are performed
- **Smiths** - Orchestration engines managing workflow execution
- **Operations** - Individual tasks that transform data

---

## Verified Performance Characteristics

Every performance claim is backed by BenchmarkDotNet results with no marketing embellishment.

| **Metric** | **Measured Result** | **Context** |
|------------|-------------------|-------------|
| **Operation Execution** | **4-56 μs** | Per operation overhead |
| **Foundry Creation** | **5-15 μs** | Environment setup time |
| **Concurrency Scaling** | **15x improvement** | 16 workflows: 301ms concurrent vs 4,540ms sequential |
| **Memory Footprint** | **<2KB per foundry** | Runtime allocation |
| **Package Size** | **~50KB core** | Zero external dependencies |

[Complete Benchmark Results](https://github.com/animatlabs/workflow-forge/tree/main/src/benchmarks)

---

## Two Development Approaches

### Rapid Prototyping

Perfect for scripts, proof-of-concepts, or simple automation:

```csharp
using WorkflowForge;

var workflow = WorkflowForge.CreateWorkflow()
    .WithName("ProcessOrder")
    .AddOperation("ValidateOrder", async (order, foundry, ct) => 
    {
        foundry.Logger.LogInformation("Validating order {OrderId}", order.Id);
        return await ValidateOrderAsync(order, ct);
    })
    .AddOperation("ProcessPayment", async (order, foundry, ct) => 
    {
        foundry.Logger.LogInformation("Processing payment for order {OrderId}", order.Id);  
        return await ProcessPaymentAsync(order, ct);
    })
    .Build();

using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
using var smith = WorkflowForge.CreateSmith();

await smith.ForgeAsync(workflow, order, foundry);
```

### Enterprise-Grade Production

Dependency injection with proper separation of concerns:

```csharp
// Registration
services.AddScoped<ValidateOrderOperation>();
services.AddScoped<ProcessPaymentOperation>();

// Workflow Definition  
var workflow = WorkflowForge.CreateWorkflow(serviceProvider)
    .WithName("ProcessOrder")
    .AddOperation<ValidateOrderOperation>()
    .AddOperation<ProcessPaymentOperation>()
    .Build();

// Execution
using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
using var smith = WorkflowForge.CreateSmith();

await smith.ForgeAsync(workflow, order, foundry);
```

---

## Automatic Compensation: Sagas Simplified

Built-in compensation without complex orchestration:

```csharp
public class ProcessPaymentOperation : IWorkflowOperation
{
    public string Name => "ProcessPayment";
    public bool SupportsRestore => true; // Enables automatic compensation

    public async Task<object?> ForgeAsync(object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var order = (Order)inputData!;
        var paymentResult = await _paymentService.ProcessAsync(order, cancellationToken);
        
        // Store compensation data
        foundry.SetProperty("TransactionId", paymentResult.TransactionId);
        return order;
    }

    public async Task RestoreAsync(object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        // Called automatically if downstream operations fail
        var transactionId = foundry.GetProperty<string>("TransactionId");
        if (!string.IsNullOrEmpty(transactionId))
        {
            await _paymentService.RefundAsync(transactionId, cancellationToken);
        }
    }
}
```

When downstream operations fail, WorkflowForge automatically calls `RestoreAsync` on completed operations in reverse order. No saga coordinators, state machines, or XML configuration required.

---

## Production Extensions

Philosophy: Start with zero dependencies, add capabilities as requirements grow.

### Available on NuGet

```bash
# Core (zero dependencies)
dotnet add package WorkflowForge

# Optional extensions
dotnet add package WorkflowForge.Extensions.Logging.Serilog
dotnet add package WorkflowForge.Extensions.Resilience.Polly  
dotnet add package WorkflowForge.Extensions.Observability.Performance
dotnet add package WorkflowForge.Extensions.Observability.HealthChecks
dotnet add package WorkflowForge.Extensions.Observability.OpenTelemetry
```

### Fluent Configuration

```csharp
var foundry = WorkflowForge.CreateFoundry("OrderProcessing")
    .UseSerilog(Log.Logger)                    // Structured logging
    .UsePollyResilience()                      // Retry, circuit breaker, timeouts  
    .EnablePerformanceMonitoring()             // Real-time metrics
    .EnableHealthChecks()                      // System diagnostics
    .EnableOpenTelemetry("OrderService", "1.0.0"); // Distributed tracing
```

**Extension Packages:**

| **Extension** | **Purpose** | **Package** |
|---------------|-------------|-------------|
| **Serilog Logging** | Structured logging with context | `WorkflowForge.Extensions.Logging.Serilog` |
| **Polly Resilience** | Circuit breakers, retries, timeouts | `WorkflowForge.Extensions.Resilience.Polly` |
| **Performance Monitoring** | Metrics, profiling, statistics | `WorkflowForge.Extensions.Observability.Performance` |
| **Health Checks** | Application health monitoring | `WorkflowForge.Extensions.Observability.HealthChecks` |
| **OpenTelemetry** | Distributed tracing and observability | `WorkflowForge.Extensions.Observability.OpenTelemetry` |

---

## Learn Through Examples

The most effective way to understand WorkflowForge is running the progressive examples:

```bash
git clone https://github.com/animatlabs/workflow-forge.git
cd workflow-forge/src/samples/WorkflowForge.Samples.BasicConsole
dotnet run
```

**Learning Path:**

- **Samples 1-4**: Basic workflows and data flow patterns
- **Samples 5-8**: Control flow and error handling strategies
- **Samples 9-12**: Configuration management and middleware
- **Samples 13-17**: Extension integration and observability
- **Sample 18**: Comprehensive production scenario

Each example builds progressively with clear explanations and real-time output.

---

## Production Readiness

### Zero Dependencies Core
- No dependency conflicts with existing applications
- Minimal security attack surface
- Simplified auditing and compliance processes

### Verified Performance
- All performance claims backed by reproducible benchmarks
- Memory and CPU optimized for high-throughput scenarios
- Concurrent execution patterns validated under load

### Built-in Best Practices
- Automatic compensation using saga pattern
- Structured logging integration points
- Health checks and observability hooks
- Graceful error handling and recovery

### Developer Experience
- Fluent API designed for code completion
- Comprehensive documentation with step-by-step guides
- 18 progressive examples covering common scenarios
- Industrial metaphor that maps to real-world processes

---

## Getting Started

### Installation

```bash
dotnet add package WorkflowForge
```

### First Workflow

```csharp
using WorkflowForge;

var workflow = WorkflowForge.CreateWorkflow()
    .WithName("HelloWorld")
    .AddOperation("SayHello", async (input, foundry, ct) => 
    {
        foundry.Logger.LogInformation("Hello from WorkflowForge!");
        return "Hello World!";
    })
    .Build();

using var foundry = WorkflowForge.CreateFoundry("Demo");
using var smith = WorkflowForge.CreateSmith();

var result = await smith.ForgeAsync(workflow, null, foundry);
Console.WriteLine(result); // "Hello World!"
```

### Resources

- **[Interactive Samples](https://github.com/animatlabs/workflow-forge/tree/main/src/samples/WorkflowForge.Samples.BasicConsole)** - 18 hands-on examples
- **[Documentation](https://github.com/animatlabs/workflow-forge/tree/main/docs)** - Complete guides and API reference
- **[Performance Benchmarks](https://github.com/animatlabs/workflow-forge/tree/main/src/benchmarks)** - Detailed performance analysis
- **[Extensions Guide](https://github.com/animatlabs/workflow-forge/tree/main/docs/extensions.md)** - Production extension capabilities

---

## Project Links

**Repository**: [github.com/animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge)  
**NuGet**: [nuget.org/packages/WorkflowForge](https://www.nuget.org/packages/WorkflowForge)  
**Benchmarks**: [Performance Analysis](https://github.com/animatlabs/workflow-forge/tree/main/src/benchmarks)

WorkflowForge represents a philosophy: powerful capabilities shouldn't require complex dependencies.

```bash
dotnet add package WorkflowForge
```

**Questions or contributions?** → [Open an Issue](https://github.com/animatlabs/workflow-forge/issues)

**WorkflowForge** - *Industrial strength workflows for modern .NET*
