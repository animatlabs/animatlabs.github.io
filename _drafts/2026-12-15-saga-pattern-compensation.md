---
title: "Saga Pattern in .NET: Automatic Compensation Made Simple"
excerpt: >-
  Distributed transactions are hard. I use the saga pattern with automatic compensation in WorkflowForge so I don't drown in nested try-catch.
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

In a monolith, transactions are simple. You wrap your database work in a transaction. Everything commits or everything rolls back. ACID does the heavy lifting.

In microservices, that comfort's gone. An order might reserve inventory in one service, charge a card in another, and create a shipment in a third. There's no one database spanning all of them. Each service commits on its own.

Shipment creation fails after the charge went through? You can't "rollback" the payment service. It's already committed. You refund on purpose. That's the distributed transaction problem, and sagas are how I deal with it.

## What is the Saga Pattern?

A saga is a chain of local transactions. Each step has a *compensation*. If something breaks, you run the compensations for completed steps in reverse order until the system looks sane again.

Two shapes show up constantly. **Choreography:** services fire events at each other, no boss in the middle. Fine when the flow is small; I lose the plot fast when the graph gets hairy. **Orchestration:** one coordinator drives the steps and owns failure handling. I pick this for anything where money or reputation is on the line, because I can actually read the flow and reason about what happens when step four blows up.

## Traditional Implementation: Lots of Code

Without a framework, I end up with nested try-catch and a mental stack of "what did I already do?":

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

Three steps are barely okay. Ten steps? The nesting eats you. And I still don't get a clean story for refund failures, retries, or decent logs without writing it all by hand.

## WorkflowForge: Automatic Compensation

I built [WorkflowForge](https://github.com/animatlabs/workflow-forge) so I'd stop hand-rolling that stack. I declare each step's undo; the library walks backward if something fails.

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

If `CreateShipmentOperation` throws, WorkflowForge runs `RefundPaymentOperation`, then `ReleaseInventoryOperation`. Newest completed step first. No ceremony from me.

## How Compensation Works

Rule: step N dies, compensate N−1 down to 1.

```
Success path: Reserve → Charge → Ship → Done

Failure at Ship: Ship fails → Refund → Release → Report error
Failure at Charge: Charge fails → Release → Report error
Failure at Reserve: Reserve fails → Report error (no prior steps to compensate)
```

WorkflowForge remembers what actually ran. Fail at step 2, only step 1's compensation fires.

If one compensation throws, it logs and keeps going with the rest. I'd rather finish the chain than leave half the mess behind.

## Compensating Operations

Each operation subclasses `WorkflowOperationBase`. The undo is another class:

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

`IWorkflowFoundry` is the shared bag: reserve stashes `ReservationId`, release reads it. Same pattern for payment ids, shipment tokens, whatever.

## Real-World Example: Order Processing

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

Validation is read-only here, so no undo. Email's the same (I don't pretend I can unsend mail; I'd handle fallout elsewhere if I had to).

## When I'd Reach for a Saga

I don't default to sagas for everything.

- **Multiple services, real side effects.** If I can name a sane undo per step and I'm crossing service boundaries, a saga belongs in the conversation.

- **One database, one transaction.** I use ordinary SQL transactions and stop overcomplicating it.

- **I need everyone's view identical right now.** Sagas settle eventually. If that's not acceptable, I've probably drawn the wrong bounded context, or I need something stricter than fire-and-patch.

## What Bites Me If I'm Lazy

**Idempotency:** operations and compensations should survive a retry without doubling the damage.

**Messy undo:** refunds land on the customer's statement days later. "Compensated" in code isn't the same as "the user feels whole." I nail down what we're promising.

**Lights out at 3 AM:** structured logs per step and per compensation beat guessing from a spike in errors.

## Sagas Without the Boilerplate

Manual sagas rot. The pattern's real (consistency without a distributed transaction), but the implementation turns into archaeology.

WorkflowForge keeps the workflow declarative for me: pair steps with undo, ship it, let failures unwind in order.

**WorkflowForge on NuGet:** [nuget.org/packages/WorkflowForge](https://www.nuget.org/packages/WorkflowForge){: .btn .btn--primary}

**MassTransit saga playground:** [GitHub](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.MassTransitSaga.OrderService){: .btn .btn--primary}

---

*Saga horror stories or wins? Drop them in the comments.*
