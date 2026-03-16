---
title: "MassTransit Saga + WorkflowForge Compensation: Real Rollback Code"
excerpt: >-
  "Everyone talks about the saga pattern. Nobody shows the compensation code. Here's a single-service demo where MassTransit delivers the messages and WorkflowForge rolls back the failures."
categories:
  - Technical
  - .NET
  - Workflow
tags:
  - .NET
  - MassTransit
  - WorkflowForge
  - Saga Pattern
  - Compensation
  - Messaging
  - RabbitMQ
author: animat089
last_modified_at: 2026-03-15
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Everyone talks about the saga pattern. Nobody shows the compensation code. I spent weeks hunting for a real .NET example where payment fails, stock gets released, and refunds actually run - not just a diagram.

I built one. MassTransit handles the message routing. WorkflowForge handles the rollback. Here's the full pipeline.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.MassTransitSaga.OrderService){: .btn .btn--primary}

## Prerequisites

You need .NET 8 and the WorkflowForge solution. The demo runs out of the box with **InMemory transport** -- no RabbitMQ required.

Want RabbitMQ instead? The project has a `docker-compose.yml`:

```bash
cd playground/WorkflowForge/AnimatLabs.WorkflowForge.MassTransitSaga.OrderService
docker-compose up -d
```

That starts RabbitMQ on port **5672** with the management UI on **15672** (guest/guest). Swap `UsingInMemory` for `UsingRabbitMq` in Program.cs and you're set.

## The Problem

You've got an order flow: reserve stock, charge payment, create shipment. If any step fails, you need to undo the previous ones. That's the saga pattern.

The hard part -- the part most tutorials skip -- is the compensation logic. When a payment gateway times out, who releases the stock? Who refunds the charge? How do you keep that logic in one place instead of scattered across consumers?

## The Split: MassTransit + WorkflowForge

MassTransit distributes the messages. WorkflowForge 2.1.1 compensates the failures. One library does pub/sub. The other does the orchestration and rollback.

The flow:

```
SubmitOrder → ReserveStock → ChargePayment → CreateShipment → OrderAccepted
                                  ↓ (failure)
                            ChargePayment.Compensate → ReserveStock.Compensate → OrderFailed
```

Orders over $500 simulate a payment gateway timeout. When that happens, WorkflowForge runs the compensation in reverse order: refund payment, then release stock.

## This Is a Single-Service Demo

Important: this demo runs in **one process** -- OrderService. There are no separate Inventory, Payments, or Shipping services.

The step-level events (ReserveStock, ChargePayment, CreateShipment) are published to the bus but **no consumers** handle them. They're fire-and-forget -- the workflow steps do the work directly and publish for visibility or future use.

In a real system you'd add consumers in separate services. For this demo, the goal is to show the compensation pattern without the extra moving parts.

## Messages

Contracts are simple records. No shared state, just events.

```csharp
namespace AnimatLabs.WorkflowForge.Workflows.Sample.OrderSaga.Contracts;

public record SubmitOrder(Guid OrderId, string CustomerEmail, decimal Amount);

public record OrderAccepted(Guid OrderId);
public record OrderFailed(Guid OrderId, string Reason);

public record ReserveStock(Guid OrderId, int Quantity);
public record ChargePayment(Guid OrderId, decimal Amount);
public record CreateShipment(Guid OrderId, string CustomerEmail);
```

These live in the shared `Workflows.Sample` library so any execution project can reference them. The same file also defines `StockReserved`, `PaymentFailed`, etc. Those are for a future multi-service setup. In this demo they're unused -- the workflow steps publish `ReserveStock`, `ChargePayment`, `CreateShipment` to the bus, but nothing consumes them.

## The Consumer

`OrderSubmittedConsumer` receives the message, builds a workflow, and runs it. The key: `WF.CreateFoundry` holds the saga state (OrderId, Amount, CustomerEmail). `WF.CreateSmith` runs the workflow.

```csharp
public sealed class OrderSubmittedConsumer(IBus bus, ILogger<OrderSubmittedConsumer> logger) : IConsumer<SubmitOrder>
{
    public async Task Consume(ConsumeContext<SubmitOrder> context)
    {
        var order = context.Message;
        logger.LogInformation("Received order {OrderId} for ${Amount}", order.OrderId, order.Amount);

        var shouldFail = order.Amount > 500;
        var workflow = OrderSagaWorkflow.Build(bus, shouldFail);

        using var foundry = WF.CreateFoundry(
            workflowName: workflow.Name,
            initialProperties: new Dictionary<string, object?>
            {
                [SagaKeys.OrderId] = order.OrderId,
                [SagaKeys.Amount] = order.Amount,
                [SagaKeys.CustomerEmail] = order.CustomerEmail
            });

        using var smith = WF.CreateSmith(new ConsoleLogger("WF-Saga"));

        try
        {
            await smith.ForgeAsync(workflow, foundry, context.CancellationToken).ConfigureAwait(false);
            await context.Publish(new OrderAccepted(order.OrderId)).ConfigureAwait(false);
            logger.LogInformation("Order {OrderId} completed successfully", order.OrderId);
        }
        catch (Exception ex)
        {
            await context.Publish(new OrderFailed(order.OrderId, ex.Message)).ConfigureAwait(false);
            logger.LogError(ex, "Order {OrderId} failed -- compensation executed", order.OrderId);
        }
    }
}
```

