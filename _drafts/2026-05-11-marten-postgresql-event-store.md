---
title: "Marten: PostgreSQL as Document DB + Event Store"
excerpt: >-
  "Stop running MongoDB AND EventStoreDB. Marten turns PostgreSQL into both - with full ACID compliance and LINQ support."
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
last_modified_at: 2026-05-11
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- The problem: too many databases (MongoDB + EventStoreDB + Postgres)
- Marten: one library, one database, two paradigms
- Document DB mode: store JSON in Postgres
- Event Store mode: capture business events
- Projections: build read models from events
- Integration with Wolverine for event-driven architecture
- LINQ queries on JSON documents
- Is Event Sourcing worth it? (absorbed from deleted post)
- Migration from EF Core to Marten (when it makes sense)
- Docker setup with PostgreSQL

UNIQUE ANGLE: Discovery post. Replaces 2 databases with 1. Absorbs event-sourcing content.
WORKFLOWFORGE TIE-IN: Store workflow state as events in Marten.
-->

## The Problem: Database Sprawl

*Content to be written*

## Marten as Document Database

```csharp
// dotnet add package Marten
var store = DocumentStore.For("host=localhost;database=myapp;password=secret");

await using var session = store.LightweightSession();
session.Store(new User { Name = "John", Email = "john@example.com" });
await session.SaveChangesAsync();
```

## Marten as Event Store

*Content to be written*

## Conclusion

*Content to be written*

---

*Using Marten or considering event sourcing? Let me know in the comments!*
