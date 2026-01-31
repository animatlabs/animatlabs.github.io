---
title: "Compiled Queries in EF Core: When and How"
excerpt: >-
  "Compiled queries can speed up hot paths significantly. Here's when they help and how to implement them."
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
  - Database
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

## Why Compiled Queries Matter

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After profiling our API endpoints at [domain], I found that the same query was being parsed 
and compiled hundreds of times per second. Compiled queries cut that overhead by 80%."

Include:
- A real scenario from your work (Autodesk, virtual construction, etc.)
- The performance problem you were solving
- The impact of query compilation overhead
-->

## What Are Compiled Queries?

<!-- 
TODO: Explain what compiled queries are and how they differ from regular queries
Include:
- Query compilation overhead
- How EF Core compiles queries
- What gets cached vs what doesn't
-->

```csharp
// Regular query - compiled every time
var user = await _context.Users
    .FirstOrDefaultAsync(u => u.Id == userId);

// Compiled query - compiled once, reused many times
private static readonly Func<AppDbContext, int, Task<User?>> GetUserById =
    EF.CompileAsyncQuery((AppDbContext context, int id) =>
        context.Users.FirstOrDefault(u => u.Id == id));

// Usage
var user = await GetUserById(_context, userId);
```

### How Query Compilation Works

<!-- 
TODO: Explain the compilation process
- Expression tree parsing
- SQL generation
- Plan caching
- When compilation happens
-->

## When to Use Compiled Queries

<!-- 
TODO: Share your opinion on when compiled queries make sense
Include:
- Hot paths (frequently executed queries)
- High-traffic scenarios
- When NOT to use them (one-off queries, complex dynamic queries)
- Real examples from your experience
-->

### Good Candidates

- Queries executed in loops or hot paths
- Frequently called API endpoints
- Background job queries
- Queries with consistent parameters

### Poor Candidates

- One-off queries
- Highly dynamic queries (where predicates change significantly)
- Queries that are rarely executed
- Complex queries that benefit from query plan caching anyway

## Implementation Patterns

<!-- 
TODO: Show different ways to implement compiled queries
Include:
- Static field pattern
- Service/Repository pattern
- Dependency injection considerations
-->

### Pattern 1: Static Fields

```csharp
public class UserRepository
{
    private static readonly Func<AppDbContext, int, Task<User?>> GetUserById =
        EF.CompileAsyncQuery((AppDbContext context, int id) =>
            context.Users.FirstOrDefault(u => u.Id == id));
    
    private static readonly Func<AppDbContext, string, Task<User?>> GetUserByEmail =
        EF.CompileAsyncQuery((AppDbContext context, string email) =>
            context.Users.FirstOrDefault(u => u.Email == email));
    
    private readonly AppDbContext _context;
    
    public UserRepository(AppDbContext context)
    {
        _context = context;
    }
    
    public Task<User?> GetByIdAsync(int id) => GetUserById(_context, id);
    public Task<User?> GetByEmailAsync(string email) => GetUserByEmail(_context, email);
}
```

### Pattern 2: Compiled Query with Includes

```csharp
// TODO: Add example of compiled query with navigation properties
private static readonly Func<AppDbContext, int, Task<Order?>> GetOrderWithItems =
    EF.CompileAsyncQuery((AppDbContext context, int orderId) =>
        context.Orders
            .Include(o => o.OrderItems)
            .Include(o => o.Customer)
            .FirstOrDefault(o => o.Id == orderId));
```

### Pattern 3: Compiled Query with Projection

```csharp
// TODO: Add example of compiled query returning DTOs
public class UserDto
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}

private static readonly Func<AppDbContext, int, Task<UserDto?>> GetUserDtoById =
    EF.CompileAsyncQuery((AppDbContext context, int id) =>
        context.Users
            .Where(u => u.Id == id)
            .Select(u => new UserDto
            {
                Id = u.Id,
                Name = u.Name,
                Email = u.Email
            })
            .FirstOrDefault());
```

## Benchmarks

<!-- 
TODO: Add your BenchmarkDotNet results comparing compiled vs regular queries
Include:
- Setup details
- Test scenarios
- Results table
- Analysis
-->

### Benchmark Setup

```csharp
// TODO: Add your benchmark code here
[MemoryDiagnoser]
public class CompiledQueryBenchmarks
{
    // TODO: Setup code
}
```

### Results

<!-- TODO: Add your benchmark results here -->

```
| Method              | Mean     | Allocated | Gen0   | Gen1   | Gen2   |
|---------------------|----------|-----------|--------|--------|--------|
| RegularQuery        | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
| CompiledQuery       | XXX μs   | XXX KB    | XXX    | XXX    | XXX    |
```

### Analysis

<!-- 
TODO: Explain what the benchmarks show
- Where the performance gain comes from
- Memory allocation differences
- When the difference matters most
-->

## Common Pitfalls

<!-- 
TODO: Share mistakes you've seen or made
Include:
- Capturing variables incorrectly
- Using compiled queries with dynamic predicates
- Thread safety considerations
- Memory leaks from closures
-->

### Pitfall 1: Capturing Variables

```csharp
// WRONG - captures variable, breaks compilation
var userId = GetUserId();
var user = await GetUserById(_context, userId); // This won't work as expected

// RIGHT - pass as parameter
var userId = GetUserId();
var user = await GetUserById(_context, userId); // Parameter is fine
```

### Pitfall 2: Dynamic Predicates

```csharp
// WRONG - can't compile dynamic queries
private static readonly Func<AppDbContext, Expression<Func<User, bool>>, Task<User?>> GetUser =
    EF.CompileAsyncQuery((AppDbContext context, Expression<Func<User, bool>> predicate) =>
        context.Users.FirstOrDefault(predicate)); // This won't compile

// RIGHT - use regular query for dynamic cases
var user = await _context.Users.FirstOrDefaultAsync(predicate);
```

## My Recommendations

<!-- 
TODO: Share your personal recommendations
- When I use compiled queries
- When I don't
- Best practices from your experience
- Migration tips
-->

### Quick Decision Guide

- **Use compiled queries** if: Query executes >100 times/second, parameters are consistent, query structure is static
- **Skip compiled queries** if: Query is one-off, highly dynamic, or rarely executed

## Conclusion

<!-- 
TODO: Summarize with your personal takeaway
What's your main recommendation? What should readers do next?
-->

**You can access the benchmark code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*Have questions about compiled queries? Let me know in the comments!*
