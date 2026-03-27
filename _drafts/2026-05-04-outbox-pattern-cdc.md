---
title: "Transactional Outbox with CDC: Never Lose an Event"
excerpt: >-
  The dual-write problem quietly breaks event-driven systems. The outbox pattern plus CDC keeps your domain writes and your published events aligned.
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - .NET
  - Outbox Pattern
  - CDC
  - Debezium
  - Event-Driven
  - Distributed Systems
  - Messaging
author: animat089
last_modified_at: 2026-05-04
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Picture a checkout service. A payment clears, you insert the order row, and the next line of code fires `OrderPaid` to Kafka so inventory and shipping can react. The process dies after `SaveChanges` and before the publish. You have money captured and a fulfilled-looking database, but downstream never heard about it. Flip the failure around: the message goes out, then the DB write rolls back. Now you have subscribers acting on an order that does not exist.

That is the dual-write problem in a form you will actually see in production. Two different systems (your database and your broker) do not share a transaction boundary. Your code can try to be careful; the failure modes stay ugly.

I have debugged reconciliation jobs that existed only because someone published before persisting, or persisted without publishing. The fixes are never a one-line change. You end up with compensating transactions, manual republish scripts, and trust in your team that nobody will add another `PublishAsync` in the wrong place.

## The pattern that looks fine until it is not

The dangerous version is any code path that does two independent commits in sequence:

```csharp
await _dbContext.SaveChangesAsync();
await _messageBus.PublishAsync(orderPaidEvent);
```

If anything interrupts that gap, you get skew. Retries make it worse: the publisher might succeed while the app thinks it failed, so you double-send. There is no single "atomic" story across SQL Server or PostgreSQL and Kafka without a bridge.

## Outbox: one transaction, two inserts

The transactional outbox fixes this by keeping the side effect you care about (the domain row) and the notification you want to fan out (the event) in the same database transaction. You stop calling the message bus from the request thread. You append a row to an `outbox` table next to your business tables. Either both commit, or neither does.

Something else is responsible for moving rows from `outbox` into the broker. That is where CDC or polling comes in.

```
┌─────────────────────────────────────────┐
│           Single DB transaction          │
│  ┌─────────────┐      ┌───────────────┐  │
│  │   orders    │      │    outbox     │  │
│  │   (domain)  │      │   (events)    │  │
│  └─────────────┘      └───────────────┘  │
└─────────────────────────────────────────┘
                    │
                    │  logical decoding / poller
                    ▼
              ┌───────────┐
              │   Kafka   │
              └───────────┘
```

Debezium reads the database log and turns inserts on `outbox` into Kafka records. Your API stays dumb and fast: write data, write outbox, commit.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/OutboxPattern){: .btn .btn--primary}

The sample in the repo is a minimal ASP.NET Core API against PostgreSQL: one endpoint creates an order and an outbox row under an explicit transaction.

## PostgreSQL schema

The playground maps two tables. Domain data lives in `orders`; events live in `outbox` with enough metadata for routing and idempotency on the consumer side.

