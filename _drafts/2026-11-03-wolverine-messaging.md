---
title: "I Replaced MediatR and MassTransit with Wolverine"
excerpt: >-
  One library for in-process mediation AND async messaging. Wolverine unifies what used to take two frameworks.
categories:
  - Technical
  - .NET
  - Messaging
tags:
  - .NET
  - Wolverine
  - MediatR
  - MassTransit
  - Messaging
  - CQRS
author: animat089
last_modified_at: 2026-05-11
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

MediatR owns the in-process story: commands, queries, and pipeline behaviors. MassTransit (or NServiceBus, or raw clients) owns the async story: queues, topics, retries, topology. Both are solid.

They also mean two mental models, two abstraction stacks, and glue whenever a handler needs to publish after it commits. I kept hitting that split every time I sketched a new service.

[Wolverine](https://wolverinefx.net/) is one runtime for local invocation and messaging: same handler shape, same discovery rules, optional persistence hooks (transactional outbox is the big one). [Jeremy Miller](https://jeremydmiller.com/) built it; he’s also behind [Marten](https://martendb.io/), the PostgreSQL doc store and event-sourcing stack for .NET. If you know Marten, Wolverine’s vibe matches: conventions first, generated wiring, PostgreSQL when you care about durability.

I threw together a small playground: no marker interfaces, static `Handle` methods with method injection, and cascading messages so one command fans out without me hand-wiring dispatch. I’ll compare MediatR and Wolverine on paper, say when I’d actually migrate, and nod at Marten for outbox in a real deploy.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WolverineMessaging){: .btn .btn--primary}

## The two-framework problem

Most .NET backends I’ve worked on pair MediatR (or a hand-rolled mediator) for in-process CQRS with a bus for anything that crosses a boundary. That’s fair; it’s explicit. It’s also repetitive.

I end up registering handlers twice in spirit: `IRequestHandler<,>` on one side, consumers or publishers on the other. Juniors learn two pipelines.

I write adapters when one domain event should update a read model *and* hit a queue.

Wolverine doesn’t magic away transports, brokers, or ops. It does collapse the *handler* story. I write methods; Wolverine calls them whether the trigger is HTTP, an in-memory send, or a broker message, based on how I configure the host.

The sample stays in memory so the repo stays small and logs stay readable. For production I’d add a transport (RabbitMQ, Azure Service Bus, SQS, etc. all have Wolverine packages) and persistence.

Handler signatures stay the same. I’m not maintaining one style for HTTP and another for queues.

## What Wolverine is

Wolverine is a .NET message bus that treats in-process execution as normal, not bolted-on. Handlers turn up by convention. Dependencies arrive as parameters (method injection).

Return values can be responses, outgoing messages, or both. There’s HTTP (`WolverineFx.Http`), persistence hooks (Marten, EF Core, others), and docs that assume messaging matters from day one.

Coming from MediatR only, I picture Wolverine as the thing that can replace MediatR *and* occupy the MassTransit-consumer slot with less ceremony on types and registration.

## The handler model: no interfaces, static methods, method injection

MediatR wants interfaces: `IRequestHandler<TRequest, TResponse>` (or async), ctor injection, `Handle`. It works. For small features it’s a lot of ceremony.

Wolverine scans assemblies for handlers. I use a static `Handle` on a plain class a lot.

Parameters after the message resolve from DI per call, like ctor injection but scoped to the invocation. No `IRequestHandler`, no forced nested type per command.

Message types in the playground are thin records:

```csharp
namespace AnimatLabs.WolverineMessaging.Messages;

public record CreateOrder(string Customer, string Product, int Quantity, decimal Total);
public record OrderCreated(Guid OrderId, string Customer, string Product, int Quantity, decimal Total);
public record NotifyWarehouse(Guid OrderId, string Product, int Quantity);
public record WarehouseNotified(Guid OrderId, DateTime NotifiedAt);
```

`CreateOrder` comes from the API; `OrderCreated` is the domain-ish event; `NotifyWarehouse` and `WarehouseNotified` complete the little story in logs.

## Cascading messages: tuples and automatic routing

One handler can return multiple messages. Wolverine unpacks a tuple and routes each piece.

I don’t enqueue the second leg myself; I return it.

`CreateOrderHandler` returns an `OrderCreated` and a `NotifyWarehouse` together:

```csharp
public class CreateOrderHandler
{
    public static (OrderCreated, NotifyWarehouse) Handle(
        CreateOrder command,
        ILogger<CreateOrderHandler> log)
    {
        var orderId = Guid.NewGuid();
        log.LogInformation("Order {OrderId} created for {Customer}", orderId, command.Customer);

        var created = new OrderCreated(orderId, command.Customer, command.Product, command.Quantity, command.Total);
        var notify = new NotifyWarehouse(orderId, command.Product, command.Quantity);

        return (created, notify);
    }
}
```

In this sample there’s no extra registration: `OrderCreated` and `NotifyWarehouse` land on their handlers. That’s the cascade.

