---
title: "Marten: PostgreSQL as Document DB + Event Store"
excerpt: >-
  Stop juggling MongoDB, EventStoreDB, and Postgres for one product. Marten layers document storage and append-only event streams on PostgreSQL, with ACID transactions and LINQ over JSON.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Marten
  - PostgreSQL
  - Event Sourcing
  - Document Database
  - Event Store
author: animat089
last_modified_at: 2026-05-04
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Most teams that grow a .NET stack end up with more than one database story. You might keep operational data in PostgreSQL, shove flexible blobs into MongoDB for fast iteration, and stand up EventStoreDB because someone said you need a “real” event store for auditing or eventual consistency. Each choice made sense in isolation. Together they are ops overhead: backups, upgrades, connection strings in every service, and three different mental models when you debug production. I have been on pager duty for that kind of split, and the root cause is rarely the application code alone.

Marten does not remove every reason to run specialized databases. It does give you a credible way to collapse document-oriented storage and event sourcing onto the database you probably already run in production. One library, one PostgreSQL instance, two ways of modeling data, with transactions that span both.

## What Marten actually is

[Marten](https://martendb.io/) is a .NET library that maps C# types to PostgreSQL. For documents, it stores JSON in tables and lets you query with LINQ. For events, it maintains append-only streams, versioning, and projections that turn those streams into read models. It is still Postgres at the storage level: replication, backups, and monitoring stay familiar.

The mental model is simple. You pick `IDocumentSession` when you want to load and save whole documents, or you use the event pipeline when the source of truth should be a sequence of domain events. The sample focuses on the event side, but the document path is the same registration plus a few lines in a handler.

```csharp
public record CustomerProfile(Guid Id, string DisplayName);

app.MapPost("/demo/customers", async (IDocumentSession session) =>
{
    session.Store(new CustomerProfile(Guid.NewGuid(), "Ada"));
    await session.SaveChangesAsync();
    return Results.Ok();
});
```

`Store` persists JSON in Marten-managed tables. `Query<T>()` gives you LINQ over those documents, including indexes you define when you outgrow table scans. On first connect, Marten can create or migrate the schema for you in development, which keeps spikes like this one focused on behavior instead of hand-written DDL. The rest of this article walks through the event half using a tiny order API.

## Domain events

Event sourcing starts with plain records that describe what happened. The demo defines four events for an order lifecycle: placed, confirmed, shipped, and cancelled. Nothing clever, just enough structure to replay history and drive a projection.

```csharp
namespace AnimatLabs.MartenEventStore.Events;

public record OrderPlaced(Guid OrderId, string Customer, string Product, int Quantity, decimal Total);
public record OrderConfirmed(Guid OrderId, DateTime ConfirmedAt);
public record OrderShipped(Guid OrderId, string TrackingNumber, DateTime ShippedAt);
public record OrderCancelled(Guid OrderId, string Reason, DateTime CancelledAt);
```

Naming matters. Past-tense types read well in logs and make it obvious you are recording facts, not issuing commands.

## Wiring Marten in `Program.cs`

Registration is a single `AddMarten` call. The sample reads `ConnectionStrings:Postgres` from `appsettings.json`, which points at `localhost:5434` so it matches the Docker port mapping. It registers an inline projection (more on that next) and exposes minimal API endpoints for the happy path.

```csharp
builder.Services.AddMarten(opts =>
{
    opts.Connection(connectionString);
    opts.Projections.Add<OrderSummaryProjection>(ProjectionLifecycle.Inline);
});
```

`ProjectionLifecycle.Inline` means each time events are committed, Marten updates the read model in the same transaction. That keeps `OrderSummary` consistent with the stream without a separate worker process. For heavier workloads you would move to async daemons, but inline is ideal for learning and for low-volume domains.

## Starting a stream and appending events

Creating an order generates a new stream id, raises `OrderPlaced`, and persists it. `StartStream<OrderSummary>` ties the stream identity to the projection document type so Marten knows which aggregate shape to build.

```csharp
app.MapPost("/api/orders", async (PlaceOrderRequest req, IDocumentSession session) =>
{
    var orderId = Guid.NewGuid();
    var placed = new OrderPlaced(orderId, req.Customer, req.Product, req.Quantity, req.Total);
    session.Events.StartStream<OrderSummary>(orderId, placed);
    await session.SaveChangesAsync();
    return Results.Ok(new { orderId });
});
```

Later transitions append to the same stream id. Confirm, ship, and cancel each add one more event. No ORM merge graphs, just ordered facts.

```csharp
app.MapPost("/api/orders/{id}/confirm", async (Guid id, IDocumentSession session) =>
{
    session.Events.Append(id, new OrderConfirmed(id, DateTime.UtcNow));
    await session.SaveChangesAsync();
    return Results.Ok();
});

app.MapPost("/api/orders/{id}/ship", async (Guid id, ShipRequest req, IDocumentSession session) =>
{
    session.Events.Append(id, new OrderShipped(id, req.TrackingNumber, DateTime.UtcNow));
    await session.SaveChangesAsync();
    return Results.Ok();
});

app.MapPost("/api/orders/{id}/cancel", async (Guid id, CancelRequest req, IDocumentSession session) =>
{
    session.Events.Append(id, new OrderCancelled(id, req.Reason, DateTime.UtcNow));
    await session.SaveChangesAsync();
    return Results.Ok();
});
```

If you squint, this is your application service layer in twenty lines. The interesting part is what happens when those events land.

## Projection: `SingleStreamProjection` for `OrderSummary`

`OrderSummary` is the read model you query from HTTP. It holds denormalized fields for UI or reporting plus a `Version` Marten can maintain for optimistic concurrency if you extend the sample.

`OrderSummaryProjection` subclasses `SingleStreamProjection<OrderSummary>`. Marten discovers `Create` for the first event in a stream and `Apply` overloads for each subsequent type. That pattern scales: add a new event, add an `Apply`, deploy, and historical streams still replay correctly.

```csharp
public class OrderSummary
{
    public Guid Id { get; set; }
    public string Customer { get; set; } = "";
    public string Product { get; set; } = "";
    public int Quantity { get; set; }
    public decimal Total { get; set; }
    public string Status { get; set; } = "placed";
    public string? TrackingNumber { get; set; }
    public int Version { get; set; }
}

public class OrderSummaryProjection : SingleStreamProjection<OrderSummary>
{
    public OrderSummary Create(OrderPlaced e)
    {
        return new OrderSummary
        {
            Id = e.OrderId,
            Customer = e.Customer,
            Product = e.Product,
            Quantity = e.Quantity,
            Total = e.Total,
            Status = "placed"
        };
    }

    public void Apply(OrderConfirmed e, OrderSummary view)
    {
        view.Status = "confirmed";
    }

    public void Apply(OrderShipped e, OrderSummary view)
    {
        view.Status = "shipped";
        view.TrackingNumber = e.TrackingNumber;
    }

    public void Apply(OrderCancelled e, OrderSummary view)
    {
        view.Status = "cancelled";
    }
}
```

Notice what you did not write: hand-rolled SQL for inserts, manual version columns for every table, or a separate projector service for this demo. Marten connects the dots from events to `OrderSummary` documents stored like any other Marten document.

## API surface

The sample exposes commands and reads that line up with how you would exercise the system from curl or a frontend.

| Method | Route | Purpose |
|--------|--------|---------|
| POST | `/api/orders` | Place order, start stream |
| POST | `/api/orders/{id}/confirm` | Confirm |
| POST | `/api/orders/{id}/ship` | Ship with tracking number |
| POST | `/api/orders/{id}/cancel` | Cancel with reason |
| GET | `/api/orders/{id}` | Load `OrderSummary` |
| GET | `/api/orders/{id}/events` | Inspect raw stream for debugging |
| GET | `/api/orders` | List all summaries |

The GET handlers use `IQuerySession`, which is read-optimized and avoids tracking overhead.

```csharp
app.MapGet("/api/orders/{id}", async (Guid id, IQuerySession session) =>
{
    var summary = await session.LoadAsync<OrderSummary>(id);
    return summary is null ? Results.NotFound() : Results.Ok(summary);
});

app.MapGet("/api/orders/{id}/events", async (Guid id, IQuerySession session) =>
{
    var events = await session.Events.FetchStreamAsync(id);
    return Results.Ok(events.Select(e => new { e.EventTypeName, e.Timestamp, Data = e.Data }));
});

app.MapGet("/api/orders", async (IQuerySession session) =>
{
    var orders = await session.Query<OrderSummary>().ToListAsync();
    return Results.Ok(orders);
});
```

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/MartenEventStore){: .btn .btn--primary}