```sql
CREATE TABLE orders (
    id              SERIAL PRIMARY KEY,
    customer        TEXT NOT NULL,
    product         TEXT NOT NULL,
    quantity        INT NOT NULL,
    total_amount    NUMERIC(10,2) NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox (
    id              UUID PRIMARY KEY,
    aggregate_type  TEXT NOT NULL,
    aggregate_id    TEXT NOT NULL,
    event_type      TEXT NOT NULL,
    payload         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`aggregate_type` and `event_type` give you topic or subject routing without parsing JSON first. `payload` holds the serialized event body (JSON in the sample). `aggregate_id` ties back to the business key consumers use for ordering and deduplication.

## EF Core: explicit transaction, order first, then outbox

The implementation is intentionally boring. `BeginTransactionAsync` wraps both `SaveChangesAsync` calls so the order row exists before the outbox row references it. The outbox `AggregateId` uses the generated order id.

Entities and mapping live in `AppDbContext.cs`:

```csharp
public class AppDbContext : DbContext
{
    public AppDbContext(DbContextOptions<AppDbContext> options) : base(options) { }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<OutboxEvent> Outbox => Set<OutboxEvent>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Order>(e =>
        {
            e.ToTable("orders");
            e.HasKey(o => o.Id);
            e.Property(o => o.Id).HasColumnName("id");
            e.Property(o => o.Customer).HasColumnName("customer");
            e.Property(o => o.Product).HasColumnName("product");
            e.Property(o => o.Quantity).HasColumnName("quantity");
            e.Property(o => o.TotalAmount).HasColumnName("total_amount").HasColumnType("decimal(10,2)");
            e.Property(o => o.Status).HasColumnName("status").HasDefaultValue("pending");
            e.Property(o => o.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        });

        modelBuilder.Entity<OutboxEvent>(e =>
        {
            e.ToTable("outbox");
            e.HasKey(o => o.Id);
            e.Property(o => o.Id).HasColumnName("id");
            e.Property(o => o.AggregateType).HasColumnName("aggregate_type");
            e.Property(o => o.AggregateId).HasColumnName("aggregate_id");
            e.Property(o => o.EventType).HasColumnName("event_type");
            e.Property(o => o.Payload).HasColumnName("payload");
            e.Property(o => o.CreatedAt).HasColumnName("created_at").HasDefaultValueSql("now()");
        });
    }
}

public class Order
{
    public int Id { get; set; }
    public string Customer { get; set; } = "";
    public string Product { get; set; } = "";
    public int Quantity { get; set; }
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = "pending";
    public DateTime CreatedAt { get; set; }
}

