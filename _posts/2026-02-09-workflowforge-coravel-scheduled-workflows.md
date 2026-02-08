---
title: "Scheduled Workflows in .NET: WorkflowForge Meets Coravel"
excerpt: >-
  "Coravel handles when to run. WorkflowForge handles what to run. Together they create lightweight scheduled workflows with automatic compensation -- no Hangfire required."
categories:
  - Technical
  - .NET  
  - Workflow
tags:
  - .NET
  - Workflow
  - WorkflowForge
  - Coravel
  - Job Scheduling
  - Background Jobs
  - Compensation
  - Saga Pattern
author: animat089
last_modified_at: 2026-02-09
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Problem: Scheduled Workflows Are Overcomplicated

You need to run a multi-step business process on a schedule -- nightly order reconciliation, hourly data syncs, daily report generation. The typical approach? Hangfire for scheduling, custom code for the workflow logic, and manual error handling for each step. That's three concerns tangled together, plus a Redis or SQL dependency just for scheduling.

What if you could have:

- **Zero external dependencies** for scheduling (no Redis, no SQL)
- **Automatic compensation** if any step fails (saga pattern, built-in)
- **Microsecond execution** instead of milliseconds
- **Clean separation** between "when to run" and "what to run"

That's exactly what happens when you pair **Coravel** (scheduling) with **WorkflowForge** (workflow orchestration).

I've built a complete runnable sample that demonstrates this pattern end-to-end:

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WorkflowForge){: .btn .btn--primary}

---

## The Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  .NET Console Host                      │
├─────────────────────────────────────────────────────────┤
│  Coravel Scheduler                                      │
│  └─ "Run ReconciliationJob every N seconds"             │
│       │                                                 │
│       ▼                                                 │
│  WorkflowForge Workflow                                 │
│  └─ Step 1: Fetch unprocessed orders                    │
│  └─ Step 2: Process payments    ← (refund on failure)   │
│  └─ Step 3: Reserve inventory   ← (release on failure)  │
│  └─ Step 4: [MaybeFail]         ← toggle to demo saga   │
│  └─ Step 5: Send confirmations                          │
└─────────────────────────────────────────────────────────┘
```

Coravel decides **when** to run. WorkflowForge handles **what** to run -- including automatic rollback of completed steps when something fails downstream.

---

## Solution Layout

The sample splits concerns cleanly across two projects:

```
WorkflowForge/
├── AnimatLabs.WorkflowForge.Workflows.Sample/        # Business logic
│   └── NightlyReconciliation/
│       ├── Workflow.cs                                # Workflow builder
│       ├── ReconciliationKeys.cs                      # Shared state keys
│       ├── Models/
│       │   ├── Order.cs
│       │   └── PaymentTransaction.cs
│       ├── Operations/
│       │   ├── FetchUnprocessedOrdersOperation.cs
│       │   ├── ProcessPaymentsOperation.cs
│       │   ├── UpdateInventoryOperation.cs
│       │   ├── MaybeFailOperation.cs
│       │   └── SendConfirmationEmailsOperation.cs
│       └── Services/                                  # Interfaces only
│           ├── IOrderRepository.cs
│           ├── IPaymentService.cs
│           ├── IInventoryService.cs
│           └── IEmailSender.cs
├── AnimatLabs.WorkflowForge.CoravelScheduledWorkflows/  # Host + fakes
│   ├── Program.cs
│   ├── appsettings.json
│   ├── Jobs/ReconciliationJob.cs
│   ├── Options/ReconciliationJobOptions.cs
│   └── Services/
│       ├── InMemoryOrderRepository.cs
│       ├── FakePaymentService.cs
│       ├── FakeInventoryService.cs
│       └── FakeEmailSender.cs
└── AnimatLabs.WorkflowForge.sln
```

The **workflows project** contains only business logic -- operations, models, and service interfaces. It has a single dependency: `WorkflowForge`.

The **host project** wires Coravel scheduling, provides fake service implementations for demo purposes, and depends on `Coravel`, `WorkflowForge`, and `Microsoft.Extensions.Hosting`.

---

## Setup: Two NuGet Packages

```bash
dotnet add package Coravel
dotnet add package WorkflowForge
```

No database migrations. No connection strings for the scheduler.

---

## The Workflow Definition

The entire workflow is defined in one method -- chain the operations and build:

```csharp
using AnimatLabs.WorkflowForge.Workflows.Sample.NightlyReconciliation.Operations;
using AnimatLabs.WorkflowForge.Workflows.Sample.NightlyReconciliation.Services;
using WorkflowForge.Abstractions;
using WF = WorkflowForge.WorkflowForge;

