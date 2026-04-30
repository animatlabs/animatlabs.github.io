---
title: "CDC with Debezium and Kafka: PostgreSQL Changes to Typed .NET Events"
excerpt: >-
  Capture PostgreSQL row changes with Debezium, stream them through Apache Kafka, and turn them into typed .NET events without changing the application write path.
categories:
  - Technical
  - .NET
  - Data Engineering
tags:
  - .NET
  - CDC
  - Debezium
  - Kafka
  - PostgreSQL
  - Event Sourcing
  - Event Streaming
author: animat089
last_modified_at: 2026-04-27
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I had a PostgreSQL app where the write model was already fine. Orders were going into tables, the API was boring in the best possible way, and nobody wanted a rewrite.

The missing piece was downstream reactions:

- a read model that stays current when orders change
- search index updates without polling
- cross-service notifications that don't add writes inside the request

Marten and EventStoreDB are proper event stores. I like both in the right system.

But this app didn't need a new persistence model. I wanted a smaller move: keep PostgreSQL as the source of truth and listen to its write-ahead log.

That is what this sample does. Debezium reads the WAL, Kafka carries the change events, and a .NET consumer maps the raw envelope into `OrderCreated`, `OrderUpdated`, `OrderDeleted` output. Practical CDC for an existing relational app, not a replacement for event sourcing.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/CdcEventSourcing){: .btn .btn--primary}

## How It Fits Together

```
PostgreSQL WAL -> Debezium Connect -> Apache Kafka -> .NET consumer
```

PostgreSQL already writes every change to its WAL for crash recovery. Setting `wal_level=logical` tells Postgres to include enough detail for logical replication. Debezium connects as a replication client, reads those changes, wraps them in a before/after envelope, and publishes to a Kafka topic named after the table.

The app that writes orders does not publish anything. It only writes to PostgreSQL. CDC sits beside it.

## The Docker Setup

Four containers: PostgreSQL with logical replication, Kafka in KRaft mode, Debezium Connect, and Kafka UI for debugging.

Every image is free and open-source. Kafka uses the official Apache image (Apache 2.0), not the Confluent distribution. Works identically with Podman or Rancher Desktop.

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: cdc-postgres
    ports:
      - "5432:5432"
    environment:
      POSTGRES_DB: orders
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    command: >
      postgres
      -c wal_level=logical
      -c max_replication_slots=4
      -c max_wal_senders=4
    volumes:
      - ./setup.sql:/docker-entrypoint-initdb.d/setup.sql

  kafka:
    image: apache/kafka:3.7.0
    container_name: cdc-kafka
    ports:
      - "9092:9092"
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:29092,CONTROLLER://0.0.0.0:9093,PLAINTEXT_HOST://0.0.0.0:9092
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1

  debezium:
    image: debezium/connect:2.5
    container_name: cdc-debezium
    depends_on:
      kafka:
        condition: service_started
      postgres:
        condition: service_started
    ports:
      - "8083:8083"
    environment:
      BOOTSTRAP_SERVERS: kafka:29092
      GROUP_ID: 1
      CONFIG_STORAGE_TOPIC: debezium_configs
      OFFSET_STORAGE_TOPIC: debezium_offsets
      STATUS_STORAGE_TOPIC: debezium_statuses
      CONFIG_STORAGE_REPLICATION_FACTOR: 1
      OFFSET_STORAGE_REPLICATION_FACTOR: 1
      STATUS_STORAGE_REPLICATION_FACTOR: 1

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: cdc-kafka-ui
    depends_on:
      - kafka
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
      KAFKA_CLUSTERS_0_KAFKACONNECT_0_NAME: debezium
      KAFKA_CLUSTERS_0_KAFKACONNECT_0_ADDRESS: http://debezium:8083
```

The `command` override on PostgreSQL is the key part. Without `wal_level=logical`, Debezium cannot connect. `max_replication_slots=4` and `max_wal_senders=4` give enough room for the connector plus any other replication you might add later.

The `setup.sql` file (mounted into the init directory) creates the orders table and seeds three rows:

```sql
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    customer TEXT NOT NULL,
    product TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1,
    total_amount DECIMAL(10,2) NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO orders (customer, product, quantity, total_amount, status) VALUES
    ('alice', 'Widget A', 2, 49.98, 'pending'),
    ('bob', 'Widget B', 1, 24.99, 'confirmed'),
    ('carol', 'Widget C', 5, 124.95, 'shipped');

