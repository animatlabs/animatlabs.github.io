---
title: "5 Hidden Single Points of Failure in Your .NET Microservices"
excerpt: >-
  "Your microservices architecture isn't as resilient as you think. Here are 5 SPOFs I've seen take down production systems."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - Microservices
  - Reliability
  - Production
  - SPOF
  - Resilience
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Why SPOFs Still Happen

You split your monolith into microservices. You have multiple instances behind a load balancer. You're running in Kubernetes with auto-scaling. Your architecture diagrams show beautiful redundancy everywhere.

Then one component fails, and everything comes crashing down.

This happens because microservices introduce *new* single points of failure that didn't exist in the monolith. Distributed systems are harder, and many SPOFs hide in plain sight until they trigger an outage.

I've seen systems go down because a single Redis node became unreachable, because a centralized config server hiccuped, because a database connection pool was exhausted. Each time, the architecture looked resilient on paper. Each time, there was a hidden SPOF waiting to be discovered the hard way.

Here are the five most common hidden SPOFs I've encountered, and how to detect and mitigate them.

## SPOF 1: Shared Database Connection Pools

### The Problem

Every service connecting to the same database shares a finite resource: connections. Most databases limit concurrent connections (SQL Server's default is 32,767, but connection pools default to 100). When traffic spikes or a slow query holds connections, the pool exhausts. New requests can't get connections. Services queue up, timeouts cascade, and suddenly your entire system is down - not because the database is overloaded, but because you ran out of connections.

The insidious part: this often manifests as "random" failures across multiple services. Database metrics look fine. CPU is low. But nothing works.

### Detection

Monitor your connection pool usage. Add these connection string parameters:

```csharp
var connectionString = builder.Configuration.GetConnectionString("Default");
// Add monitoring parameters
// Max Pool Size=100; Connection Timeout=30; Application Name=MyService;
```

Then query SQL Server to see connection distribution:

```sql
SELECT 
    DB_NAME(dbid) as DatabaseName,
    COUNT(dbid) as ConnectionCount,
    loginame as LoginName
FROM sys.sysprocesses
WHERE dbid > 0
GROUP BY dbid, loginame
ORDER BY COUNT(dbid) DESC;
```

Set up alerts when connection count approaches your pool size.

### Mitigation

**Size pools appropriately.** Calculate based on expected concurrency, not arbitrary defaults. If you have 10 service instances each with a pool of 100, that's 1,000 potential connections.

**Use connection pooling libraries with diagnostics.** EF Core exposes pool metrics through event counters.

**Implement connection timeouts.** Don't wait forever for a connection - fail fast when the pool is exhausted.

```csharp
// Fail fast rather than queue indefinitely
optionsBuilder.UseSqlServer(connectionString, options =>
{
    options.CommandTimeout(30);
    options.EnableRetryOnFailure(3);
});
```

**Consider read replicas.** Separate read and write workloads to reduce connection pressure on the primary.

## SPOF 2: Centralized Config Without Fallback

### The Problem

Centralized configuration (Azure App Configuration, Consul, Vault) is great for managing settings across services. But what happens when the config server is unreachable?

If your services can't start without fetching config, and the config server is down, you have a bootstrapping problem. Existing instances might keep running with cached config, but any new instance fails to start. Auto-scaling stops working. Deployments fail. Recovery becomes impossible because you can't deploy fixes.

### Detection

Ask these questions:
- Can your services start if the config server is unreachable?
- What happens during a config server deployment?
- Do you have local fallback values for critical settings?

Test by blocking network access to your config server and attempting to deploy.

### Mitigation

Always have a local fallback. Load local config first, then overlay remote config:

```csharp
builder.Configuration
    .AddJsonFile("appsettings.json")                    // Local baseline
    .AddJsonFile("appsettings.local.json", optional: true)
    .AddAzureAppConfiguration(options =>                // Remote overlay
    {
        options.Connect(connectionString)
               .ConfigureRefresh(refresh =>
               {
                   refresh.Register("Sentinel", refreshAll: true)
                          .SetCacheExpiration(TimeSpan.FromMinutes(5));
               });
    }, optional: true);  // Make remote config optional!
```

The `optional: true` parameter is critical. Without it, a missing config source throws an exception at startup.

**Cache aggressively.** Config doesn't change often. Cache it locally and refresh in the background. If the config server becomes unreachable, use the cached version.

**Define critical defaults.** For settings that must exist, have sensible defaults in code. Config should *override* defaults, not *provide* them.

## SPOF 3: Single Redis Instance for Caching

### The Problem

Redis is often deployed as "just a cache" with the assumption that if it's down, you'll fall back to the database. This assumption fails in two scenarios:

1. **Performance cliff.** Your system was sized assuming cache hits. When Redis dies, every request hits the database. The database can't handle 100x the normal load. It topples over.

2. **Redis as more than cache.** Session state, rate limiting, distributed locks, pub/sub - these don't have a "fall back to database" option. If Redis holds your sessions and dies, all users are logged out simultaneously.

A single Redis instance is attractive because it's simple. It's also a time bomb.

### Detection

Audit how Redis is used:
- Is it only cache, or does it hold critical state?
- What's the cache hit ratio? (High hit ratio = high dependency)
- Can your system function with 100% cache misses?

Test by killing Redis in a staging environment and observing system behavior.

### Mitigation

**For pure caching:** Design for Redis being optional. Use circuit breakers around Redis calls. Fall back to no caching, not to database-as-cache.

```csharp
public async Task<User?> GetUserAsync(int id)
{
    // Try cache first with circuit breaker
    try
    {
        var cached = await _cache.GetAsync<User>($"user:{id}");
        if (cached is not null) return cached;
    }
    catch (RedisConnectionException)
    {
        // Cache unavailable - continue without it
        _logger.LogWarning("Redis unavailable, bypassing cache");
    }
    
    // Fall back to database
    var user = await _database.Users.FindAsync(id);
    
    // Try to cache (fire and forget, ignore failures)
    _ = _cache.SetAsync($"user:{id}", user, TimeSpan.FromMinutes(5));
    
    return user;
}
```

**For critical state:** Use Redis Cluster or Redis Sentinel for high availability. Multiple nodes with automatic failover eliminate the single point.

**For sessions:** Consider distributed session providers that can tolerate Redis outages, or accept that Redis failure means user re-authentication.

## SPOF 4: Synchronous Service Dependencies

### The Problem

Service A calls Service B, which calls Service C. A request waits for the entire chain. If any service in the chain is slow or unavailable, the request fails.

This creates a reliability multiplication problem. If each service has 99.9% availability, a chain of five services has 99.5% availability. Add latency and timeouts, and the user experience degrades rapidly.

```csharp
// Bad: Synchronous chain - availability multiplies
var user = await _userService.GetUserAsync(id);       // If this times out...
var orders = await _orderService.GetOrdersAsync(id);  // ...this waits
var recommendations = await _recService.GetAsync(id); // ...cascade failure
```

### Detection

Distributed tracing reveals synchronous chains. Look for:
- Long request spans with sequential child spans
- Timeouts that propagate up the call stack
- Services that fail together (correlation in error rates)

### Mitigation

**Parallelize independent calls:**

```csharp
// Better: Parallel execution with graceful degradation
var userTask = _userService.GetUserAsync(id);
var ordersTask = _orderService.GetOrdersAsync(id);
var recsTask = _recService.GetAsync(id);

await Task.WhenAll(userTask, ordersTask, recsTask);

// Handle individual failures gracefully
var user = await userTask; // Required - throw if failed
var orders = ordersTask.IsCompletedSuccessfully 
    ? await ordersTask 
    : Array.Empty<Order>();  // Optional - degrade gracefully
var recs = recsTask.IsCompletedSuccessfully 
    ? await recsTask 
    : Array.Empty<Recommendation>();
```

**Design for partial failure.** Not every piece of data is equally important. User profile is critical; recommendations are nice-to-have. Degrade gracefully when non-critical services fail.

**Use async messaging for non-blocking operations.** If you don't need an immediate response, don't make a synchronous call.

## SPOF 5: Missing Circuit Breakers on HTTP Clients

### The Problem

When a downstream service fails, your HttpClient keeps trying. Each request waits for timeout. Threads pile up. Connection pools exhaust. Your service becomes unresponsive - not because it's broken, but because it's waiting for something else that's broken.

Without circuit breakers, a single failing dependency can take down your entire service. The failure propagates upstream, and suddenly multiple services are affected by one component's issue.

### Detection

Signs you're missing circuit breakers:
- Services fail together (strong correlation in error rates)
- High thread counts or connection pool exhaustion during downstream failures
- Timeout errors dominate during incidents
- Recovery takes longer than it should after downstream service recovers

### Mitigation

Add Polly resilience handlers to every HTTP client:

```csharp
builder.Services.AddHttpClient("ExternalApi")
    .AddResilienceHandler("default", resilienceBuilder =>
    {
        resilienceBuilder
            .AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.5,           // Open after 50% failure rate
                SamplingDuration = TimeSpan.FromSeconds(10),
                MinimumThroughput = 8,        // Need at least 8 requests to evaluate
                BreakDuration = TimeSpan.FromSeconds(30)
            })
            .AddTimeout(TimeSpan.FromSeconds(10));
    });
```

When the circuit opens, requests fail immediately instead of waiting for timeout. This:
- Frees up threads and connections
- Returns errors to callers faster
- Gives the downstream service time to recover
- Prevents cascade failures

## Detection Techniques

### Health Checks

Comprehensive health checks reveal dependencies before they become SPOFs:

```csharp
builder.Services.AddHealthChecks()
    .AddSqlServer(connectionString, name: "database", tags: new[] { "ready" })
    .AddRedis(redisConnection, name: "cache", tags: new[] { "ready" })
    .AddUrlGroup(new Uri("https://auth-service/health"), name: "auth-service")
    .AddUrlGroup(new Uri("https://payment-api/health"), name: "payment-api");
```

If a health check failing means your service can't function, you've identified a SPOF.

### Chaos Testing

The most reliable way to find SPOFs is to break things intentionally:
- Kill random containers and observe recovery
- Block network access to specific dependencies
- Introduce latency on internal networks
- Exhaust connection pools deliberately

Tools like Simmy (Polly's chaos engineering extension) or Chaos Monkey help automate this.

## Incident Response Checklist

When you discover a SPOF in production:

- [ ] Identify the single point of failure
- [ ] Assess blast radius (what else fails when this fails?)
- [ ] Implement short-term mitigation (can you add a second instance? Fallback?)
- [ ] Plan long-term fix (redundancy, graceful degradation, circuit breakers)
- [ ] Add monitoring and alerting for this component
- [ ] Document in runbook for future incidents
- [ ] Schedule chaos testing to verify the fix

## Conclusion

SPOFs in microservices are sneaky. They hide in shared infrastructure, implicit dependencies, and optimistic assumptions. Every system has them - the question is whether you find them through architecture review and chaos testing, or through production outages.

Start by auditing your dependencies. For each external system your service talks to, ask: "What happens if this is unavailable?" If the answer is "everything breaks," you've found a SPOF. Then apply the patterns above: circuit breakers, fallbacks, graceful degradation, redundancy.

Resilience isn't about preventing all failures. It's about ensuring that when one thing fails, only that one thing is affected.

---

*Found a hidden SPOF in your architecture? Share your war stories in the comments!*