`OrderCreatedHandler` just logs:

```csharp
public class OrderCreatedHandler
{
    public static void Handle(
        OrderCreated evt,
        ILogger<OrderCreatedHandler> log)
    {
        log.LogInformation("Event received: Order {OrderId} for {Customer} ({Quantity}x {Product}, {Total:C})",
            evt.OrderId, evt.Customer, evt.Quantity, evt.Product, evt.Total);
    }
}
```

`NotifyWarehouseHandler` returns `WarehouseNotified` so there’s a third hop:

```csharp
public class NotifyWarehouseHandler
{
    public static WarehouseNotified Handle(
        NotifyWarehouse command,
        ILogger<NotifyWarehouseHandler> log)
    {
        log.LogInformation("Warehouse notified for order {OrderId}: {Quantity}x {Product}",
            command.OrderId, command.Quantity, command.Product);

        return new WarehouseNotified(command.OrderId, DateTime.UtcNow);
    }
}
```

No `IRequestHandler` anywhere; Wolverine wires it.

## MediatR vs Wolverine

Both keep controllers thin and push domain work into handlers. After that they split: marker interfaces vs convention methods, who owns queues, how painful outbox is.

With MediatR I stay on `IRequestHandler<,>` plus registration or assembly scanning I configure myself. Messaging is another dependency: MassTransit, NServiceBus, raw SDKs. Outbox is community packages or me rolling tables.

Upside is the elephant-sized ecosystem; half the CQRS content on the internet assumes MediatR.

Wolverine flips some of that. I get static `Handle` methods discovered by convention, bus primitives plus broker adapters, and Marten/EF Core outbox support so I’m not sketching idempotency tables on a whim. Tradeoff is a smaller footprint and releases that move fast for software I’d still call infra, so I factor that in.

**Transactional outbox** is where Wolverine stops looking like a mediator toy and starts looking like infrastructure. Persist business state and outbound messages in one transaction; a background path publishes reliably. I’m not building idempotency tables from scratch on day one if I use those integrations.

The GitHub sample doesn’t enable outbox; it’s syntax and flow. Pair Wolverine with Marten on PostgreSQL and you’re in the lane Jeremy Miller’s stack is built for.

## Wiring it in `Program.cs`

Tiny host: `UseWolverine()` on the generic host, `MapWolverineEndpoints()` for HTTP. POST takes `CreateOrder`, grabs `IMessageBus`, calls `InvokeAsync<OrderCreated>`.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseWolverine();

var app = builder.Build();

app.MapWolverineEndpoints();

app.MapPost("/api/orders", (CreateOrder command, IMessageBus bus) =>
    bus.InvokeAsync<OrderCreated>(command));

app.Run();
```

Packages: `WolverineFx`, `WolverineFx.Http`, .NET 8. No handler registration block.

## Running the demo

From the [playground](https://github.com/animat089/playground) clone, folder `WolverineMessaging/AnimatLabs.WolverineMessaging`:

```bash
cd WolverineMessaging/AnimatLabs.WolverineMessaging
dotnet run
```

App listens on `http://localhost:5194` (`launchSettings.json`). Example POST:

```bash
curl -X POST http://localhost:5194/api/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"customer\":\"alice\",\"product\":\"Widget A\",\"quantity\":2,\"total\":49.98}"
```

On Linux or macOS I use the `\` continuation style from the project README. Console should show three lines in order: created, event received, warehouse notified. One HTTP call started it.

## When to migrate, when to stay with MediatR

I’d stay on MediatR if the architecture’s settled, the team knows the patterns, and bus traffic is occasional MassTransit glue. Rip-and-replace for sport rarely pays; if I depend on `IPipelineBehavior` and blog samples everywhere, MediatR’s gravity is real.

Wolverine makes sense when I’m already juggling MediatR *and* a bus, when I want fewer marker types and less registration noise, or on greenfield where outbox plus Marten is a plausible default. Tradeoff is a smaller community and a quicker-moving toolchain.

Hybrid’s normal: legacy modules stay MediatR, new seams try Wolverine. My playground is a learning slice, not an order to rewrite prod this weekend.

## Wolverine and Marten together

They’re meant to mesh for projections, document storage, and outbox on PostgreSQL. I wrote **[Marten: PostgreSQL as Document DB + Event Store](https://animatlabs.com/technical/marten-postgresql-as-document-db-event-store/)** for the persistence side; stack Wolverine on top when you’re ready.

Wolverine won’t sunset MediatR across the industry next week. For my “same handler here and over the broker, reliably” problem, though, one model beats two. If you run the sample and your logs match mine, you’ll feel whether the abstraction stuck.

*Tried Wolverine alongside MediatR or MassTransit? I’d like to hear what you kept and what you dropped in the comments.*

<!--
LinkedIn promo (May 2026):
New post: I Replaced MediatR and MassTransit with Wolverine. One handler model for in-process work and messaging, cascading tuples, minimal Program.cs. Code on GitHub. #dotnet #wolverine #mediatr #messaging #cqrs
-->
