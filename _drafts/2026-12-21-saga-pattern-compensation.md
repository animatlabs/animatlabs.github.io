---
title: "Saga Pattern in .NET: Automatic Compensation Made Simple"
excerpt: >-
  "Distributed transactions are hard. Here's how I implement the Saga pattern with automatic compensation using WorkflowForge."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - Saga Pattern
  - Distributed Systems
  - WorkflowForge
  - Compensation
  - Microservices
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Distributed Transaction Problem

In a monolith, transactions are simple. You wrap your database operations in a transaction, and either everything commits or everything rolls back. ACID guarantees handle the complexity for you.

In microservices, that luxury disappears. When an order requires reserving inventory (Service A), charging a payment (Service B), and creating a shipment (Service C), there's no single database transaction that spans all three. Each service owns its data, and each operation commits independently.

So what happens when the shipment creation fails after you've already charged the customer's credit card? You can't just "rollback" - the payment service has already committed its transaction. You need to explicitly *undo* what you've done by issuing a refund.

This is the distributed transaction problem, and the Saga pattern is the solution.

## What is the Saga Pattern?

A saga is a sequence of local transactions where each step has a corresponding *compensation* action. If any step fails, the compensations for all previously completed steps are executed in reverse order to restore the system to a consistent state.

There are two main approaches:

**Choreography** - Each service publishes events and reacts to events from other services. No central coordinator. Works well for simple flows but becomes hard to trace and debug as complexity grows.

**Orchestration** - A central orchestrator explicitly controls the flow, telling each service what to do and handling failures. Easier to understand and debug, but introduces a single point of coordination.

I prefer orchestration for most business-critical flows because the explicit flow definition makes it easier to reason about failure scenarios and compensation logic.

## Traditional Implementation: Lots of Code

Here's what saga implementation typically looks like without a framework - nested try-catch blocks tracking what needs to be undone:

```csharp
// Traditional saga - manual compensation tracking
public async Task<Result> ProcessOrderAsync(Order order)
{
    var reservationId = await _inventory.ReserveAsync(order.Items);
    try
    {
        var paymentId = await _payment.ChargeAsync(order.Total);
        try
        {
            await _shipping.CreateShipmentAsync(order);
            return Result.Success();
        }
        catch
        {
            await _payment.RefundAsync(paymentId);  // Compensate payment
            throw;
        }
    }
    catch
    {
        await _inventory.ReleaseAsync(reservationId);  // Compensate inventory
        throw;
    }
}
```

This works for three steps, but imagine a workflow with 10 steps. The nesting becomes unmanageable. And this doesn't even handle:
- Compensation failures (what if the refund fails?)
- Retry logic for transient failures
- Logging and observability
- Partial failures during compensation

The boilerplate quickly overwhelms the actual business logic.

## WorkflowForge: Automatic Compensation

