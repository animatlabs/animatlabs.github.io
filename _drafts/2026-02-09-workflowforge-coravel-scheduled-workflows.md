---
title: "Scheduled Workflows in .NET: WorkflowForge Meets Coravel"
excerpt: >-
  "Coravel handles when to run. WorkflowForge handles what to run. Together they create lightweight scheduled workflows with automatic compensation—no Hangfire required."
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
  - Zero Dependencies
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Problem: Scheduled Workflows Are Overcomplicated

You need to run a multi-step business process on a schedule. Maybe it's:
- Nightly order reconciliation
- Hourly data sync with an external API
- Daily report generation with multiple fallback sources

The typical approach? Hangfire for scheduling, custom code for the workflow logic, and manual error handling for each step. That's three concerns tangled together, plus a Redis/SQL dependency just for scheduling.

What if you could have:
- **Zero external dependencies** for scheduling
- **Automatic compensation** if any step fails
- **Microsecond execution** instead of milliseconds
- **Clean separation** between "when to run" and "what to run"

Enter Coravel + WorkflowForge.

---

## The Solution: Two Libraries, One Pattern

**Coravel** is a near-zero config scheduling library. No database, no Redis—just fluent scheduling in memory.

**WorkflowForge** is a microsecond-speed workflow engine with built-in compensation patterns.

Together:

```
┌─────────────────────────────────────────────────┐
│                  Your Application               │
├─────────────────────────────────────────────────┤
│  Coravel Scheduler                              │
│  └─ "Run this every night at 2 AM"              │
│       │                                         │
│       ▼                                         │
│  WorkflowForge Workflow                         │
│  └─ Step 1: Fetch orders                        │
│  └─ Step 2: Process payments (with rollback)    │
│  └─ Step 3: Update inventory                    │
│  └─ Step 4: Send notifications                  │
└─────────────────────────────────────────────────┘
```

---

## Setup: Two NuGet Packages

```bash
dotnet add package Coravel
dotnet add package WorkflowForge
```

No database migrations. No connection strings for the scheduler. Ready in seconds.

---

## Building the Scheduled Workflow

### Step 1: Define Your Workflow

```csharp
public class NightlyReconciliationWorkflow
{
    public static IWorkflow Build()
    {
        return WorkflowForge.CreateWorkflow("NightlyReconciliation")
            .AddOperation(new FetchUnprocessedOrdersOperation())
            .AddOperation(new ProcessPaymentsOperation())
                .WithCompensation(new RefundPaymentsOperation())
            .AddOperation(new UpdateInventoryOperation())
                .WithCompensation(new RestoreInventoryOperation())
            .AddOperation(new SendConfirmationEmailsOperation())
            .Build();
    }
}
```

Note the `.WithCompensation()` calls. If step 3 fails, WorkflowForge automatically runs `RefundPaymentsOperation` to undo step 2. No manual try-catch chains.

### Step 2: Create the Coravel Invocable

Coravel's recommended pattern uses `IInvocable` for scheduled jobs:

```csharp
public class ReconciliationJob : IInvocable
{
    private readonly IServiceProvider _services;
    private readonly ILogger<ReconciliationJob> _logger;

    public ReconciliationJob(IServiceProvider services, ILogger<ReconciliationJob> logger)
    {
        _services = services;
        _logger = logger;
    }

    public async Task Invoke()
    {
        _logger.LogInformation("Starting nightly reconciliation workflow");
        
        var workflow = NightlyReconciliationWorkflow.Build();
        
        using var foundry = WorkflowForge.CreateFoundry(_services);
        using var smith = WorkflowForge.CreateSmith();
        
        var result = await smith.ForgeAsync(workflow, new ReconciliationContext
        {
            RunDate = DateTime.UtcNow.Date,
            BatchSize = 100
        });
        
        if (result.IsSuccess)
        {
            _logger.LogInformation("Reconciliation completed: {OrdersProcessed} orders", 
                result.Data.OrdersProcessed);
        }
        else
        {
            _logger.LogError("Reconciliation failed: {Error}. Compensations executed.", 
                result.Error);
        }
    }
}
```

### Step 3: Wire Up in Program.cs

```csharp
var builder = WebApplication.CreateBuilder(args);

// Register services
builder.Services.AddScheduler();
builder.Services.AddTransient<ReconciliationJob>();

// Register your operation dependencies
builder.Services.AddScoped<IOrderRepository, OrderRepository>();
builder.Services.AddScoped<IPaymentService, PaymentService>();

var app = builder.Build();

// Configure the schedule
app.Services.UseScheduler(scheduler =>
{
    scheduler
        .Schedule<ReconciliationJob>()
        .DailyAt(2, 0)  // 2:00 AM
        .Weekday()       // Monday-Friday only
        .PreventOverlapping(nameof(ReconciliationJob));
});

app.Run();
```