namespace AnimatLabs.WorkflowForge.Workflows.Sample.NightlyReconciliation;

public static class NightlyReconciliationWorkflow
{
    public static IWorkflow Build(
        IOrderRepository orderRepository,
        IPaymentService paymentService,
        IInventoryService inventoryService,
        IEmailSender emailSender)
    {
        return WF
            .CreateWorkflow("NightlyReconciliation")
            .AddOperation(new FetchUnprocessedOrdersOperation(orderRepository))
            .AddOperation(new ProcessPaymentsOperation(paymentService))
            .AddOperation(new UpdateInventoryOperation(inventoryService))
            .AddOperation(new MaybeFailOperation())
            .AddOperation(new SendConfirmationEmailsOperation(emailSender))
            .Build();
    }
}
```

Dependencies are injected into operations via constructors -- clean, testable, no service locator.

---

## The Models

Simple domain objects that flow through the workflow:

```csharp
public sealed class Order
{
    public required string Id { get; init; } = null!;
    public decimal Amount { get; init; }
    public required IReadOnlyList<string> Items { get; init; } = null!;
}

public sealed class PaymentTransaction
{
    public required string TransactionId { get; init; } = null!;
    public required string OrderId { get; init; } = null!;
    public decimal Amount { get; init; }
}
```

## Shared State Keys

Operations communicate through the foundry's property bag. The keys are simple constants -- no magic strings scattered across the codebase:

```csharp
public static class ReconciliationKeys
{
    public const string BatchSize = "recon.batch_size";
    public const string DemoFailure = "recon.demo_failure";
    public const string Orders = "recon.orders";
    public const string PaymentTransactions = "recon.payment_transactions";
}
```

---

## Operations with Automatic Compensation

This is where WorkflowForge shines. Each operation extends `WorkflowOperationBase` and can implement both **execution** (`ForgeAsyncCore`) and **compensation** (`RestoreAsync`). If a downstream step fails, completed operations are automatically rolled back in reverse order.

### Fetching Orders

The first step loads unprocessed orders and stores them in the foundry for downstream operations:

```csharp
public sealed class FetchUnprocessedOrdersOperation : WorkflowOperationBase
{
    private readonly IOrderRepository _orderRepository;

    public FetchUnprocessedOrdersOperation(IOrderRepository orderRepository)
    {
        _orderRepository = orderRepository;
    }

    public override string Name => "FetchUnprocessedOrders";
    public override bool SupportsRestore => true;

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var batchSize = foundry.GetPropertyOrDefault<int>(ReconciliationKeys.BatchSize, 3);
        foundry.Logger.LogInformation("Fetching up to {BatchSize} order(s)", batchSize);

        var orders = await _orderRepository
            .GetUnprocessedOrdersAsync(batchSize, cancellationToken)
            .ConfigureAwait(false);

        foundry.SetProperty(ReconciliationKeys.Orders, orders);
        foundry.Logger.LogInformation("Fetched {Count} order(s)", orders.Count);
        return inputData;
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        foundry.Properties.TryRemove(ReconciliationKeys.Orders, out _);
        return Task.CompletedTask;
    }
}
```

### Processing Payments (with Refund Compensation)

This is the core compensation pattern. `ForgeAsyncCore` charges each order and stores the transactions. `RestoreAsync` refunds them if anything fails downstream:

```csharp
public sealed class ProcessPaymentsOperation : WorkflowOperationBase
{
    private readonly IPaymentService _paymentService;

    public ProcessPaymentsOperation(IPaymentService paymentService)
    {
        _paymentService = paymentService;
    }

    public override string Name => "ProcessPayments";
    public override bool SupportsRestore => true;

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var orders = foundry.GetPropertyOrDefault<IReadOnlyList<Order>>(ReconciliationKeys.Orders)
            ?? Array.Empty<Order>();

        foundry.Logger.LogInformation("Processing payments for {Count} order(s)", orders.Count);

        var transactions = new List<PaymentTransaction>(orders.Count);
        foreach (var order in orders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var tx = await _paymentService.ChargeAsync(order, cancellationToken).ConfigureAwait(false);
            transactions.Add(tx);
        }

        foundry.SetProperty(ReconciliationKeys.PaymentTransactions, transactions);
        foundry.Logger.LogInformation("Processed {Count} payment(s)", transactions.Count);
        return inputData;
    }

    public override async Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var transactions = foundry.GetPropertyOrDefault<IReadOnlyList<PaymentTransaction>>(
            ReconciliationKeys.PaymentTransactions) ?? Array.Empty<PaymentTransaction>();

        foundry.Logger.LogWarning("Compensating payments: refunding {Count} transaction(s)",
            transactions.Count);

        foreach (var tx in transactions)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _paymentService.RefundAsync(tx, cancellationToken).ConfigureAwait(false);
        }
    }
}
```

### Updating Inventory (with Release Compensation)

Same pattern -- reserve on execute, release on compensate:

```csharp
public sealed class UpdateInventoryOperation : WorkflowOperationBase
{
    private readonly IInventoryService _inventoryService;

