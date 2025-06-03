---
title: "Introducing WorkflowForge: A Forge for Workflows"
excerpt: >-
  "After quite a bit of time working with various .NET workflow orchestration frameworks available in the market, I found myself constantly battling the same issues: heavy dependencies, complex configurations, performance bottlenecks, and steep learning curves. WorkflowForge is a modern workflow orchestration framework built with a simple philosophy: zero dependencies in the core, maximum power through optional extensions. Discover how WorkflowForge can simplify your workflow orchestration in .NET."
categories:
  - Technical
  - .NET
  - Workflow
tags:
  - .NET
  - Workflow
  - WorkflowForge
  - Dependency Injection
  - Performance Optimization
  - Software Development
  - Code Simplification
  - Best Practices
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

After quite a bit of time working with various .NET workflow orchestration frameworks available inthe market, I found myself constantly battling the same issues: heavy dependencies, complex configurations, performance bottlenecks, and steep learning curves. Each project seemed to require extensive setup just to get a simple workflow running.

That's when I decided to forge something different.

## The Problem with Existing Solutions

Don't get me wrong—these frameworks are powerful, but they often felt like using a sledgehammer to crack a nut. I needed something that could:

- ✅ **Start simple** without a maze of dependencies
- ✅ **Scale to complex scenarios** when needed  
- ✅ **Perform exceptionally** in high-throughput environments
- ✅ **Feel intuitive** to .NET developers

## Meet WorkflowForge

WorkflowForge is a modern workflow orchestration framework built with a simple philosophy: **zero dependencies in the core, maximum power through optional extensions**.

### Quick Start - Two Approaches

WorkflowForge gives you flexibility in how you define operations. Choose the approach that fits your needs:

#### Approach 1: Inline Operations (Quick Prototyping)

```csharp
using WorkflowForge;

var workflow = WorkflowForge.CreateWorkflow()
    .WithName("ProcessOrder")
    .AddOperation("ValidateOrder", async (order, foundry, ct) => 
    {
        foundry.Logger.LogInformation("Validating order {OrderId}", order.Id);
        // Your validation logic here
        return order;
    })
    .AddOperation("ProcessPayment", async (order, foundry, ct) => 
    {
        foundry.Logger.LogInformation("Processing payment for {OrderId}", order.Id);
        // Payment processing logic
        return order;
    })
    .Build();

using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
using var smith = WorkflowForge.CreateSmith();

await smith.ForgeAsync(workflow, order, foundry);
```

#### Approach 2: Dependency Injection (Recommended for Applications)

```csharp
// Register your operations with DI
services.AddScoped<ValidateOrderOperation>();
services.AddScoped<ProcessPaymentOperation>();

// Build workflow using DI
var workflow = WorkflowForge.CreateWorkflow(serviceProvider)
    .WithName("ProcessOrder")
    .AddOperation<ValidateOrderOperation>()    // Clean and testable
    .AddOperation<ProcessPaymentOperation>()   // Supports DI out of the box
    .Build();

using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
using var smith = WorkflowForge.CreateSmith();

await smith.ForgeAsync(workflow, order, foundry);
```

### Class-Based Operations with Built-in Compensation

Here's how you implement the operations as classes for the DI approach:

