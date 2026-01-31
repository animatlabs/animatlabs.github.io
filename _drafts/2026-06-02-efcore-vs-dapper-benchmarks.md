---
title: "EF Core vs Dapper: Real Benchmarks for Real Scenarios"
excerpt: >-
  "I benchmarked EF Core against Dapper in scenarios that actually matter. Here's the data."
categories:
  - Technical
  - .NET
  - EF-Core
tags:
  - C#
  - .NET
  - EF Core
  - Dapper
  - Performance
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

TARGET: 1,500-2,000 words
-->

## Why This Comparison Matters

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"Every time I mention EF Core in a performance discussion, someone says 'just use Dapper.' 
So I benchmarked both in scenarios that actually matter - not just simple CRUD, but real-world patterns."

Include:
- Why you ran these benchmarks
- What question you were trying to answer
- The real-world context (your domain, use cases)
-->

## The Setup

<!-- 
TODO: Explain your benchmark methodology
Include:
- Hardware specs
- Database setup
- Test data volume
- BenchmarkDotNet configuration
- What you're measuring (time, memory, allocations)
-->

### Test Environment

<!-- TODO: Add your environment details -->
- **Database**: SQL Server 2022 / PostgreSQL 15
- **.NET Version**: .NET 8
- **EF Core Version**: 8.0.x
- **Dapper Version**: 2.1.x
- **Test Data**: XXX records

### Benchmark Configuration

```csharp
// TODO: Add your BenchmarkDotNet configuration
[MemoryDiagnoser]
[SimpleJob(RuntimeMoniker.Net80)]
public class EfCoreVsDapperBenchmarks
{
    // TODO: Setup code
}
```

## Test Scenarios

<!-- 
TODO: Explain each scenario you tested
Include why each scenario matters in real applications
-->

### Scenario 1: Simple Single Record Lookup

<!-- 
TODO: Explain this scenario
- What it represents (API endpoint, cache miss, etc.)
- Why it matters
-->

```csharp
// EF Core
[Benchmark]
public async Task<User?> EfCore_GetById(int id)
{
    return await _context.Users.FindAsync(id);
}

// Dapper
[Benchmark]
public async Task<User?> Dapper_GetById(int id)
{
    return await _connection.QueryFirstOrDefaultAsync<User>(
        "SELECT * FROM Users WHERE Id = @Id", 
        new { Id = id });
}
```

### Scenario 2: Complex Query with Joins

<!-- 
TODO: Explain this scenario
- What it represents (reporting, dashboard, etc.)
- Why it matters
-->

```csharp
// TODO: Add EF Core and Dapper examples for complex joins
// EF Core
[Benchmark]
public async Task<List<OrderDto>> EfCore_GetOrdersWithItems()
{
    return await _context.Orders
        .Include(o => o.OrderItems)
        .Include(o => o.Customer)
        .Select(o => new OrderDto
        {
            OrderId = o.Id,
            CustomerName = o.Customer.Name,
            Total = o.OrderItems.Sum(i => i.Amount),
            ItemCount = o.OrderItems.Count
        })
        .ToListAsync();
}

// Dapper
[Benchmark]
public async Task<List<OrderDto>> Dapper_GetOrdersWithItems()
{
    // TODO: Add Dapper query with joins
    var sql = @"
        SELECT o.Id as OrderId, c.Name as CustomerName,
               SUM(oi.Amount) as Total, COUNT(oi.Id) as ItemCount
        FROM Orders o
        INNER JOIN Customers c ON o.CustomerId = c.Id
        INNER JOIN OrderItems oi ON o.Id = oi.OrderId
        GROUP BY o.Id, c.Name";
    
    return (await _connection.QueryAsync<OrderDto>(sql)).ToList();
}
```

### Scenario 3: Bulk Insert

<!-- 
TODO: Explain this scenario
- What it represents (data import, batch processing, etc.)
- Why it matters
-->

```csharp
// TODO: Add EF Core and Dapper examples for bulk insert
// EF Core
[Benchmark]
public async Task EfCore_BulkInsert(List<User> users)
{
    await _context.Users.AddRangeAsync(users);
    await _context.SaveChangesAsync();
}

// Dapper
[Benchmark]
public async Task Dapper_BulkInsert(List<User> users)
{
    // TODO: Add Dapper bulk insert code
    var sql = "INSERT INTO Users (Name, Email) VALUES (@Name, @Email)";
    await _connection.ExecuteAsync(sql, users);
}
```

### Scenario 4: Update with Change Tracking

<!-- 
TODO: Explain this scenario
- What it represents (business logic updates, etc.)
- Why it matters
-->