## The Workflow

Each step extends `WorkflowOperationBase`. Forge does the work. Restore does the rollback.

```csharp
public static class OrderSagaWorkflow
{
    public static IWorkflow Build(IBus bus, bool simulatePaymentFailure = false)
    {
        return WF
            .CreateWorkflow("OrderSaga")
            .AddOperation(new ReserveStockStep(bus))
            .AddOperation(new ChargePaymentStep(bus, simulatePaymentFailure))
            .AddOperation(new CreateShipmentStep(bus))
            .Build();
    }
}
```

## The Steps

```csharp
public sealed class ReserveStockStep(IBus bus) : WorkflowOperationBase
{
    public override string Name => "ReserveStock";

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var orderId = foundry.GetPropertyOrDefault<Guid>(SagaKeys.OrderId);
        foundry.Logger.LogInformation("[ReserveStock] Reserving stock for order {OrderId}", orderId);

        await bus.Publish(new ReserveStock(orderId, 1), ct).ConfigureAwait(false);
        await Task.Delay(500, ct).ConfigureAwait(false);

        foundry.Logger.LogInformation("[ReserveStock] Stock reserved for order {OrderId}", orderId);
        return inputData;
    }

    public override async Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var orderId = foundry.GetPropertyOrDefault<Guid>(SagaKeys.OrderId);
        foundry.Logger.LogWarning("[ReserveStock] COMPENSATING: Releasing stock for order {OrderId}", orderId);
        await Task.Delay(300, ct).ConfigureAwait(false);
        foundry.Logger.LogWarning("[ReserveStock] Stock released for order {OrderId}", orderId);
    }
}
```

```csharp
public sealed class ChargePaymentStep(IBus bus, bool simulateFailure) : WorkflowOperationBase
{
    public override string Name => "ChargePayment";

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var orderId = foundry.GetPropertyOrDefault<Guid>(SagaKeys.OrderId);
        var amount = foundry.GetPropertyOrDefault<decimal>(SagaKeys.Amount);
        foundry.Logger.LogInformation("[ChargePayment] Charging ${Amount} for order {OrderId}", amount, orderId);

        await bus.Publish(new ChargePayment(orderId, amount), ct).ConfigureAwait(false);
        await Task.Delay(800, ct).ConfigureAwait(false);

        if (simulateFailure)
        {
            foundry.Logger.LogError("[ChargePayment] Payment gateway timeout for order {OrderId}", orderId);
            throw new InvalidOperationException($"Payment gateway timeout for order {orderId}");
        }

        var txId = $"TXN-{Random.Shared.Next(10000, 99999)}";
        foundry.SetProperty(SagaKeys.TransactionId, txId);
        foundry.Logger.LogInformation("[ChargePayment] Payment {TransactionId} charged for order {OrderId}", txId, orderId);

        return inputData;
    }

    public override async Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var orderId = foundry.GetPropertyOrDefault<Guid>(SagaKeys.OrderId);
        var txId = foundry.GetPropertyOrDefault<string>(SagaKeys.TransactionId);

        if (!string.IsNullOrEmpty(txId))
        {
            foundry.Logger.LogWarning("[ChargePayment] COMPENSATING: Refunding {TransactionId} for order {OrderId}", txId, orderId);
            await Task.Delay(500, ct).ConfigureAwait(false);
            foundry.Logger.LogWarning("[ChargePayment] Refund issued for {TransactionId}", txId);
        }
        else
        {
            foundry.Logger.LogInformation("[ChargePayment] No charge to reverse for order {OrderId}", orderId);
        }
    }
}
```

`ChargePaymentStep.RestoreAsync` checks `TransactionId` before refunding. If payment never succeeded, there's nothing to reverse. That's the kind of detail that breaks production sagas.

## Wiring It Up

InMemory transport means no RabbitMQ needed. Run it, watch two orders: $99 succeeds, $999 fails and triggers compensation.

```csharp
builder.Services.AddMassTransit(cfg =>
{
    cfg.AddConsumer<OrderSubmittedConsumer>();

    cfg.UsingInMemory((context, inmem) =>
    {
        inmem.ConfigureEndpoints(context);
    });
});

// Fire a test order after the bus starts
_ = Task.Run(async () =>
{
    await Task.Delay(2000);
    var bus = host.Services.GetRequiredService<IBus>();

    await bus.Publish(new SubmitOrder(Guid.NewGuid(), "happy@example.com", 99.99m));
    await Task.Delay(5000);

    await bus.Publish(new SubmitOrder(Guid.NewGuid(), "sad@example.com", 999.99m));
});
```

## What I Learned

The compensation logic lives in one place - the `RestoreAsync` methods. No scattered event handlers. No "if payment failed then fire ReleaseStock" spaghetti. WorkflowForge runs the compensation cascade automatically when any step throws.

For RabbitMQ, swap `UsingInMemory` for `UsingRabbitMq`. Same code. Same workflow. Different transport.

## Run It

```bash
cd playground/WorkflowForge
dotnet run --project AnimatLabs.WorkflowForge.MassTransitSaga.OrderService
```

The app auto-submits two orders. Watch the logs for the $999 failure and the compensation cascade.

---

*What's your go-to for saga compensation in .NET -- MassTransit's built-in sagas, something else, or still writing it by hand?*

{% include cta-workflowforge.html %}