    public UpdateInventoryOperation(IInventoryService inventoryService)
    {
        _inventoryService = inventoryService;
    }

    public override string Name => "UpdateInventory";
    public override bool SupportsRestore => true;

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var orders = foundry.GetPropertyOrDefault<IReadOnlyList<Order>>(ReconciliationKeys.Orders)
            ?? Array.Empty<Order>();

        foundry.Logger.LogInformation("Updating inventory for {Count} order(s)", orders.Count);

        foreach (var order in orders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _inventoryService.ReserveAsync(order.Id, order.Items, cancellationToken)
                .ConfigureAwait(false);
        }

        return inputData;
    }

    public override async Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var orders = foundry.GetPropertyOrDefault<IReadOnlyList<Order>>(ReconciliationKeys.Orders)
            ?? Array.Empty<Order>();

        foundry.Logger.LogWarning("Compensating inventory: releasing {Count} reservation(s)",
            orders.Count);

        foreach (var order in orders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _inventoryService.ReleaseAsync(order.Id, order.Items, cancellationToken)
                .ConfigureAwait(false);
        }
    }
}
```

### The Simulated Failure Toggle

This operation exists purely to demonstrate compensation. When `DemoFailure` is set to `true`, it throws -- causing WorkflowForge to roll back payments and inventory automatically:

```csharp
public sealed class MaybeFailOperation : WorkflowOperationBase
{
    public override string Name => "MaybeFail";
    public override bool SupportsRestore => true;

    protected override Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var demoFailure = foundry.GetPropertyOrDefault<bool>(ReconciliationKeys.DemoFailure, false);

        if (demoFailure)
        {
            foundry.Logger.LogError("Simulated failure triggered to demonstrate compensation");
            throw new InvalidOperationException("Simulated failure (DemoFailure=true)");
        }

