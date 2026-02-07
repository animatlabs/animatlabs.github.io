---
title: "Stop Mocking, Start Testing: Testcontainers in .NET"
excerpt: >-
  "Why mock a database when you can spin up the real thing in Docker? Testcontainers makes integration testing trivial."
categories:
  - Technical
  - .NET
  - Testing
tags:
  - .NET
  - Testcontainers
  - Integration Testing
  - Docker
  - Testing
  - xUnit
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Mocking Problem

Unit tests with mocked dependencies are fast but often miss real-world bugs. Integration tests against shared databases are flaky and slow.

Testcontainers solves this: spin up real Docker containers for each test, automatically cleaned up after.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. Why mocking isn't enough
2. What is Testcontainers
3. Setting up for .NET
4. Database testing (PostgreSQL, SQL Server)
5. Testing with Kafka, Redis
6. CI/CD integration
7. Best practices

CODE EXAMPLES:
- PostgreSQL container setup
- SQL Server container
- Kafka for messaging tests
- Redis for caching tests
- WebApplicationFactory integration
-->

## Why Mocking Falls Short

```csharp
// This test passes...
mockDb.Setup(x => x.GetUserAsync(1)).ReturnsAsync(new User { Id = 1 });

// But in production, your SQL query has a bug.
// Mocks can't catch SQL syntax errors, performance issues, or transaction problems.
```

## What Is Testcontainers?

Testcontainers spins up real Docker containers for your tests. Each test gets isolated infrastructure that's automatically cleaned up.

## Setup

```bash
dotnet add package Testcontainers
dotnet add package Testcontainers.PostgreSql
```

## Database Testing

```csharp
public class UserRepositoryTests : IAsyncLifetime
{
    private PostgreSqlContainer _postgres = new PostgreSqlBuilder()
        .WithImage("postgres:16-alpine")
        .Build();

    public async Task InitializeAsync()
    {
        await _postgres.StartAsync();
        // Run migrations against real PostgreSQL
    }

    public async Task DisposeAsync()
    {
        await _postgres.DisposeAsync();
    }

    [Fact]
    public async Task GetUser_ReturnsUser_WhenExists()
    {
        // Arrange - real database!
        var connectionString = _postgres.GetConnectionString();
        var repository = new UserRepository(connectionString);
        
        // Act
        var user = await repository.GetUserAsync(1);
        
        // Assert
        Assert.NotNull(user);
    }
}
```

## SQL Server

```csharp
private MsSqlContainer _sqlServer = new MsSqlBuilder()
    .WithImage("mcr.microsoft.com/mssql/server:2022-latest")
    .Build();
```

## Testing with Kafka

```csharp
// TODO: Kafka container for messaging tests
```

## Testing with Redis

```csharp
// TODO: Redis container for caching tests
```

## WebApplicationFactory Integration

```csharp
// TODO: Full API integration tests with real databases
```

## CI/CD

Testcontainers works seamlessly on GitHub Actions and Azure DevOps—Docker is available on hosted agents.

## Best Practices

<!-- TODO: Use random ports, pin image versions, parallel safety -->

## Conclusion

<!-- TODO: Real dependencies, real confidence -->

---

*Using Testcontainers? Share your testing strategy in the comments!*
