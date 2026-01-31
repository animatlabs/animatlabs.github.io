---
title: "Rate Limiting in ASP.NET Core: Built-in Middleware"
excerpt: >-
  "Protect your APIs from abuse with ASP.NET Core's built-in rate limiting middleware."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Rate Limiting
  - ASP.NET Core
  - API
  - Security
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

## Why Rate Limit?

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After our API went public, we saw a single client making 10,000 requests per minute, 
bringing our service to its knees. Rate limiting wasn't optional anymore."

Include:
- A real scenario from your work where rate limiting was needed
- Why rate limiting matters (prevent abuse, ensure fair usage, protect resources)
- The cost of not rate limiting (DoS, resource exhaustion, unfair usage)
- When rate limiting becomes necessary
-->

## Built-in Rate Limiting Middleware

<!-- 
TODO: Explain ASP.NET Core's built-in rate limiting (introduced in .NET 7+)
Include:
- What it provides out of the box
- No external dependencies required
- How it compares to third-party solutions
- Basic setup example
-->

```csharp
// TODO: Add basic rate limiting configuration example
// Built-in since .NET 7, no external packages needed

builder.Services.AddRateLimiter(options =>
{
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "anonymous",
            factory: partition => new FixedWindowRateLimiterOptions
            {
                AutoReplenishment = true,
                PermitLimit = 100,
                Window = TimeSpan.FromMinutes(1)
            }));
});
```

## Configuration Patterns

<!-- 
TODO: Explain different rate limiting policies
Include:
- Fixed window limiter
- Sliding window limiter
- Token bucket limiter
- Concurrency limiter
- When to use each
- Configuration examples for each
-->

### Fixed Window Limiter

<!-- 
TODO: Explain fixed window rate limiting
Include:
- How it works (X requests per time window)
- Use cases
- Configuration example
- Pros and cons
-->

```csharp
// TODO: Add fixed window limiter example
options.AddFixedWindowLimiter("FixedWindowPolicy", options =>
{
    options.PermitLimit = 100;
    options.Window = TimeSpan.FromMinutes(1);
    options.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    options.QueueLimit = 10;
});
```

### Sliding Window Limiter

<!-- 
TODO: Explain sliding window rate limiting
Include:
- How it works (smoother rate limiting)
- Use cases
- Configuration example
- When to prefer over fixed window
-->

```csharp
// TODO: Add sliding window limiter example
options.AddSlidingWindowLimiter("SlidingWindowPolicy", options =>
{
    options.PermitLimit = 100;
    options.Window = TimeSpan.FromMinutes(1);
    options.SegmentsPerWindow = 10;
    options.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    options.QueueLimit = 10;
});
```

### Token Bucket Limiter

<!-- 
TODO: Explain token bucket rate limiting
Include:
- How it works (tokens refill over time)
- Use cases
- Configuration example
- When to use token bucket
-->

```csharp
// TODO: Add token bucket limiter example
options.AddTokenBucketLimiter("TokenBucketPolicy", options =>
{
    options.TokenLimit = 100;
    options.ReplenishmentPeriod = TimeSpan.FromMinutes(1);
    options.TokensPerPeriod = 20;
    options.AutoReplenishment = true;
});
```

### Concurrency Limiter

<!-- 
TODO: Explain concurrency limiter
Include:
- How it works (limit concurrent requests)
- Use cases
- Configuration example
- When to use concurrency limiting
-->

```csharp
// TODO: Add concurrency limiter example
options.AddConcurrencyLimiter("ConcurrencyPolicy", options =>
{
    options.PermitLimit = 10;
    options.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    options.QueueLimit = 5;
});
```

## Custom Policies

<!-- 
TODO: Explain how to create custom rate limiting policies
Include:
- Per-user rate limiting
- Per-IP rate limiting
- Per-API-key rate limiting
- Dynamic rate limiting based on user tier
- Your own custom policy example
-->

```csharp
// TODO: Add custom policy example
options.AddPolicy("PerUserPolicy", context =>
    RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.User.Identity?.Name ?? "anonymous",
        factory: partition => new FixedWindowRateLimiterOptions
        {
            AutoReplenishment = true,
            PermitLimit = GetUserLimit(partition),
            Window = TimeSpan.FromMinutes(1)
        }));

private static int GetUserLimit(string partitionKey)
{
    // TODO: Implement logic to get user-specific limits
    // e.g., premium users get 1000/min, free users get 100/min
    return partitionKey == "premium" ? 1000 : 100;
}
```

## Per-User vs Global Limits

<!-- 
TODO: Explain different partitioning strategies
Include:
- Partitioning by IP address
- Partitioning by user ID
- Partitioning by API key
- Global limits
- When to use each approach
- Your recommendation
-->

```csharp
// TODO: Add partitioning examples
// Partition by IP
options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        factory: partition => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromMinutes(1)
        }));

// Partition by User ID
options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
    RateLimitPartition.GetFixedWindowLimiter(
        partitionKey: context.User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "anonymous",
        factory: partition => new FixedWindowRateLimiterOptions
        {
            PermitLimit = 100,
            Window = TimeSpan.FromMinutes(1)
        }));
```

## Response Handling

<!-- 
TODO: Explain how to handle rate limit responses
Include:
- 429 Too Many Requests status code
- Retry-After header
- Custom response formatting
- Error messages
- Client communication
-->

```csharp
// TODO: Add response handling example
app.UseRateLimiter();

app.MapGet("/api/users", async () =>
{
    return Results.Ok(await GetUsersAsync());
})
.RequireRateLimiting("FixedWindowPolicy");

// Custom response on rate limit exceeded
options.OnRejected = async (context, cancellationToken) =>
{
    context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
    
    if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
    {
        context.HttpContext.Response.Headers.RetryAfter = retryAfter.TotalSeconds.ToString();
    }
    
    await context.HttpContext.Response.WriteAsJsonAsync(new
    {
        error = "Rate limit exceeded",
        retryAfter = retryAfter?.TotalSeconds
    }, cancellationToken);
};
```

## My Recommendations

<!-- 
TODO: Share your personal opinion on rate limiting strategies
Include:
- Which policies to use for different scenarios
- What you've used in production
- Best practices
- Common mistakes to avoid
- Performance considerations
-->

### Best Practices

1. **Start with Fixed Window** - Simple and effective for most cases
2. **Use Sliding Window for Smooth Traffic** - Better user experience
3. **Partition Appropriately** - Balance between per-user and per-IP
4. **Set Reasonable Limits** - Too strict hurts legitimate users, too loose defeats the purpose
5. **Monitor and Adjust** - Rate limits should evolve with your traffic patterns

## Conclusion

<!-- 
TODO: Summarize with your personal recommendation
What's your takeaway? What should readers do next?
Include:
- Key points to remember
- Next steps for implementing rate limiting
- Resources for further learning
-->

**You can access the example code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*Implementing rate limiting? Share your approach!*
