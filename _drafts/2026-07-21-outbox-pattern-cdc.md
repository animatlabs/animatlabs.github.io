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

Picture a checkout service. A payment clears, you insert the order row, and the next line of code fires `OrderPaid` to Kafka so inventory and shipping can react.

The process dies after `SaveChanges` and before the publish. You have money captured and a fulfilled-looking database, but downstream never heard about it.

Flip it: the message goes out, then the DB write rolls back. Now subscribers are acting on an order that doesn't exist.

That's the dual-write problem in a form you'll actually see in production. Your database and your broker don't share a transaction boundary. Your code can try to be careful; the failure modes stay ugly.

I've debugged reconciliation jobs that only existed because someone published before persisting, or persisted without publishing. The fixes are never a one-line change. You end up with compensating transactions, manual republish scripts, and hoping nobody adds another `PublishAsync` in the wrong place.

## The pattern that looks fine until it's not

The dangerous version is any code path that does two independent commits in sequence:

```csharp
await _dbContext.SaveChangesAsync();
await _messageBus.PublishAsync(orderPaidEvent);
```

If anything interrupts that gap, you get skew. Retries make it worse: the publisher might succeed while the app thinks it failed, so you double-send. There's no single "atomic" story across SQL Server or PostgreSQL and Kafka without a bridge.

## Outbox: one transaction, two inserts

The transactional outbox fixes this by keeping the domain row and the event you want to fan out in the same database transaction. You stop calling the message bus from the request thread. You append a row to an `outbox` table next to your business tables.

Either both commit, or neither does. Something else moves rows from `outbox` into the broker. That's where CDC or polling comes in.

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

Debezium reads the database log and turns inserts on `outbox` into Kafka records. I like keeping the API dumb: write data, write outbox, commit.

The sample repo is a minimal ASP.NET Core API on PostgreSQL, one endpoint that creates an order and an outbox row under one explicit transaction.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/OutboxPattern){: .btn .btn--primary}

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

`aggregate_type` and `event_type` give you topic routing without peeling JSON apart first. `payload` is the serialized body here (JSON). `aggregate_id` is what I'd key on for consumer ordering and dedup.

## EF Core: explicit transaction, order first, then outbox

I kept the implementation boring on purpose: `BeginTransactionAsync` wraps both `SaveChangesAsync` calls so the order row exists before the outbox row references it. The outbox `AggregateId` uses the generated order id.

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

`Program.cs` has the transactional endpoint:

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

Same pattern fits a domain service and repository layer. What matters is one transaction spanning both writes; if you refactor, keep that.

## CDC versus polling

Polling usually means a worker `SELECT ... FROM outbox WHERE ... FOR UPDATE SKIP LOCKED` (or similar), publish, then mark processed or delete the row. It's simple to reason about and works everywhere.

Latency is typically seconds unless you hammer the database. You own backoff, locking, and poison-message behavior.

Some teams add a `processed_at` column and sweep stale rows for alerts. Others delete on success so the table stays small.

Both are fine. The database stays the source of truth until Kafka acknowledges the handoff, however you define "done."

CDC (Debezium on PostgreSQL with `pgoutput`) watches the WAL. Inserts to `outbox` show up as change events quickly, often sub-second.

You pay in ops: replication slots, connector upgrades, schema history topics. For customer-facing paths or tight SLAs, I'd reach for CDC first. For internal noise or low volume, polling is often enough.

You're not picking a religion forever. I've shipped a poller first, then swapped to Debezium when latency started to hurt. Application code didn't change either time; the outbox table was already there.

The repo’s `docker-compose` sets `wal_level=logical` so PostgreSQL is ready for a connector when you are.

## Debezium outbox connector (sketch)

I still use the stock PostgreSQL connector, then bolt on Debezium's `EventRouter` so Kafka gets domain-shaped messages instead of naked table tuples. Tweak names and hostnames for your deployment. Same overall shape as the [CDC post](/technical/.net/data%20engineering/cdc-debezium-kafka/) pipeline, except the interesting table is `outbox`, not only `orders`.

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

Wire this into the same Kafka Connect stack described in the CDC article. Compose, topics, and first connector registration live in that walkthrough; I stayed on the outbox side here.

## Consumer idempotency (short version)

At-least-once delivery is the realistic assumption; your handler has to tolerate duplicates.

I usually track the outbox row `id` in a `processed_events` table and skip repeats. Or I'll use an idempotent upsert on business id so a redelivery does nothing harmful.

Either way, defensive handlers beat trying to solve everything in the publisher.

Kafka-wise, stable keys help keep one aggregate ordered on one partition. That doesn't replace thinking through poison messages.

Ordering is its own headache. Per-aggregate ordering works when everything for that aggregate lands in one partition (keyed by `aggregate_id`). Global ordering across the system is rarely worth it.

I'd design handlers so a slightly late message still makes sense, or use version fields in the payload to spot staleness.

## What you get

Atomicity stops being fiction between the DB and the bus. Failures show up as "transaction didn't commit," not silent drift.

Replay gets easier too: the outbox row and the order row committed together, so you're not guessing which domain version spawned a given message.

If validation blows up after you've staged `Order` but before `CommitAsync`, nothing touches Kafka.

When the bus is down, my API can still take orders if the database is healthy; events catch up when CDC does. That's the decoupling I want.

You'll still watch replication lag and consumer lag. The outbox doesn't make distributed systems easy; it just kills a whole class of bugs between your write model and messaging.

If you're wiring the whole thing (Kafka, Connect, Debezium, PostgreSQL replication), I'd start here: [CDC post](/technical/.net/data%20engineering/cdc-debezium-kafka/). Point the connector at `outbox` when you're ready to move from "correct writes" to "events in the cluster."

---

*If you've shipped outbox in production, how did you handle connector upgrades and slot lag?*

<!--
LinkedIn promo:
Dual-write bugs are the kind that only show up under load or after a deploy. I wrote up how the transactional outbox plus CDC closes the gap between PostgreSQL and Kafka, with EF Core code and a Debezium EventRouter sketch. End-to-end stack steps are in the earlier CDC piece. Working sample: github.com/animat089/playground (OutboxPattern).
-->
