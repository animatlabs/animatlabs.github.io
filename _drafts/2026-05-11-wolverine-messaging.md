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

MediatR owns the in-process story: commands, queries, and pipeline behaviors. MassTransit (or NServiceBus, or raw clients) owns the async story: queues, topics, retries, and topology. Both are excellent. Both also mean two mental models, two sets of abstractions, and glue code every time a handler needs to publish after it commits. I kept bumping into that split whenever I sketched a new service.

[Wolverine](https://wolverinefx.net/) is a different bet. It is a single runtime that handles local invocation and messaging with the same handler shape, the same discovery rules, and optional integration with persistence for things like transactional outbox. It comes from [Jeremy Miller](https://jeremydmiller.com/), the same author behind [Marten](https://martendb.io/), the PostgreSQL document store and event sourcing library for .NET. If you already follow Marten, Wolverine will feel familiar in philosophy: conventions first, generated wiring, PostgreSQL-friendly when you need durability.

This post walks through a tiny playground that drops marker interfaces, shows method injection on static handlers, and uses cascading messages so one command fans out into multiple downstream handlers without manual dispatch. Then we compare MediatR and Wolverine on paper, talk about when a migration is worth it, and point you at Marten integration for production-grade outbox usage.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WolverineMessaging){: .btn .btn--primary}

## The two-framework problem

Most .NET backends I have worked on look like this: MediatR (or a hand-rolled mediator) for CQRS inside the process, plus a bus library for anything that crosses a boundary. That is not wrong. It is explicit. It is also repetitive. You register handlers twice in spirit, once as `IRequestHandler<,>` and once as consumers or publishers. You teach juniors two pipelines. You write adapters when a domain event should both update read models and notify a queue.

Wolverine does not remove the need for transports, brokers, or operational discipline. It does collapse the *handler* story. You write methods. Wolverine figures out how to call them whether the trigger is an HTTP request, an in-memory send, or a message from a broker, depending on how you configure the host.

The sample stays in memory. That keeps the repo small and the logs easy to read. In a real service you would add a transport (RabbitMQ, Azure Service Bus, Amazon SQS, and others have Wolverine extensions) and persistence. The same handler signatures carry over. You are not learning one style for HTTP and another for queues.

## What Wolverine is

At its core, Wolverine is a message bus for .NET with first-class support for in-process execution. Handlers are discovered by convention. Dependencies arrive as parameters (method injection). Return values can be data for the caller, new messages to dispatch, or both at once. The project ships HTTP adapters (`WolverineFx.Http`), persistence integrations (including Marten and EF Core), and documentation that treats messaging as the default path, not an afterthought.

If you only know MediatR, think of Wolverine as the piece that could replace MediatR *and* sit in the same slot where you would plug MassTransit consumers, with less ceremony around types and registration.

## The handler model: no interfaces, static methods, method injection

MediatR leans on interfaces. You implement `IRequestHandler<TRequest, TResponse>` (or the async variant), inject dependencies through the constructor, and implement `Handle`. It works. It is also a lot of boilerplate for small features.

Wolverine discovers handler types in your assemblies. A common pattern is a static method named `Handle` on a plain class. Parameters after the message are resolved from the service provider, same as constructor injection, except per call. No `IRequestHandler` implementation, no nested class per command unless you want one.

The playground uses that shape everywhere. Here is the message types file, thin records that travel between handlers:

```csharp
namespace AnimatLabs.WolverineMessaging.Messages;

public record CreateOrder(string Customer, string Product, int Quantity, decimal Total);
public record OrderCreated(Guid OrderId, string Customer, string Product, int Quantity, decimal Total);
public record NotifyWarehouse(Guid OrderId, string Product, int Quantity);
public record WarehouseNotified(Guid OrderId, DateTime NotifiedAt);
```

`CreateOrder` is the command from the API. `OrderCreated` is the domain-style event. `NotifyWarehouse` is a follow-up command, and `WarehouseNotified` closes the loop for logging.

## Cascading messages: tuples and automatic routing

The interesting bit is returning more than one outcome from a single handler. Wolverine can take a tuple return and treat each element as its own message to process. You do not manually enqueue the second leg. You return it.

`CreateOrderHandler` creates an order id, logs, builds an `OrderCreated` and a `NotifyWarehouse`, and returns both:

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

Wolverine routes `OrderCreated` to `OrderCreatedHandler` and `NotifyWarehouse` to `NotifyWarehouseHandler` without extra registration in this sample. That is cascading messaging in one line of control flow.

`OrderCreatedHandler` only logs the event:

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

`NotifyWarehouseHandler` returns a `WarehouseNotified` record so you can see a third hop in the pipeline:

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

Nothing here implements a framework interface. The framework connects the dots.

## MediatR vs Wolverine

Both libraries help you keep controllers thin and domain logic in one place. The differences show up in registration, cross-cutting features, and how far you want one product to carry messaging concerns.