```csharp
// TODO: Add EF Core and Dapper examples for updates
// EF Core - benefits from change tracking
[Benchmark]
public async Task EfCore_UpdateUser(int id, string newName)
{
    var user = await _context.Users.FindAsync(id);
    user.Name = newName;
    await _context.SaveChangesAsync();
}

// Dapper - explicit SQL
[Benchmark]
public async Task Dapper_UpdateUser(int id, string newName)
{
    await _connection.ExecuteAsync(
        "UPDATE Users SET Name = @Name WHERE Id = @Id",
        new { Id = id, Name = newName });
}
```

### Scenario 5: Projection to DTOs

<!-- 
TODO: Explain this scenario
- What it represents (API responses, etc.)
- Why it matters
-->

```csharp
// TODO: Add EF Core and Dapper examples for projections
// EF Core
[Benchmark]
public async Task<List<UserDto>> EfCore_GetUserDtos()
{
    return await _context.Users
        .Select(u => new UserDto
        {
            Id = u.Id,
            Name = u.Name,
            Email = u.Email
        })
        .ToListAsync();
}

// Dapper
[Benchmark]
public async Task<List<UserDto>> Dapper_GetUserDtos()
{
    return (await _connection.QueryAsync<UserDto>(
        "SELECT Id, Name, Email FROM Users")).ToList();
}
```

## Results

<!-- 
TODO: Add your benchmark results here
Include comprehensive tables for each scenario
-->

### Scenario 1: Simple Single Record Lookup

```
| Method              | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|---------------------|----------|-----------|--------|--------|--------|
| EfCore_GetById      | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
| Dapper_GetById      | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
```

### Scenario 2: Complex Query with Joins

```
| Method                      | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|-----------------------------|----------|-----------|--------|--------|--------|
| EfCore_GetOrdersWithItems   | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
| Dapper_GetOrdersWithItems   | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
```

### Scenario 3: Bulk Insert

```
| Method              | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|---------------------|----------|-----------|--------|--------|--------|
| EfCore_BulkInsert   | XXX ms   | XXX KB    | XXX    | XXX    | XXX    |
| Dapper_BulkInsert   | XXX ms   | XXX KB    | XXX    | XXX    | XXX    |
```

### Scenario 4: Update with Change Tracking

```
| Method              | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|---------------------|----------|-----------|--------|--------|--------|
| EfCore_UpdateUser   | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
| Dapper_UpdateUser   | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
```

### Scenario 5: Projection to DTOs

```
| Method              | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|---------------------|----------|-----------|--------|--------|--------|
| EfCore_GetUserDtos  | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
| Dapper_GetUserDtos  | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
```

## Analysis

<!-- 
TODO: Analyze the results
Include:
- Where EF Core wins
- Where Dapper wins
- Why the differences exist
- What the numbers actually mean in practice
-->

### Performance Winners by Scenario

<!-- TODO: Summarize which tool wins in each scenario and why -->

### Memory Allocation Patterns

<!-- TODO: Explain memory allocation differences and their impact -->

### Real-World Implications

<!-- TODO: Translate benchmarks to real-world impact
- What does a 10% difference mean?
- When does it matter?
- When doesn't it matter?
-->

## When to Use Which

<!-- 
TODO: Share your personal recommendations based on the benchmarks
Include:
- When EF Core is the better choice
- When Dapper is the better choice
- Hybrid approaches
- Your actual decision-making process
-->

### Use EF Core When:

- You need change tracking and automatic updates
- Complex LINQ queries improve readability
- Migrations and schema management matter
- You want type safety and IntelliSense
- Team productivity > raw performance

### Use Dapper When:

- Maximum performance is critical
- You're comfortable writing SQL
- Queries are simple and well-defined
- You need fine-grained control over SQL
- Memory allocations are a concern

### Hybrid Approach

<!-- 
TODO: Explain when to use both
- EF Core for most queries
- Dapper for hot paths
- How to structure this in your codebase
-->

```csharp
// TODO: Add example of hybrid approach
public class OrderService
{
    // Use EF Core for complex queries
    public async Task<List<Order>> GetOrdersWithComplexFilter(OrderFilter filter)
    {
        return await _context.Orders
            .Where(/* complex LINQ */)
            .ToListAsync();
    }
    
    // Use Dapper for hot path simple queries
    public async Task<Order?> GetOrderById(int id)
    {
        return await _connection.QueryFirstOrDefaultAsync<Order>(
            "SELECT * FROM Orders WHERE Id = @Id", 
            new { Id = id });
    }
}
```

## Conclusion

<!-- 
TODO: Summarize with your personal takeaway
What's your main recommendation? What should readers do next?
-->

**You can access the full benchmark code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*Have questions about the benchmarks or want to share your own results? Let me know in the comments!*
