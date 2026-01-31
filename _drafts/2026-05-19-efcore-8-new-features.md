---
title: "EF Core 8: New Features You Should Actually Use"
excerpt: >-
  "JSON columns, bulk updates, raw SQL improvements - here are the EF Core 8 features worth adopting."
categories:
  - Technical
  - .NET
  - EF-Core
tags:
  - C#
  - .NET
  - EF Core
  - Entity Framework
  - Database
  - Performance
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
- [ ] Did I run the examples myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,200-1,500 words
-->

## Why EF Core 8 Matters

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After upgrading to EF Core 8 at [domain], I discovered that 3 new features solved problems 
I'd been working around for months. Here's what actually matters."

Include:
- A real scenario from your work (Autodesk, virtual construction, etc.)
- Why EF Core 8 features solve real problems
- What you were doing before (workarounds)
-->

## Feature 1: JSON Columns

<!-- 
TODO: Explain JSON column support in SQL Server/PostgreSQL
Include:
- Configuration example
- Querying JSON data
- When to use vs normalized tables
- Your own use case or example
-->

```csharp
// TODO: Add example of JSON column configuration
public class Order
{
    public int Id { get; set; }
    public string CustomerName { get; set; }
    
    // JSON column - stores complex object as JSON
    public Address ShippingAddress { get; set; }
}

// Configuration
modelBuilder.Entity<Order>()
    .OwnsOne(o => o.ShippingAddress, a =>
    {
        a.ToJson(); // Stores as JSON column
    });

// Querying JSON
var orders = await _context.Orders
    .Where(o => o.ShippingAddress.City == "Seattle")
    .ToListAsync();
```

### When to Use JSON Columns

<!-- 
TODO: Share your opinion on when JSON columns make sense
- Pros and cons
- Performance considerations
- Migration from normalized approach
-->

## Feature 2: ExecuteUpdate and ExecuteDelete

<!-- 
TODO: Explain bulk operations without loading entities
Include:
- Before/after comparison
- Performance benefits
- Real scenario where you used this
- Limitations to be aware of
-->

```csharp
// Before: Load all entities, modify, save (N+1 problem)
var users = await _context.Users
    .Where(u => u.LastLogin < DateTime.UtcNow.AddYears(-1))
    .ToListAsync();

foreach (var user in users)
    user.IsActive = false;

await _context.SaveChangesAsync();

// After: Single database roundtrip with ExecuteUpdate
await _context.Users
    .Where(u => u.LastLogin < DateTime.UtcNow.AddYears(-1))
    .ExecuteUpdateAsync(u => u.SetProperty(x => x.IsActive, false));

// Bulk delete
await _context.Orders
    .Where(o => o.CreatedAt < DateTime.UtcNow.AddYears(-5))
    .ExecuteDeleteAsync();
```

### Performance Impact

<!-- 
TODO: Add your benchmark results comparing ExecuteUpdate vs traditional approach
-->

```
| Method          | Mean     | Allocated | Database Roundtrips |
|-----------------|----------|-----------|---------------------|
| Traditional     | XXX ms   | XXX KB    | N+1                 |
| ExecuteUpdate   | XXX ms   | XXX KB    | 1                   |
```

## Feature 3: Raw SQL Improvements

<!-- 
TODO: Explain FromSql improvements and unmapped types
Include:
- FromSql with parameters
- Unmapped types for raw SQL results
- When raw SQL is the right choice
-->

```csharp
// TODO: Add example of FromSql with parameters
var orders = await _context.Orders
    .FromSqlRaw("""
        SELECT * FROM Orders 
        WHERE CreatedAt >= {0} 
        AND Status = {1}
        """, startDate, OrderStatus.Active)
    .ToListAsync();

// Unmapped types for raw SQL results
public class OrderSummary
{
    public int OrderId { get; set; }
    public decimal Total { get; set; }
    public int ItemCount { get; set; }
}

var summaries = await _context.Database
    .SqlQuery<OrderSummary>("""
        SELECT OrderId, SUM(Amount) as Total, COUNT(*) as ItemCount
        FROM OrderItems
        GROUP BY OrderId
        """)
    .ToListAsync();
```

## Feature 4: Lazy Loading Improvements

<!-- 
TODO: Explain improvements to lazy loading in EF Core 8
Include:
- Better performance characteristics
- Configuration changes
- When lazy loading is appropriate
-->

```csharp
// TODO: Add example of lazy loading configuration and usage
// Configuration
modelBuilder.Entity<Order>()
    .Navigation(o => o.OrderItems)
    .EnableLazyLoading();

// Usage - navigation properties load automatically
var order = await _context.Orders.FindAsync(orderId);
var items = order.OrderItems; // Loaded automatically
```

## My Recommendations

<!-- 
TODO: Which features to adopt first, which to wait on
Share your personal experience:
- What you've adopted in production
- What you're still evaluating
- Migration tips
- Gotchas you've encountered
-->

### Adoption Priority

1. **ExecuteUpdate/ExecuteDelete** - Adopt immediately for bulk operations
2. **JSON Columns** - Evaluate case-by-case, great for flexible schemas
3. **Raw SQL Improvements** - Use when you need them, but prefer LINQ when possible
4. **Lazy Loading Improvements** - Use sparingly, prefer explicit loading

## Conclusion

<!-- 
TODO: Summarize with your personal recommendation
What's your takeaway? What should readers do next?
-->

**You can access the example code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*Questions about EF Core 8 migration? Let me know in the comments!*
