---
title: "Profiling EF Core: Tools and Workflows for Finding Slow Queries"
excerpt: >-
  "Your EF Core queries are slow but you don't know which ones. Here's my workflow for finding and fixing the culprits."
categories:
  - Technical
  - .NET
  - EF-Core
tags:
  - C#
  - .NET
  - EF Core
  - Performance
  - Profiling
  - SQL
  - MiniProfiler
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST:
- [ ] Does this include a real problem I faced?
- [ ] Did I test these tools myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,200-1,500 words
-->

## The Problem: "It's Slow But I Don't Know Why"

<!-- 
TODO: Share a real scenario where you needed to profile EF Core
Example: "Our API endpoint was taking 3 seconds, but the code looked fine..."
-->

## Tool 1: EF Core Logging

### Basic Query Logging

```csharp
// In Program.cs or DbContext
optionsBuilder
    .UseSqlServer(connectionString)
    .LogTo(Console.WriteLine, LogLevel.Information)
    .EnableSensitiveDataLogging(); // Shows parameter values
```

### Structured Logging with Serilog

<!-- TODO: Your preferred logging setup -->

```csharp
optionsBuilder
    .UseSqlServer(connectionString)
    .LogTo(
        message => Log.Information(message),
        new[] { DbLoggerCategory.Database.Command.Name },
        LogLevel.Information
    );
```

## Tool 2: MiniProfiler

<!-- TODO: How you use MiniProfiler -->

### Setup

```csharp
// Install: MiniProfiler.AspNetCore.Mvc, MiniProfiler.EntityFrameworkCore

builder.Services.AddMiniProfiler(options =>
{
    options.RouteBasePath = "/profiler";
    options.ColorScheme = StackExchange.Profiling.ColorScheme.Dark;
}).AddEntityFramework();
```

### What MiniProfiler Shows You

<!-- TODO: Screenshot or description of MiniProfiler output -->

- Total query count per request
- Time per query
- Duplicate queries (N+1 detection)
- SQL with parameters

## Tool 3: SQL Server Profiler / Extended Events

<!-- TODO: When to use server-side profiling -->

## Tool 4: Query Tags (EF Core 6+)

```csharp
var users = await _context.Users
    .TagWith("GetActiveUsers - UserController.Index")
    .Where(u => u.IsActive)
    .ToListAsync();
```

This appears in SQL as:
```sql
-- GetActiveUsers - UserController.Index
SELECT * FROM Users WHERE IsActive = 1
```

## My Profiling Workflow

<!-- 
TODO: Share your actual workflow
Step by step: what do you do when something is slow?
-->

### Step 1: Enable Logging
### Step 2: Identify Slow Queries
### Step 3: Analyze Query Plan
### Step 4: Optimize and Verify

## Common Issues I Find

### Issue 1: N+1 Queries

<!-- TODO: How to detect and fix -->

### Issue 2: Missing Indexes

<!-- TODO: Reading query plans -->

### Issue 3: Over-fetching Data

<!-- TODO: Projection solutions -->

## Quick Reference

| Tool | Best For | Setup Effort |
|------|----------|--------------|
| EF Core Logging | Development, quick checks | Low |
| MiniProfiler | Web apps, request profiling | Medium |
| SQL Profiler | Complex issues, production | High |
| Query Tags | Correlating code to SQL | Low |

## Conclusion

<!-- TODO: Your recommendation on where to start -->

**Sample project with all tools configured:** [GitHub](https://github.com/animat089/efcore-profiling){: .btn .btn--primary}