| Concern | MediatR | Wolverine |
|--------|---------|-----------|
| Primary focus | In-process request/response and notifications | In-process and distributed messaging under one model |
| Handler shape | `IRequestHandler<,>` (or similar) | Conventional methods, often static `Handle` |
| Registration | Explicit handler registration or assembly scanning you configure | Convention-based discovery with optional attributes |
| Async messaging | Bring MassTransit, NServiceBus, or raw clients | Built-in bus abstractions; broker packages as needed |
| Transactional outbox | Community packages or roll your own | First-class with Marten, EF Core, and other stores |
| Pipeline behaviors | `IPipelineBehavior` | Middleware, policies, and attributes on handlers |
| Ecosystem size | Huge, battle-tested in CQRS tutorials | Smaller, younger, faster-moving |

MediatR is the safe default when your problem is strictly “call a handler from a controller.” Wolverine pulls ahead when you want cascading messages, fewer marker types, and one story that extends to queues without a second framework’s learning curve.

**Transactional outbox** is worth a separate sentence because it is where Wolverine stops being a cute mediator and becomes infrastructure. The idea is simple: persist your business data and your outbound messages in one transaction, then let a background process publish reliably. Wolverine supports that pattern through integrations with Marten and EF Core so you are not hand-rolling idempotency tables on day one. The GitHub sample does not turn on outbox code paths; treat it as a syntax demo. When you pair Wolverine with Marten in PostgreSQL, you get the combination Jeremy Miller’s stack is optimized for.

## Wiring it in `Program.cs`

The sample host is intentionally small. `UseWolverine()` hooks the messaging runtime into the generic host. `MapWolverineEndpoints()` exposes HTTP entry points that integrate with Wolverine. The POST route accepts a `CreateOrder` body, resolves `IMessageBus`, and invokes the pipeline asynchronously, returning the `OrderCreated` result to the client.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Host.UseWolverine();

var app = builder.Build();

app.MapWolverineEndpoints();

app.MapPost("/api/orders", (CreateOrder command, IMessageBus bus) =>
    bus.InvokeAsync<OrderCreated>(command));

app.Run();
```

NuGet references are `WolverineFx` and `WolverineFx.Http` on .NET 8. No per-handler registration block.

## Running the demo

From the [playground](https://github.com/animat089/playground) clone, the project folder is `WolverineMessaging/AnimatLabs.WolverineMessaging`:

```bash
cd WolverineMessaging/AnimatLabs.WolverineMessaging
dotnet run
```

The app listens on `http://localhost:5194` (see `launchSettings.json`). Create an order:

```bash
curl -X POST http://localhost:5194/api/orders ^
  -H "Content-Type: application/json" ^
  -d "{\"customer\":\"alice\",\"product\":\"Widget A\",\"quantity\":2,\"total\":49.98}"
```

On Linux or macOS, use the single-line `curl` with `\` continuations as in the project README. Watch the console: you should see three log lines in order: order created, event received, warehouse notified. One HTTP request triggered the cascade.

## When to migrate, when to stay with MediatR

**Stay with MediatR** if your architecture is stable, your team knows the patterns cold, and you only need occasional publishes through MassTransit. Replacing working code for its own sake rarely pays. MediatR’s pipeline behaviors and huge sample ecosystem are hard to give up if you rely on them everywhere.

**Plan a move toward Wolverine** if you are already touching both MediatR and a bus layer, you want fewer types and less registration noise, or you are starting a greenfield service where transactional outbox and Marten are on the table. Wolverine shines when you want one handler model from API to queue and you are willing to adopt a smaller community and faster release cadence.

**Hybrid reality:** many teams will keep MediatR in older modules and introduce Wolverine only in new boundaries. That is fine. The playground here is a learning slice, not a mandate to rewrite production overnight.

## Wolverine and Marten together

For durable projections, document storage, and transactional outbox in PostgreSQL, Wolverine and Marten are designed to work together. I cover Marten as a document database and event store in a companion piece: **[Marten: PostgreSQL as Document DB + Event Store](https://animatlabs.com/technical/marten-postgresql-as-document-db-event-store/)**. Read that if you want the persistence side of the same ecosystem, then wire Wolverine’s outbox and handler discovery on top.

---

Wolverine will not replace every MediatR installation tomorrow. It does give you a credible way to stop juggling two frameworks when your real problem is “handle this message, here, and also over there, reliably.” If you try the sample and the logs line up the way mine did, you will know the model clicked.

*Tried Wolverine alongside MediatR or MassTransit? I would like to hear what you kept and what you dropped in the comments.*

<!--
LinkedIn promo (May 2026):
New post: I Replaced MediatR and MassTransit with Wolverine. One handler model for in-process work and messaging, cascading tuples, minimal Program.cs. Code on GitHub. #dotnet #wolverine #mediatr #messaging #cqrs
-->
