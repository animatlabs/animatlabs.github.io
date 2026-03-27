---
title: "Event Sourcing Without the Framework: CDC + Debezium + .NET"
excerpt: >-
  You do not need EventStoreDB or Marten to get event sourcing benefits. Debezium reads the PostgreSQL transaction log, streams row changes through Kafka, and your .NET app consumes typed domain events.
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
last_modified_at: 2026-04-20
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Every event sourcing tutorial I read assumed I would adopt a full event store. Marten, EventStoreDB, Axon. Remodel first. Event-source second.

That felt backwards. I already had PostgreSQL with orders, customers, inventory. I wanted audit trail, replay, real-time reactions to data changes, the usual selling points, without ripping out the database I was already running.

Change Data Capture gave me that. Debezium reads the PostgreSQL write-ahead log, converts every INSERT, UPDATE, and DELETE into a structured event, and pushes it to Kafka. A .NET console app on the other end deserializes those events into typed domain objects. No event store, no schema changes, no new write model. I went into this skeptical that WAL streaming would be stable enough for anything serious; it has been, at least on the workloads I've thrown at it.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/CdcEventSourcing){: .btn .btn--primary}

## How It Fits Together

```
PostgreSQL (WAL)  →  Debezium Connect  →  Kafka  →  .NET Consumer
```

PostgreSQL already writes every change to its WAL for crash recovery. Setting `wal_level=logical` tells Postgres to include enough detail for replication. Debezium connects as a logical replication client, reads those changes, wraps them in a before/after envelope, and publishes to a Kafka topic named after the table. The .NET app subscribes to that topic and maps the raw envelope into domain events like `OrderCreated` and `OrderUpdated` while your OLTP code keeps acting like nothing downstream changed at all.

The database does not know about any of this. It keeps working as before. The CDC pipeline is a sidecar.

## The Docker Setup

Four containers: PostgreSQL with logical replication enabled, Kafka (KRaft mode, no ZooKeeper), Debezium Connect, and Kafka UI for debugging. Every image here is free and open-source. Kafka uses the official Apache image (Apache 2.0 licensed), not the Confluent distribution. The `docker-compose` commands work identically with Podman or Rancher Desktop.

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
```

Start everything with `docker-compose up -d`. Wait about 30 seconds for Kafka and Debezium to stabilize, then register the connector.

## Registering the Debezium Connector

Debezium Connect exposes a REST API. You POST a connector config:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @register-connector.json
```

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

Console.WriteLine($"Listening on {topic}. Insert or update rows to see events.");

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

Run `dotnet run` in the project folder, then open another terminal and insert a row:

```bash
docker exec -it cdc-postgres psql -U postgres -d orders -c \
  "INSERT INTO orders (customer, product, quantity, total_amount) VALUES ('dave', 'Widget D', 3, 74.97);"
```

The consumer prints `[OrderCreated] #4 dave bought 3x Widget D for $74.97` within a second or two. Update that row:

```bash
docker exec -it cdc-postgres psql -U postgres -d orders -c \
  "UPDATE orders SET status = 'shipped' WHERE customer = 'dave';"
```

And you see `[OrderUpdated] #4 pending -> shipped (dave)`.

## What This Gives You

The same database, no schema changes, and now you have:

**Audit trail.** Every row change is in Kafka. Set retention to 7 days (or forever with compaction) and you can replay what happened to any order.

**Cache invalidation.** A separate service subscribes to the same topic and evicts Redis entries when the source row changes. No TTL guessing, no stale data.

**Search sync.** Another consumer indexes order changes into Elasticsearch or Meilisearch. The search index stays in sync without your application explicitly calling two systems on every write.

**Real-time reactions.** A consumer detects when an order status changes to "shipped" and sends a notification email. No polling, no cron job.

These are all independent consumers on the same Kafka topic. Add them as you need them. The database does not care.

## Things to Watch For

**Connector lag.** If Debezium falls behind, changes pile up in the WAL. Monitor the replication slot lag in PostgreSQL with `pg_stat_replication` or the Debezium metrics endpoint.

**Schema changes.** Adding a column is fine (Debezium picks it up). Renaming or removing columns can break consumers. Version your domain events if your schema evolves frequently.

**Exactly-once delivery.** Kafka gives you at-least-once by default. If your consumers are not idempotent, you can get duplicate processing. Use the Debezium event ID or the row primary key as an idempotency key.

The [Kafka + SignalR follow-up](/2026/04/27/kafka-signalr-realtime/) pipes these same CDC events to the browser over SignalR and SSE. Same Kafka topic, different consumer.

---

<!-- LINKEDIN PROMO

Event sourcing without replacing your database.

Debezium reads the PostgreSQL WAL, turns row changes into structured events, and streams them through Kafka. A .NET console app on the other end deserializes them into typed domain events (OrderCreated, OrderUpdated). No event store framework, no schema migration, no new write model.

The post walks through the full pipeline: docker-compose with Postgres + Kafka + Debezium, the connector config, the Debezium envelope format, and a .NET consumer with Confluent.Kafka. Insert a row, see a typed domain event within seconds.

Working playground with docker-compose and run instructions: [link]

#dotnet #cdc #debezium #kafka #eventsourcing
-->
