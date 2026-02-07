---
title: "I Replaced MediatR and MassTransit with Wolverine"
excerpt: >-
  "One library for in-process mediation AND async messaging. Wolverine unifies what used to take two frameworks."
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
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Two-Framework Problem

Most .NET projects use MediatR for in-process command/query handling and MassTransit (or NServiceBus) for async messaging. That's two frameworks, two patterns, and duplicated infrastructure.

Wolverine combines both into one coherent library.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. What is Wolverine (from Jeremy Miller, Marten author)
2. How it differs from MediatR
3. Built-in messaging (no separate framework needed)
4. Transactional outbox included
5. Migration path from MediatR
6. Performance comparison

CODE EXAMPLES:
- Handler without marker interfaces
- Built-in messaging to RabbitMQ/Azure Service Bus
- Transactional outbox
- Saga/workflow support
- Migrating from MediatR handlers
-->

## What Is Wolverine?

<!-- TODO: Jeremy Miller, Marten integration, unified approach -->

## Wolverine vs MediatR

| Feature | MediatR | Wolverine |
|---------|---------|-----------|
| In-process messaging | ✅ | ✅ |
| Async messaging (RabbitMQ, etc.) | ❌ | ✅ |
| Transactional outbox | ❌ | ✅ |
| Marker interfaces required | ✅ | ❌ |
| Code generation | ❌ | ✅ |
| Built-in DI | ❌ | ✅ |

## The Handler Model

```csharp
// MediatR way - requires interfaces
public class CreateOrderHandler : IRequestHandler<CreateOrderCommand, OrderId>
{
    public Task<OrderId> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        // ...
    }
}

// Wolverine way - no interfaces needed!
public static class CreateOrderHandler
{
    public static OrderId Handle(CreateOrderCommand command, IOrderRepository repo)
    {
        // Method injection, code generation handles the rest
    }
}
```

## Built-in Messaging

```csharp
// Send to RabbitMQ/Azure Service Bus - same handler model
public static async Task Handle(
    OrderCreated @event,
    IMessageContext context)
{
    // Process the event
    // Optionally send more messages
    await context.SendAsync(new NotifyCustomer(@event.CustomerId));
}
```

## Transactional Outbox (Built-in!)

```csharp
// TODO: Outbox configuration
// TODO: Guaranteed message delivery
```

## Migrating from MediatR

```csharp
// TODO: Step-by-step migration
// TODO: Handler conversion
// TODO: Pipeline behavior equivalent
```

## Performance

<!-- TODO: Benchmark comparison, code generation benefits -->

## Conclusion

<!-- TODO: Simplify your stack with Wolverine -->

---

*Tried Wolverine in your projects? Share your experience in the comments!*
