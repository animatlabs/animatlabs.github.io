---
title: "Transactional Outbox with CDC: Never Lose an Event"
excerpt: >-
  "The dual-write problem kills data consistency. Here's how the Outbox Pattern with CDC guarantees reliable event publishing."
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
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Dual-Write Problem

You update the database. Then you publish an event. What happens if the app crashes between those two operations?

Either the database is updated but the event is lost, or the event is published but the database change fails. Both scenarios break your system's consistency.

The Transactional Outbox Pattern solves this elegantly.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. The dual-write problem explained
2. The Outbox Pattern solution
3. Two approaches: Polling vs CDC
4. Implementing Outbox with Debezium
5. .NET implementation with EF Core
6. Exactly-once delivery considerations

CODE EXAMPLES:
- Outbox table schema
- EF Core entity and migration
- Writing to outbox in same transaction
- Debezium outbox connector configuration
- Consumer idempotency patterns
-->

## The Dual-Write Disaster

```csharp
// DANGEROUS: This is NOT atomic
await _dbContext.SaveChangesAsync();  // Step 1: Database
await _messageBus.PublishAsync(event); // Step 2: Message bus
// If crash here: DB updated, event lost
```

## The Outbox Pattern

Instead of publishing events directly, write them to an "outbox" table in the same database transaction. A separate process reads the outbox and publishes events.

```
┌────────────────────────────────────┐
│         Same Transaction           │
│  ┌──────────┐    ┌──────────────┐  │
│  │ Business │    │   Outbox     │  │
│  │  Table   │    │   Table      │  │
│  └──────────┘    └──────────────┘  │
└────────────────────────────────────┘
         │
         ▼ (CDC or Polling)
    ┌──────────┐
    │  Kafka   │
    └──────────┘
```

## Outbox Table Schema

```sql
CREATE TABLE Outbox (
    Id UNIQUEIDENTIFIER PRIMARY KEY,
    AggregateType NVARCHAR(255) NOT NULL,
    AggregateId NVARCHAR(255) NOT NULL,
    EventType NVARCHAR(255) NOT NULL,
    Payload NVARCHAR(MAX) NOT NULL,
    CreatedAt DATETIME2 NOT NULL,
    ProcessedAt DATETIME2 NULL
);
```

## EF Core Implementation

```csharp
// TODO: Outbox entity
// TODO: DbContext configuration
// TODO: Writing business entity + outbox event in same transaction
```

## CDC vs Polling

| Approach | Latency | Complexity | Reliability |
|----------|---------|------------|-------------|
| Polling | Seconds | Lower | Good |
| CDC (Debezium) | Milliseconds | Higher | Excellent |

## Debezium Outbox Connector

```json
{
  "name": "outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.sqlserver.SqlServerConnector",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.key": "AggregateId",
    "transforms.outbox.table.field.event.type": "EventType",
    "transforms.outbox.table.field.event.payload": "Payload"
  }
}
```

## Consumer Idempotency

```csharp
// TODO: Handle duplicate events gracefully
// TODO: Idempotency key tracking
```

## Conclusion

<!-- TODO: Outbox + CDC = reliable event-driven architecture -->

---

*Implementing the outbox pattern in your systems? Share your approach in the comments!*