ALTER TABLE orders REPLICA IDENTITY FULL;
```

One detail matters for updates and deletes:

```sql
ALTER TABLE orders REPLICA IDENTITY FULL;
```

PostgreSQL's default replica identity only sends the primary key for update/delete before-images. Debezium can't show previous `status`, `customer`, or `total_amount` without it.

`FULL` includes the entire previous row. Small line, big difference: `-> shipped` vs `pending -> shipped`.

Start everything:

```bash
docker-compose up -d
```

Wait for Kafka and Debezium to stabilize, then register the connector.

## Registering the Debezium Connector

Debezium Connect exposes a REST API. You POST a connector config:

```bash
curl.exe -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @register-connector.json
```

On macOS/Linux, `curl` is fine. On Windows PowerShell, use `curl.exe` so PowerShell does not route the command through its `Invoke-WebRequest` alias.

The connector config tells Debezium which database to watch and which tables to capture:

```json
{
  "name": "orders-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "postgres",
    "database.dbname": "orders",
    "topic.prefix": "orders",
    "table.include.list": "public.orders",
    "plugin.name": "pgoutput",
    "slot.name": "orders_slot",
    "publication.name": "orders_pub",
    "decimal.handling.mode": "string",
    "schema.history.internal.kafka.bootstrap.servers": "kafka:29092",
    "schema.history.internal.kafka.topic": "schema-changes"
  }
}
```

`decimal.handling.mode: string` tells Debezium to serialize NUMERIC/DECIMAL columns as plain strings instead of base64-encoded bytes. Without this, a `DECIMAL(10,2)` value of `49.98` arrives as `"E4Y="` and your consumer has to decode it manually. With `string`, it arrives as `"49.98"` and `System.Text.Json` handles the rest.

`topic.prefix` combined with the schema and table name gives you the Kafka topic: `orders.public.orders`. Once registered, Debezium starts streaming. You can verify in Kafka UI at http://localhost:8080.

## What Debezium Events Look Like

Every CDC event has a `payload` with `before`, `after`, and `op` fields. For an INSERT:

```json
{
  "payload": {
    "before": null,
    "after": {
      "id": 4,
      "customer": "dave",
      "product": "Widget D",
      "quantity": 3,
      "total_amount": "74.97",
      "status": "pending"
    },
    "op": "c",
    "ts_ms": 1713600000000
  }
}
```

`op: "c"` means create, `"u"` means update, `"d"` means delete, and `"r"` means read (the initial snapshot). For updates, both `before` and `after` are populated so you can see exactly what changed.

## The .NET Consumer

A console app using `Confluent.Kafka`. The deserializer maps the Debezium envelope into domain event records.

The envelope type:

```csharp
using System.Text.Json;
using System.Text.Json.Serialization;

public sealed class DebeziumEnvelope
{
    [JsonPropertyName("before")]
    public JsonElement? Before { get; set; }

    [JsonPropertyName("after")]
    public JsonElement? After { get; set; }

    [JsonPropertyName("op")]
    public string Operation { get; set; } = string.Empty;

    [JsonPropertyName("ts_ms")]
    public long TimestampMs { get; set; }

    public bool IsCreate => Operation == "c" || Operation == "r";
    public bool IsUpdate => Operation == "u";
    public bool IsDelete => Operation == "d";
}

public sealed class DebeziumMessage
{
    [JsonPropertyName("payload")]
    public DebeziumEnvelope? Payload { get; set; }
}
```

The domain events:

```csharp
public record OrderCreated(
    int Id,
    string Customer,
    string Product,
    int Quantity,
    decimal TotalAmount,
    string Status,
    DateTimeOffset CreatedAt);

public record OrderUpdated(
    int Id,
    string? PreviousStatus,
    string CurrentStatus,
    string Customer,
    string Product,
    decimal TotalAmount,
    DateTimeOffset UpdatedAt);
```

And the consumer loop in `Program.cs`:

{% raw %}
```csharp
using System.Text.Json;
using System.Text.Json.Serialization;
using AnimatLabs.CdcEventSourcing;
using AnimatLabs.CdcEventSourcing.DomainEvents;
using Confluent.Kafka;

var config = new ConsumerConfig
{
    BootstrapServers = "localhost:9092",
    GroupId = "cdc-consumer",
    AutoOffsetReset = AutoOffsetReset.Earliest,
    EnableAutoCommit = true
};

var topic = "orders.public.orders";
using var consumer = new ConsumerBuilder<string, string>(config).Build();
consumer.Subscribe(topic);

Console.WriteLine($"Listening on {topic}. Insert or update rows in the orders table to see events.");
Console.WriteLine("Press Ctrl+C to stop.");
Console.WriteLine();

var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) => { e.Cancel = true; cts.Cancel(); };