## Run the demo

The sample lives in the `MartenEventStore` folder of the `playground` repository (see the GitHub button below). If you work inside a larger monorepo, that same folder may appear as `playground/MartenEventStore`. Wherever your checkout puts `docker-compose.yml`, start Postgres from that directory:

```bash
docker compose up -d
```

The compose file maps host port `5434` to Postgres `5432`, creates database `marten_demo`, and uses user/password `postgres`/`postgres`, which matches the connection string bundled in `appsettings.json`.

The `http` profile in `Properties/launchSettings.json` binds to `http://localhost:5192`. Run the API from the `AnimatLabs.MartenEventStore` project folder next to `docker-compose.yml`:

```bash
cd AnimatLabs.MartenEventStore
dotnet run
```

Create an order (replace the URL if you changed ports):

```bash
curl -s -X POST http://localhost:5192/api/orders -H "Content-Type: application/json" -d "{\"customer\":\"Ada\",\"product\":\"Keyboard\",\"quantity\":1,\"total\":129.00}"
```

Copy `orderId` from the JSON response, substitute it for `{orderId}` below, then confirm, ship, or inspect the stream:

```bash
curl -s -X POST http://localhost:5192/api/orders/{orderId}/confirm
curl -s -X POST http://localhost:5192/api/orders/{orderId}/ship -H "Content-Type: application/json" -d "{\"trackingNumber\":\"1Z999\"}"
curl -s http://localhost:5192/api/orders/{orderId}
curl -s http://localhost:5192/api/orders/{orderId}/events
```