This is exactly why I built [WorkflowForge](https://github.com/animatlabs/workflow-forge). Instead of manually tracking compensations, you declare what each step's "undo" action is, and the framework handles the rest:

```csharp
// WorkflowForge approach - compensation is automatic
var workflow = WorkflowForge.CreateWorkflow("ProcessOrder")
    .AddOperation(new ReserveInventoryOperation())
    .WithCompensation(new ReleaseInventoryOperation())
    
    .AddOperation(new ChargePaymentOperation())
    .WithCompensation(new RefundPaymentOperation())
    
    .AddOperation(new CreateShipmentOperation())
    .Build();

// If any step fails, compensations run automatically in reverse order
using var smith = WorkflowForge.CreateSmith();
var result = await smith.ForgeAsync(workflow, order);
```

The workflow definition is declarative and readable. Each operation is paired with its compensation. If `CreateShipmentOperation` fails, WorkflowForge automatically executes `RefundPaymentOperation` then `ReleaseInventoryOperation` - in reverse order, exactly as required by the saga pattern.

## How Compensation Works

The compensation chain follows a simple rule: if step N fails, execute compensations for steps N-1, N-2, ... , 1 in that order.

```
Success path: Reserve → Charge → Ship → Done

Failure at Ship: Ship fails → Refund → Release → Report error
Failure at Charge: Charge fails → Release → Report error
Failure at Reserve: Reserve fails → Report error (no prior steps to compensate)
```

WorkflowForge tracks which operations completed successfully and only runs compensations for those. If the workflow fails at step 2, only step 1's compensation runs - not compensations for steps that never executed.

The framework also handles compensation failures gracefully. If a compensation throws an exception, WorkflowForge logs it and continues with the remaining compensations. This prevents a single compensation failure from leaving the system in an even worse state.

## Implementing Compensatable Operations

Each operation extends `WorkflowOperationBase` and implements the core business logic. The compensation operation is a separate class that knows how to undo the work:

```csharp
public class ReserveInventoryOperation : WorkflowOperationBase
{
    private readonly IInventoryService _inventory;
    
    public ReserveInventoryOperation(IInventoryService inventory)
    {
        _inventory = inventory;
    }
    
    protected override async Task<object?> ForgeAsyncCore(
        object? input, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var order = (Order)input!;
        var reservationId = await _inventory.ReserveAsync(order.Items, ct);
        
        // Store for compensation - the foundry passes data between operations
        foundry.SetProperty("ReservationId", reservationId);
        
        return order;
    }
}

public class ReleaseInventoryOperation : WorkflowOperationBase
{
    private readonly IInventoryService _inventory;
    
    public ReleaseInventoryOperation(IInventoryService inventory)
    {
        _inventory = inventory;
    }
    
    protected override async Task<object?> ForgeAsyncCore(
        object? input, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var reservationId = foundry.GetProperty<string>("ReservationId");
        await _inventory.ReleaseAsync(reservationId, ct);
        return input;
    }
}
```

The `IWorkflowFoundry` acts as a shared context, allowing operations to store data that their compensations need later. In this example, the `ReserveInventoryOperation` stores the `ReservationId`, and the `ReleaseInventoryOperation` retrieves it to know which reservation to release.

## Real-World Example: Order Processing

Here's a more complete order processing workflow with error handling and logging:

```csharp
public class OrderWorkflowBuilder
{
    public IWorkflow Build(IServiceProvider services)
    {
        return WorkflowForge.CreateWorkflow("ProcessOrder")
            // Step 1: Validate order
            .AddOperation(services.GetRequiredService<ValidateOrderOperation>())
            // No compensation - validation doesn't change state
            
            // Step 2: Reserve inventory
            .AddOperation(services.GetRequiredService<ReserveInventoryOperation>())
            .WithCompensation(services.GetRequiredService<ReleaseInventoryOperation>())
            
            // Step 3: Charge payment
            .AddOperation(services.GetRequiredService<ChargePaymentOperation>())
            .WithCompensation(services.GetRequiredService<RefundPaymentOperation>())
            
            // Step 4: Create shipment
            .AddOperation(services.GetRequiredService<CreateShipmentOperation>())
            .WithCompensation(services.GetRequiredService<CancelShipmentOperation>())
            
            // Step 5: Send confirmation email
            .AddOperation(services.GetRequiredService<SendConfirmationOperation>())
            // No compensation - emails can't be "unsent"
            
            .Build();
    }
}
```

Notice that not every operation needs a compensation. Validation doesn't change state, so there's nothing to undo. Emails can't be unsent (though you might send an apology email as part of error handling elsewhere).

## When to Use Sagas

The saga pattern isn't always the right choice. Here's my decision framework:

| Use Case | Saga Appropriate? | Why |
|----------|-------------------|-----|
| Cross-service transactions | Yes | No distributed transaction alternative |
| Long-running processes | Yes | Can checkpoint and resume |
| Single database transaction | No | Use regular DB transactions |
| All operations idempotent | Ideal | Compensations can safely retry |
| Eventual consistency acceptable | Yes | Sagas provide eventual, not immediate, consistency |
| Strong consistency required | Maybe | Consider two-phase commit or outbox pattern instead |

**My rule of thumb:** If the operation spans multiple services and you can define a reasonable "undo" action for each step, use a saga. If you need immediate consistency across services, reconsider your service boundaries.

## Important Considerations

**Idempotency is crucial.** Both your operations and compensations should be idempotent. If a compensation is retried (due to a transient failure), running it twice should have the same effect as running it once.

**Design compensations carefully.** Not everything has a perfect undo. Charging a credit card can be refunded, but the refund might take days to appear. Consider what "compensated" really means for your business.

**Add observability.** Log every step and compensation. When a saga fails at 3 AM, you need to understand exactly what happened and what was compensated.

## Conclusion

The saga pattern solves a real problem in distributed systems: maintaining data consistency without distributed transactions. But implementing it manually leads to complex, error-prone code.

WorkflowForge makes sagas declarative. Define your operations, pair them with compensations, and let the framework handle the failure scenarios. The result is code that's easier to read, test, and maintain.

If you're building microservices that need to coordinate work across multiple services, give the saga pattern - and WorkflowForge - a try.

**WorkflowForge on NuGet:** [nuget.org/packages/WorkflowForge](https://www.nuget.org/packages/WorkflowForge){: .btn .btn--primary}

**Full saga example:** [GitHub](https://github.com/animatlabs/workflow-forge/tree/main/samples){: .btn .btn--primary}

---

*Questions about implementing sagas in your system? Let me know in the comments!*