That's it. Every weekday at 2 AM, Coravel triggers the workflow. WorkflowForge executes each step in sequence. If anything fails, compensations run automatically.

---

## Why This Combination Works

### Coravel Handles Scheduling Concerns

- **When** to run (cron-like expressions)
- **Overlap prevention** (don't start if previous run is still going)
- **Constraint filtering** (weekdays only, specific dates)
- **No external dependencies** (in-memory, no Redis/SQL)

### WorkflowForge Handles Workflow Concerns

- **What** to run (operation sequence)
- **Error recovery** (automatic compensation)
- **Observability** (OpenTelemetry integration available)
- **Performance** (microseconds, not milliseconds)

### The Separation Pays Off

Need to change the schedule? Edit one line. Need to add a workflow step? Edit the workflow definition. The concerns stay cleanly separated.

---

## Real-World Pattern: Retry with Escalating Compensation

Here's a more sophisticated example—an order fulfillment workflow that retries external API calls and escalates compensation based on how far it got:

```csharp
public class OrderFulfillmentWorkflow
{
    public static IWorkflow Build()
    {
        return WorkflowForge.CreateWorkflow("OrderFulfillment")
            // Step 1: Reserve inventory (can be undone)
            .AddOperation(new ReserveInventoryOperation())
                .WithCompensation(new ReleaseInventoryOperation())
            
            // Step 2: Charge payment (can be refunded)
            .AddOperation(new ChargePaymentOperation())
                .WithCompensation(new RefundPaymentOperation())
            
            // Step 3: Create shipment (can be cancelled if not shipped)
            .AddOperation(new CreateShipmentOperation())
                .WithCompensation(new CancelShipmentOperation())
            
            // Step 4: Send confirmation (no compensation needed)
            .AddOperation(new SendConfirmationOperation())
            
            .Build();
    }
}
```

If `CreateShipmentOperation` fails:
1. `CancelShipmentOperation` runs (no-op if shipment wasn't created)
2. `RefundPaymentOperation` runs (customer gets money back)
3. `ReleaseInventoryOperation` runs (items back in stock)

All automatic. No nested try-catch. No manual state tracking.

---

## Comparison: Before and After

### Before (Hangfire + Manual)

```csharp
// Hangfire job
[AutomaticRetry(Attempts = 3)]
public async Task ProcessOrder(int orderId)
{
    bool inventoryReserved = false;
    bool paymentCharged = false;
    
    try
    {
        await _inventory.ReserveAsync(orderId);
        inventoryReserved = true;
        
        await _payment.ChargeAsync(orderId);
        paymentCharged = true;
        
        await _shipment.CreateAsync(orderId);
        await _notifications.SendAsync(orderId);
    }
    catch (Exception ex)
    {
        // Manual compensation
        if (paymentCharged)
            await _payment.RefundAsync(orderId);
        if (inventoryReserved)
            await _inventory.ReleaseAsync(orderId);
        
        throw;
    }
}
```

**Problems**: Manual compensation tracking, easy to miss a case, grows unreadable with complexity.

### After (Coravel + WorkflowForge)

```csharp
// Clean workflow definition
var workflow = WorkflowForge.CreateWorkflow("ProcessOrder")
    .AddOperation(new ReserveInventory()).WithCompensation(new ReleaseInventory())
    .AddOperation(new ChargePayment()).WithCompensation(new RefundPayment())
    .AddOperation(new CreateShipment()).WithCompensation(new CancelShipment())
    .AddOperation(new SendNotification())
    .Build();

// Coravel handles the scheduling
scheduler.Schedule<OrderProcessingJob>().EveryMinute();
```

**Benefits**: Declarative, self-documenting, automatic compensation in reverse order.

---

## When to Use This Pattern

**Good fit:**
- Multi-step business processes that run on a schedule
- Operations that need rollback if later steps fail
- Teams that want to avoid Hangfire/Quartz complexity
- Applications where job durability isn't critical (in-memory is fine)

**Not ideal:**
- Jobs that must survive application restarts (use Hangfire with persistence)
- Distributed job coordination across multiple instances (use Hangfire or Quartz)
- Visual workflow designers for business users (use Elsa)

---

## Get Started

```bash
dotnet add package Coravel
dotnet add package WorkflowForge
```

**WorkflowForge:** [GitHub](https://github.com/animatlabs/workflow-forge) | [Docs](https://animatlabs.com/workflow-forge)

**Coravel:** [GitHub](https://github.com/jamesmh/coravel) | [Docs](https://docs.coravel.net)

---

*Using scheduled workflows in your .NET apps? Share your patterns in the comments!*
