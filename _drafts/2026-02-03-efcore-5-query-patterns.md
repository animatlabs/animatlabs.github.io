---
title: "EF Core: 5 Query Patterns That Cut Response Time in Half"
excerpt: >-
  "Every millisecond your query takes costs money. Here are 5 patterns I use to cut EF Core response times in half - with real benchmarks."
categories:
  - Technical
  - .NET
  - EF-Core
tags:
  - C#
  - .NET
  - EF Core
  - Performance
  - Optimization
  - Benchmarks
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST (from your plan):
- [ ] Does this include a real problem I faced?
- [ ] Did I run the benchmarks myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,000-1,200 words
-->

## Why Query Patterns Matter

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After profiling our production system at [domain], I found that 3 out of 5 slow endpoints 
were caused by EF Core queries that could have been 10x faster with simple pattern changes."

Include:
- A real scenario from your work (Autodesk, virtual construction, etc.)
- The cost impact (response time, cloud costs, user experience)
-->

## Pattern 1: AsNoTracking for Read-Only Queries

<!-- 
TODO: Explain the pattern with YOUR code example

Include:
- Before code (bad pattern)
- After code (good pattern)
- Your benchmark results using BenchmarkDotNet
-->

```csharp
// Before: Tracked query (slower)
var users = await _context.Users
    .Where(u => u.IsActive)
    .ToListAsync();

// After: Untracked query (faster for read-only)
var users = await _context.Users
    .AsNoTracking()
    .Where(u => u.IsActive)
    .ToListAsync();
```

### Benchmark Results

<!-- TODO: Add your BenchmarkDotNet results here -->

```
| Method          | Mean     | Allocated |
|-----------------|----------|-----------|
| WithTracking    | XXX μs   | XXX KB    |
| WithoutTracking | XXX μs   | XXX KB    |
```

## Pattern 2: Projection Instead of Full Entity Loading

<!-- 
TODO: Show how selecting only needed columns improves performance
Include your own benchmark comparison
-->

```csharp
// Before: Loading full entity
var users = await _context.Users
    .Where(u => u.IsActive)
    .ToListAsync();

// After: Project only what you need
var users = await _context.Users
    .Where(u => u.IsActive)
    .Select(u => new UserDto
    {
        Id = u.Id,
        Name = u.Name,
        Email = u.Email
    })
    .ToListAsync();
```

## Pattern 3: Compiled Queries for Hot Paths

<!-- 
TODO: Explain when compiled queries make sense
Share a real scenario where you used this
-->

```csharp
// Compiled query - parsed once, reused many times
private static readonly Func<AppDbContext, int, Task<User?>> GetUserById =
    EF.CompileAsyncQuery((AppDbContext context, int id) =>
        context.Users.FirstOrDefault(u => u.Id == id));

// Usage
var user = await GetUserById(_context, userId);
```

## Pattern 4: Split Queries for Complex Includes

<!-- 
TODO: Explain the cartesian explosion problem
Show when AsSplitQuery() helps
-->

```csharp
// Before: Single query with cartesian explosion
var orders = await _context.Orders
    .Include(o => o.OrderItems)
    .Include(o => o.Customer)
    .ToListAsync();

// After: Split into multiple queries
var orders = await _context.Orders
    .Include(o => o.OrderItems)
    .Include(o => o.Customer)
    .AsSplitQuery()
    .ToListAsync();
```

## Pattern 5: Batching with ExecuteUpdate/ExecuteDelete

<!-- 
TODO: Show EF Core 7+ bulk operations
Compare to loading + saving entities individually
-->

```csharp
// Before: Load all, modify, save (N+1 updates)
var users = await _context.Users
    .Where(u => u.LastLogin < DateTime.UtcNow.AddYears(-1))
    .ToListAsync();

foreach (var user in users)
    user.IsActive = false;

await _context.SaveChangesAsync();

// After: Single database roundtrip
await _context.Users
    .Where(u => u.LastLogin < DateTime.UtcNow.AddYears(-1))
    .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsActive, false));
```

## Full Benchmark Comparison

<!-- 
TODO: Run all patterns through BenchmarkDotNet
Show the complete comparison table
-->

```
| Pattern               | Mean     | Improvement | Allocated |
|-----------------------|----------|-------------|-----------|
| Baseline              | XXX ms   | -           | XXX KB    |
| + AsNoTracking        | XXX ms   | XX%         | XXX KB    |
| + Projection          | XXX ms   | XX%         | XXX KB    |
| + Compiled Query      | XXX ms   | XX%         | XXX KB    |
| + ExecuteUpdate       | XXX ms   | XX%         | XXX KB    |
```

## Quick Reference Checklist

- [ ] Use `AsNoTracking()` for read-only queries
- [ ] Project to DTOs instead of loading full entities
- [ ] Use compiled queries for frequently executed queries
- [ ] Consider `AsSplitQuery()` for complex includes
- [ ] Use `ExecuteUpdate`/`ExecuteDelete` for bulk operations

## Conclusion

<!-- 
TODO: Summarize with your personal recommendation
What pattern do you use most? Why?
-->

**You can access the benchmark code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*Have questions or different patterns that work for you? Let me know in the comments!*