        return Task.FromResult(inputData);
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

### Sending Confirmations

The final step -- no meaningful compensation needed (you can't unsend an email):

```csharp
public sealed class SendConfirmationEmailsOperation : WorkflowOperationBase
{
    private readonly IEmailSender _emailSender;

    public SendConfirmationEmailsOperation(IEmailSender emailSender)
    {
        _emailSender = emailSender;
    }

    public override string Name => "SendConfirmationEmails";
    public override bool SupportsRestore => true;

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
    {
        var orders = foundry.GetPropertyOrDefault<IReadOnlyList<Order>>(ReconciliationKeys.Orders)
            ?? Array.Empty<Order>();

        foundry.Logger.LogInformation("Sending confirmations for {Count} order(s)", orders.Count);

        foreach (var order in orders)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await _emailSender.SendConfirmationAsync(order.Id, cancellationToken)
                .ConfigureAwait(false);
        }

        return inputData;
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

> **Why do non-mutating operations set `SupportsRestore = true`?** WorkflowForge only compensates when the workflow reports it supports restore, and that's computed from all operations. If any operation says `false`, the entire workflow skips compensation. So even no-op restore implementations must opt in to enable the saga for the operations that really need it.

---

## The Coravel Scheduling Layer

### The Job

The `ReconciliationJob` implements Coravel's `IInvocable`. It builds the workflow, creates a foundry with initial properties, and runs it:

```csharp
public sealed class ReconciliationJob : IInvocable
{
    private readonly IOrderRepository _orderRepository;
    private readonly IPaymentService _paymentService;
    private readonly IInventoryService _inventoryService;
    private readonly IEmailSender _emailSender;
    private readonly IOptions<ReconciliationJobOptions> _options;
    private readonly ILogger<ReconciliationJob> _logger;

    public ReconciliationJob(
        IOrderRepository orderRepository,
        IPaymentService paymentService,
        IInventoryService inventoryService,
        IEmailSender emailSender,
        IOptions<ReconciliationJobOptions> options,
        ILogger<ReconciliationJob> logger)
    {
        _orderRepository = orderRepository;
        _paymentService = paymentService;
        _inventoryService = inventoryService;
        _emailSender = emailSender;
        _options = options;
        _logger = logger;
    }

    public async Task Invoke()
    {
        var options = _options.Value;
        _logger.LogInformation(
            "Starting scheduled reconciliation workflow (DemoFailure={DemoFailure})",
            options.DemoFailure);

        var workflow = NightlyReconciliationWorkflow.Build(
            _orderRepository, _paymentService, _inventoryService, _emailSender);

        using var foundry = WF.CreateFoundry(
            workflowName: workflow.Name,
            initialProperties: new Dictionary<string, object?>
            {
                [ReconciliationKeys.BatchSize] = 3,
                [ReconciliationKeys.DemoFailure] = options.DemoFailure
            });

        using var smith = WF.CreateSmith(new ConsoleLogger("WF"));

        try
        {
            await smith.ForgeAsync(workflow, foundry).ConfigureAwait(false);
            _logger.LogInformation("Reconciliation workflow finished successfully");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Reconciliation workflow failed (compensation should have run for completed steps)");
        }
    }
}
```

### Configuration

```json
{
  "ReconciliationJob": {
    "ScheduleSeconds": 10,
    "DemoFailure": false
  }
}
```

```csharp
public sealed class ReconciliationJobOptions
{
    public const string SectionName = "ReconciliationJob";
    public int ScheduleSeconds { get; set; } = 10;
    public bool DemoFailure { get; set; } = false;
}
```

### Host Setup (Program.cs)

Standard .NET hosting with Coravel scheduler -- the entire host in one file:

```csharp
var builder = Host.CreateApplicationBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(options =>
{
    options.SingleLine = true;
    options.TimestampFormat = "HH:mm:ss ";
});

builder.Services.Configure<ReconciliationJobOptions>(
    builder.Configuration.GetSection(ReconciliationJobOptions.SectionName));

builder.Services.AddScheduler();
builder.Services.AddTransient<ReconciliationJob>();

builder.Services.AddSingleton<IOrderRepository, InMemoryOrderRepository>();
builder.Services.AddSingleton<IPaymentService, FakePaymentService>();
builder.Services.AddSingleton<IInventoryService, FakeInventoryService>();
builder.Services.AddSingleton<IEmailSender, FakeEmailSender>();

var host = builder.Build();

host.Services.UseScheduler(scheduler =>
{
    var options = host.Services.GetRequiredService<IOptions<ReconciliationJobOptions>>().Value;

    scheduler
        .Schedule<ReconciliationJob>()
        .EverySeconds(options.ScheduleSeconds)
        .PreventOverlapping(nameof(ReconciliationJob));
});

await host.RunAsync();
```

`PreventOverlapping` ensures a new run doesn't start if the previous one is still going -- important for workflows that touch external systems.

---

## Try It Yourself

```bash
# Happy path -- all steps succeed
dotnet run --project AnimatLabs.WorkflowForge.CoravelScheduledWorkflows

# Toggle simulated failure to see compensation in action
dotnet run --project AnimatLabs.WorkflowForge.CoravelScheduledWorkflows -- \
    ReconciliationJob:DemoFailure=true
```

With `DemoFailure=true`, the `MaybeFailOperation` throws after payments and inventory are processed. Watch the logs -- you'll see WorkflowForge automatically refund payments and release inventory reservations. The saga pattern, without writing a single line of orchestration code.

---

## Why This Combination Works

| Concern | Who Handles It |
|---------|----------------|
| **When** to run | Coravel (cron-like expressions, overlap prevention) |
| **What** to run | WorkflowForge (operation sequence, data flow) |
| **What if it fails** | WorkflowForge (automatic compensation in reverse) |
| **Configuration** | Standard .NET `IOptions<T>` |
| **DI** | Standard `IServiceCollection` |

Each tool does one thing well. No overlap, no conflict.

---

## When to Use This Pattern

**Good fit:**
- Multi-step business processes on a schedule
- Operations that need rollback if later steps fail (payments, inventory, external APIs)
- Teams that want to avoid Hangfire/Quartz complexity
- Applications where in-memory scheduling is sufficient

**Not ideal:**
- Jobs that must survive application restarts (use Hangfire with persistence)
- Distributed job coordination across instances (use Hangfire or Quartz)
- Visual workflow designers for business users (use Elsa)

---

## Resources

| What | Where |
|------|-------|
| WorkflowForge | [GitHub](https://github.com/animatlabs/workflow-forge) \| [NuGet](https://www.nuget.org/packages/WorkflowForge) \| [Docs](https://animatlabs.com/workflow-forge) |
| Coravel | [GitHub](https://github.com/jamesmh/coravel) \| [Docs](https://docs.coravel.net) |
| This Sample | [Playground Repo](https://github.com/animat089/playground/tree/main/WorkflowForge) |
| Benchmarks | [540x faster than alternatives](https://animatlabs.com/workflow-forge/performance/competitive-analysis/) |

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WorkflowForge){: .btn .btn--primary}

---

*Using scheduled workflows in your .NET apps? Tried WorkflowForge? Let me know in the comments!*