public class OutboxEvent
{
    public Guid Id { get; set; }
    public string AggregateType { get; set; } = "";
    public string AggregateId { get; set; } = "";
    public string EventType { get; set; } = "";
    public string Payload { get; set; } = "";
    public DateTime CreatedAt { get; set; }
}
```

The API endpoint in `Program.cs` shows the transaction boundaries:

```csharp
app.MapPost("/api/orders", async (OrderRequest req, AppDbContext db) =>
{
    await using var tx = await db.Database.BeginTransactionAsync();

    var order = new Order
    {
        Customer = req.Customer,
        Product = req.Product,
        Quantity = req.Quantity,
        TotalAmount = req.TotalAmount
    };

    db.Orders.Add(order);
    await db.SaveChangesAsync();

    var outboxEvent = new OutboxEvent
    {
        Id = Guid.NewGuid(),
        AggregateType = "Order",
        AggregateId = order.Id.ToString(),
        EventType = "OrderCreated",
        Payload = JsonSerializer.Serialize(new
        {
            order.Id,
            order.Customer,
            order.Product,
            order.Quantity,
            order.TotalAmount,
            order.Status
        })
    };

    db.Outbox.Add(outboxEvent);
    await db.SaveChangesAsync();
    await tx.CommitAsync();

    return Results.Ok(new { order.Id, order.Status, OutboxEventId = outboxEvent.Id });
});
```

Same pattern works with a domain service and repository layer; the important part is one transaction spanning both writes. If you refactor, keep that guarantee.

## CDC versus polling

Polling means a worker `SELECT ... FROM outbox WHERE ... FOR UPDATE SKIP LOCKED` (or similar), publish, then mark processed or delete the row. It is simple to reason about and works everywhere. Latency is usually seconds unless you hammer the database. You also own backoff, locking, and poison-message behavior.

Some teams add a `processed_at` column and sweep stale rows for alerts. Others delete on success so the table stays small. Both are fine. The shared idea is that the database remains the source of truth until Kafka acknowledges the handoff in whatever way you define "done."

CDC (Debezium on PostgreSQL with `pgoutput`) watches the WAL. Inserts to `outbox` show up as change events quickly, often sub-second. You trade operational complexity: replication slots, connector upgrades, and schema history topics. For anything customer-facing or with tight SLAs, CDC is the usual pick. For internal notifications or low volume, polling can be enough.

You are not picking a religion forever. I have seen services start with a poller to ship something, then swap to Debezium when traffic or coupling made latency visible. The application code does not change when you make that switch. The outbox table is already there.

The repo’s `docker-compose` sets `wal_level=logical` so PostgreSQL is ready for a connector when you are.

## Debezium outbox connector (sketch)

You still use the PostgreSQL connector. You add Debezium’s `EventRouter` transform so Kafka messages look like domain events instead of raw table tuples. Names and hostnames should match your deployment; this mirrors the shape of the [CDC post](/2026/04/20/cdc-debezium-kafka/) pipeline while targeting `outbox` instead of only `orders`.

```json
{
  "name": "outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "postgres",
    "database.dbname": "outbox_demo",
    "topic.prefix": "outboxdemo",
    "table.include.list": "public.outbox",
    "plugin.name": "pgoutput",
    "slot.name": "outbox_slot",
    "publication.name": "outbox_pub",
    "schema.history.internal.kafka.bootstrap.servers": "kafka:29092",
    "schema.history.internal.kafka.topic": "outbox-schema-changes",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.route.by.field": "aggregate_type",
    "transforms.outbox.route.topic.replacement": "outbox.${routedByValue}",
    "transforms.outbox.table.field.event.id": "id",
    "transforms.outbox.table.field.event.key": "aggregate_id",
    "transforms.outbox.table.field.event.type": "event_type",
    "transforms.outbox.table.field.event.payload": "payload"
  }
}
```

Wire this into the same Kafka Connect stack described in the CDC article. Full stack setup (Compose, topics, first connector registration) is there so this post stays focused on the outbox side.

## Consumer idempotency (short version)

At-least-once delivery is the realistic assumption. Your handler must tolerate duplicates.

Common approaches: store a unique event id (the outbox row’s `id` is a natural choice) in a `processed_events` table and skip if seen; or use an idempotent upsert keyed by business id so a second delivery is a no-op. For Kafka, stable keys on published records help partition ordering for a single aggregate. None of that removes the need for defensive handlers.

Ordering is a separate headache. Per-aggregate ordering is achievable when all events for that aggregate land in one partition (keyed by `aggregate_id`). Global ordering across the whole system is usually not worth chasing. Design handlers so a slightly late message still makes sense, or detect staleness with version fields inside the payload.

## What you get

You stop lying to yourself about atomicity between the database and the bus. Failures surface as "transaction did not commit" instead of silent drift. You can replay from Kafka without guessing which domain version produced a message, because the outbox row and the order row committed together.

Rollback behavior is simple. If validation fails after you have staged the `Order` but before `CommitAsync`, nothing reaches Kafka. If the bus is down, your API can still take the order as long as the database is healthy; events flow when CDC catches up. That decoupling is the whole point.

You still monitor replication lag and consumer lag. The outbox does not delete distributed systems problems. It removes an entire class of consistency bugs between your write model and your first hop into messaging.

If you are building the full pipeline (Kafka, Connect, Debezium, PostgreSQL replication), start with the walkthrough that already exists for this blog: [CDC post](/2026/04/20/cdc-debezium-kafka/). Point the connector at `outbox` when you are ready to go from "correct writes" to "events in the cluster."

---

*If you have shipped outbox in production, how did you handle connector upgrades and slot lag?*

<!--
LinkedIn promo:
Dual-write bugs are the kind that only show up under load or after a deploy. I wrote up how the transactional outbox plus CDC closes the gap between PostgreSQL and Kafka, with EF Core code and a Debezium EventRouter sketch. Full stack steps link to the earlier CDC piece. Working sample: github.com/animat089/playground (OutboxPattern).
-->
