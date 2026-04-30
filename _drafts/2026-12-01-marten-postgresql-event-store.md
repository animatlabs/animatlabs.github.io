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

Most teams that grow a .NET stack end up with more than one database story. Postgres for operational data, MongoDB because iterating without migrations felt faster, EventStoreDB because someone insisted you need a “real” event store for audit or eventual consistency. Each choice made sense in isolation.

Together it’s ops overhead: backups, upgrades, connection strings everywhere, three mental models when production breaks. I’ve been on pager duty for that split. The root cause is rarely application code alone.

Marten won’t erase every reason to run a specialized database. For me it’s the path I’d take to fold document-style storage and event sourcing into the Postgres I’m already running. One library, one instance, documents and streams in one transaction when I need both.

## What Marten actually is

[Marten](https://martendb.io/) maps C# types to PostgreSQL. Documents live as JSON with LINQ queries. Events live in append-only streams with versioning and projections into read models.

Underneath it’s still Postgres. Replication, backups, and monitoring stay the same.

I use `IDocumentSession` when I want load/save documents. I use the event pipeline when the truth is a sequence of domain events. This sample is mostly the event path; the document path is the same registration plus a few lines in a handler.

```csharp
public record CustomerProfile(Guid Id, string DisplayName);

app.MapPost("/demo/customers", async (IDocumentSession session) =>
{
    session.Store(new CustomerProfile(Guid.NewGuid(), "Ada"));
    await session.SaveChangesAsync();
    return Results.Ok();
});
```

`Store` writes JSON into Marten’s tables; `Query<T>()` is LINQ over those documents, with indexes when table scans hurt. In dev, Marten can create or migrate schema so I’m not hand-writing DDL for a spike.

I’ll walk through the event half with a tiny order API.

## Domain events

Event sourcing starts with plain records for what happened. The demo has four order lifecycle events: placed, confirmed, shipped, cancelled. Enough to replay history and feed a projection; nothing cute.

```csharp
namespace AnimatLabs.MartenEventStore.Events;

public record OrderPlaced(Guid OrderId, string Customer, string Product, int Quantity, decimal Total);
public record OrderConfirmed(Guid OrderId, DateTime ConfirmedAt);
public record OrderShipped(Guid OrderId, string TrackingNumber, DateTime ShippedAt);
public record OrderCancelled(Guid OrderId, string Reason, DateTime CancelledAt);
```

I keep event types past tense. Logs read cleaner, and it’s obvious I’m recording facts, not commands.

## Wiring Marten in `Program.cs`

Registration is one `AddMarten` call. I read `ConnectionStrings:Postgres` from `appsettings.json` (`localhost:5434` to match Docker), register an inline projection (next section), and wire minimal APIs for the happy path.

```csharp
builder.Services.AddMarten(opts =>
{
    opts.Connection(connectionString);
    opts.Projections.Add<OrderSummaryProjection>(ProjectionLifecycle.Inline);
});
```

`ProjectionLifecycle.Inline` updates the read model in the same transaction as the event commit, so `OrderSummary` stays aligned with the stream with no worker. I’d reach for async daemons when volume grows; inline is enough to learn and for quiet domains.

## Starting a stream and appending events

Placing an order mints a stream id, emits `OrderPlaced`, persists. `StartStream<OrderSummary>` links the stream to the projection document type Marten should build.

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

Confirm, ship, and cancel append to the same stream id, one event each. No merge graphs, just ordered facts.

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

Squint and it’s a service layer in twenty lines. The fun is what happens when those events land.

## Projection: `SingleStreamProjection` for `OrderSummary`

`OrderSummary` is what I return from HTTP: denormalized fields for UI or reporting, plus `Version` if I want optimistic concurrency later.

`OrderSummaryProjection` extends `SingleStreamProjection<OrderSummary>`. Marten uses `Create` for the stream’s first event and `Apply` per event type. New event type: new `Apply`, deploy, old streams still replay.

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

I didn’t write insert SQL, didn’t micromanage version columns on every table, didn’t spin up a projector service for this demo. Marten projects events into `OrderSummary` documents like any other Marten document.

## API surface

Commands and reads match how I’d hit the API from curl or a UI. The other POSTs (`/confirm`, `/ship`, `/cancel`) follow the same shape as the snippets above.

| Method | Route | Purpose |
|--------|--------|---------|
| POST | `/api/orders` | Place order, start stream |
| GET | `/api/orders/{id}` | Load `OrderSummary` |
| GET | `/api/orders/{id}/events` | Raw stream for debugging |

`IQuerySession` on the GET handlers keeps reads cheap (no change tracking).

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

The sample is in `MartenEventStore` in my `playground` repo (button above).

Wherever `docker-compose.yml` lands in your checkout, start Postgres from that folder:

```bash
docker compose up -d
```

Host port `5434` maps to Postgres `5432`, database `marten_demo`, user/password `postgres`/`postgres` to match `appsettings.json`.

`Properties/launchSettings.json` has an `http` profile on `http://localhost:5192`. From the `AnimatLabs.MartenEventStore` folder next to `docker-compose.yml`:

```bash
cd AnimatLabs.MartenEventStore
dotnet run
```

Create an order (change the URL if you moved ports):

```bash
curl -s -X POST http://localhost:5192/api/orders -H "Content-Type: application/json" -d "{\"customer\":\"Ada\",\"product\":\"Keyboard\",\"quantity\":1,\"total\":129.00}"
```

Grab `orderId` from the response, swap it into `{orderId}`, then confirm, ship, or peek at the stream:

```bash
curl -s -X POST http://localhost:5192/api/orders/{orderId}/confirm
curl -s -X POST http://localhost:5192/api/orders/{orderId}/ship -H "Content-Type: application/json" -d "{\"trackingNumber\":\"1Z999\"}"
curl -s http://localhost:5192/api/orders/{orderId}
curl -s http://localhost:5192/api/orders/{orderId}/events
```

404 from `LoadAsync` usually means a different DB than Marten wrote to, or you’re querying before a successful POST. Inline projections run on save, so a successful POST should leave something to read back.

## When Marten fits, when I’d skip it

I reach for it when I’m already on Postgres, the team knows that stack, and I want one place for JSON documents and append-only streams. Configuration as documents, audit as events, screens off projections, one transaction when I need it, that’s the shape I care about.

I’d push back if everything is EF Core everywhere and nobody wants event semantics. Marten next to EF is fine; two persistence stories in one service still taxes people. Heavy ad hoc reporting across relational stars sometimes belongs in a warehouse no matter what I use for the app.

If stream writes outgrow a single Postgres primary, dedicated event infrastructure can still win. I’m trading ops surface for headroom. For C# teams already on Postgres who want history without a second cluster just for events, Marten’s the bet I’d make.

## Wolverine in one paragraph

When I outgrow in-process minimal APIs, [Wolverine](https://wolverinefx.net/) is where I’d wire commands, retries, and brokers while Marten keeps owning documents and events. I don’t need it to learn Marten; I need it when the boundary stops being “this process.”

---

Marten won’t save a fuzzy domain model or absent tests. It does give me a direct line from domain events to Postgres without provisioning another database purely for events. If that’s the direction you’re heading, the demo’s a cheap place to spike streams and projections before a bigger rollout.

<!--
LinkedIn: Marten puts document storage and event streams on PostgreSQL so you can retire the Mongo + EventStoreDB + Postgres triangle for many .NET services. New post walks through domain events, inline SingleStreamProjection, minimal APIs, and docker-compose. Repo linked in the article. #dotnet #postgresql #eventsourcing #marten
-->