```csharp
public class ValidateOrderOperation : IWorkflowOperation
{
    private readonly IValidator<Order> _validator;

    public ValidateOrderOperation(IValidator<Order> validator)
    {
        _validator = validator;
    }

    public string Name => "ValidateOrder";
    public bool SupportsRestore => false; // Validation doesn't need rollback

    public async Task<object?> ForgeAsync(object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var order = (Order)inputData!;
        foundry.Logger.LogInformation("Validating order {OrderId}", order.Id);
        
        var isValid = await _validator.ValidateAsync(order, cancellationToken);
        if (!isValid) throw new InvalidOperationException("Order validation failed");
        
        return order;
    }

    public Task RestoreAsync(object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
        => Task.CompletedTask; // No restoration needed
}

public class ProcessPaymentOperation : IWorkflowOperation
{
    private readonly IPaymentService _paymentService;

    public ProcessPaymentOperation(IPaymentService paymentService)
    {
        _paymentService = paymentService;
    }

    public string Name => "ProcessPayment";
    public bool SupportsRestore => true; // Automatic compensation!

    public async Task<object?> ForgeAsync(object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var order = (Order)inputData!;
        foundry.Logger.LogInformation("Processing payment for order {OrderId}", order.Id);
        
        var paymentResult = await _paymentService.ProcessAsync(order, cancellationToken);
        foundry.SetProperty("TransactionId", paymentResult.TransactionId);
        
        return order;
    }

    public async Task RestoreAsync(object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var transactionId = foundry.GetProperty<string>("TransactionId");
        if (!string.IsNullOrEmpty(transactionId))
        {
            await _paymentService.RefundAsync(transactionId, cancellationToken);
        }
    }
}
```
Notice the built-in **compensation pattern**? When `SupportsRestore = true`, WorkflowForge automatically calls `RestoreAsync` on completed operations if something goes wrong downstream. No manual saga orchestration needed - just implement the rollback logic and WorkflowForge handles the rest!

## Performance That Matters

Here's where WorkflowForge really shines. We've obsessed over performance:

- **🚀 ~15x better concurrency scaling** compared to sequential execution
- **⚡ Sub-20 microsecond operations** for simple workflows
- **🧠 Minimal memory allocation** - operations use <1KB memory
- **📦 Tiny footprint** - core library is just ~50KB with zero dependencies

*All claims backed by [comprehensive benchmarks](src/benchmarks/WorkflowForge.Benchmarks/BenchmarkDotNet.Artifacts/results/) included in the repo.*

## Rich Extension Ecosystem

The beauty of WorkflowForge is that complexity is optional. Start with the dependency-free core, then add professional features as needed:

```csharp
// Add what you need, when you need it
var foundry = WorkflowForge.CreateFoundry("OrderProcessing")
    .UseSerilog(Log.Logger)                    // Rich structured logging
    .UsePollyResilience()                      // Retry, circuit breaker, timeouts
    .EnablePerformanceMonitoring()             // Real-time metrics
    .EnableHealthChecks()                      // System diagnostics  
    .EnableOpenTelemetry("OrderService", "1.0.0"); // Distributed tracing
```

Extensions available:
- **Logging**: Serilog integration with rich context
- **Resilience**: Polly integration for advanced retry patterns
- **Observability**: Performance monitoring, health checks, OpenTelemetry
- **More coming**: Authentication, validation, event sourcing

## The Industrial Metaphor

WorkflowForge uses an intuitive industrial metaphor that makes workflows feel natural:

- **🏭 Foundries** - Execution environments where work gets done
- **⚒️ Smiths** - Skilled craftsmen who manage foundries and forge workflows  
- **🔧 Operations** - Individual tasks performed in the foundry
- **🏗️ Workflows** - The blueprints that define what gets built

## Try It Today

Ready to forge better workflows?

**🔗 Repository**: [github.com/animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge)

**📦 Installation**:
```bash
dotnet add package WorkflowForge
```

**🎯 Explore Examples**:
- [Getting Started Guide](docs/getting-started.md)
- [Interactive Samples](src/samples/WorkflowForge.Samples.BasicConsole/) - 19 runnable examples
- [Operation Creation Patterns](src/samples/WorkflowForge.Samples.BasicConsole/Samples/OperationCreationPatternsSample.cs) - All the ways to create operations (inline, DI, factories, etc.)
- [Performance Benchmarks](src/benchmarks/WorkflowForge.Benchmarks/) - See the numbers yourself

**📚 Documentation**: [Complete documentation](docs/) with step-by-step tutorials

## What's Next?

WorkflowForge is just getting started. On the roadmap:
- **NuGet packages** - Official packages coming to NuGet repository for easy installation
- Community feedback and improvements
- Additional extension packages based on user needs

## Join the Forge

Whether you're building simple automation or complex business processes, WorkflowForge adapts to your needs without imposing heavy dependencies or complex abstractions.

Give it a try and let me know what you think! Issues, suggestions, and contributions are welcome on [GitHub](https://github.com/animatlabs/workflow-forge).

---

*Happy forging! 🔨*

**WorkflowForge** - *A forge for workflows* 