try
{
    while (!cts.Token.IsCancellationRequested)
    {
        var result = consumer.Consume(cts.Token);
        if (result?.Message?.Value is null) continue;

        var message = JsonSerializer.Deserialize<DebeziumMessage>(result.Message.Value);
        var envelope = message?.Payload;
        if (envelope is null) continue;

        if (envelope.IsCreate)
        {
            var row = envelope.After?.Deserialize<OrderRow>();
            if (row is null) continue;

            var created = new OrderCreated(
                row.Id, row.Customer, row.Product,
                row.Quantity, row.TotalAmount, row.Status,
                DateTimeOffset.FromUnixTimeMilliseconds(envelope.TimestampMs));

            Console.WriteLine($"[OrderCreated] #{created.Id} {created.Customer} " +
                $"bought {created.Quantity}x {created.Product} for {created.TotalAmount:C}");
        }
        else if (envelope.IsUpdate)
        {
            var before = envelope.Before?.Deserialize<OrderRow>();
            var after = envelope.After?.Deserialize<OrderRow>();
            if (after is null) continue;

            var updated = new OrderUpdated(
                after.Id, before?.Status, after.Status,
                after.Customer, after.Product, after.TotalAmount,
                DateTimeOffset.FromUnixTimeMilliseconds(envelope.TimestampMs));

            Console.WriteLine($"[OrderUpdated] #{updated.Id} " +
                $"{updated.PreviousStatus} -> {updated.CurrentStatus} ({updated.Customer})");
        }
        else if (envelope.IsDelete)
        {
            var row = envelope.Before?.Deserialize<OrderRow>();
            Console.WriteLine($"[OrderDeleted] #{row?.Id} {row?.Customer}");
        }
    }
}
catch (OperationCanceledException) { }
finally { consumer.Close(); }
```
{% endraw %}

The `OrderRow` maps the JSON payload to a C# object. Debezium sends numeric columns as strings (because of `decimal.handling.mode: string`), so `JsonNumberHandling.AllowReadingFromString` handles the conversion:

```csharp
[JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
internal sealed class OrderRow
{
    [JsonPropertyName("id")]
    public int Id { get; set; }

    [JsonPropertyName("customer")]
    public string Customer { get; set; } = "";

    [JsonPropertyName("product")]
    public string Product { get; set; } = "";

    [JsonPropertyName("quantity")]
    public int Quantity { get; set; }

    [JsonPropertyName("total_amount")]
    public decimal TotalAmount { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";
}
```

Run the consumer:

```bash
cd AnimatLabs.CdcEventSourcing
dotnet run
```

It immediately reads the initial snapshot:

```text
Listening on orders.public.orders. Insert or update rows in the orders table to see events.
Press Ctrl+C to stop.

[OrderCreated] #1 alice bought 2x Widget A for $49.98
[OrderCreated] #2 bob bought 1x Widget B for $24.99
[OrderCreated] #3 carol bought 5x Widget C for $124.95
```

Open another terminal and insert a row:

```bash
docker exec cdc-postgres psql -U postgres -d orders -c \
  "INSERT INTO orders (customer, product, quantity, total_amount) VALUES ('dave', 'Widget D', 3, 74.97);"
```

Update it:

```bash
docker exec cdc-postgres psql -U postgres -d orders -c \
  "UPDATE orders SET status = 'shipped' WHERE customer = 'dave';"
```

Delete it:

```bash
docker exec cdc-postgres psql -U postgres -d orders -c \
  "DELETE FROM orders WHERE customer = 'dave';"
```

This is the verified output from my local run:

```text
[OrderCreated] #4 dave bought 3x Widget D for $74.97
[OrderUpdated] #4 pending -> shipped (dave)
[OrderDeleted] #4 dave
```

## What This Gives You

The same database write can now feed a few separate jobs:

- Keep raw events in Kafka for audit and replay
- Evict Redis entries when the source row changes instead of guessing TTLs
- Feed a search index or read model from the same topic

These are all independent consumers on the same Kafka topic. Add them as you need them. The database does not care.

## What I Would Not Use This For

I would not use CDC as a shortcut around domain modeling. If your system needs event-sourced aggregates, explicit commands, versioned domain events, and business-time replay, start with a real event store or a framework designed for that model.

CDC is strongest when:

- the relational schema already exists
- other services need to react to committed changes
- you want the application write path to stay simple
- eventual consistency is acceptable

It is weaker when consumers need perfect domain intent. A row update can tell you that `status` changed from `pending` to `shipped`; it cannot tell you whether that happened because a warehouse scan completed, a support agent overrode the order, or a migration script fixed old data. If that distinction matters, publish an explicit domain event.

## Things to Watch For

**Connector lag.** If Debezium falls behind, changes pile up in the WAL. Watch replication slot lag in PostgreSQL and the Debezium metrics endpoint.

**Replica identity.** If you need previous row values for updates/deletes, set `REPLICA IDENTITY FULL` on the captured table. Otherwise delete events may only include the primary key.

**Schema changes.** Adding a column is usually fine. Renaming or removing columns can break consumers. Version the events you expose from your consumer if other teams depend on them.

**At-least-once delivery.** Kafka consumers can see duplicates. Make handlers idempotent with the row primary key, Debezium metadata, or your own processed-event table.

**Startup order.** Kafka and Debezium take a few seconds to settle. The README keeps the commands separate on purpose so you can see each moving part.

A follow-up post covers piping these same CDC events to the browser over SignalR and SSE. Same Kafka topic, different consumer.

---