If `LoadAsync` returns 404, check that you are hitting the same database Marten just wrote to and that the projection finished (inline projections run on save, so a successful POST should always leave a row you can read back).

## When Marten fits, and when it does not

Marten shines when you want one operational database, team comfort with PostgreSQL, and .NET types end to end. It is a strong fit for bounded contexts where documents and events coexist: store configuration as JSON, emit events for audit, project read models for screens, all with transactional guarantees. You also benefit when you already run Postgres in Kubernetes or on a managed service and do not want another vendor in the blast radius.

It is a weaker default when your organization standardized on EF Core for every relational model and you have no appetite for event-driven design. Marten can sit beside EF, but two persistence models in one service adds cognitive load. Purely relational reporting with heavy ad hoc SQL may still be easier in raw SQL or a dedicated warehouse than in JSON documents, though Marten exposes enough SQL escape hatches for many reporting needs.

If you need extreme write throughput on streams beyond what a single Postgres primary can sustain, purpose-built event infrastructure might still win. The usual tradeoff is operational complexity versus ceiling. Marten’s sweet spot is a team that already runs PostgreSQL, is productive in C#, and wants append-only history without provisioning a second cluster for events alone.

## Wolverine in one paragraph

If you adopt message-driven workflows, [Wolverine](https://wolverinefx.net/) pairs naturally with Marten. Wolverine handles command handling, retries, and integration with external brokers while Marten remains the persistence engine for documents and events. You keep the storage story unified and push cross-service choreography to the messaging layer where it belongs. You do not need Wolverine to learn Marten, but it is the idiomatic next step when your boundaries stop being in-process minimal APIs.

---

Marten will not fix unclear domain boundaries or missing tests. It will give you a straight path from domain events to PostgreSQL without standing up a second database for events alone. If that matches where your architecture is headed, the demo project is a small sandbox to spike streams, projections, and queries before you commit to a wider rollout.

<!--
LinkedIn: Marten puts document storage and event streams on PostgreSQL so you can retire the Mongo + EventStoreDB + Postgres triangle for many .NET services. New post walks through domain events, inline SingleStreamProjection, minimal APIs, and docker-compose. Repo linked in the article. #dotnet #postgresql #eventsourcing #marten
-->
