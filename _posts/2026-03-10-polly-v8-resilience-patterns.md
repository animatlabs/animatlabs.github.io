---
title: ".NET Resilience: When the Defaults Aren't Enough"
excerpt: >-
  "AddStandardResilienceHandler covers 80% of cases. Here's what I do for the other 20% - custom pipelines, non-HTTP scenarios, and the production config that saved my app."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Polly
  - Resilience
  - Circuit Breaker
  - Retry
  - Microservices
author: animat089
last_modified_at: 2026-03-10
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Outage That Took 10 Minutes to Fix

A third-party API started timing out. No circuit breakers. Each request queued up waiting for a response that never came. Within minutes our connection pool was exhausted. Requests to completely unrelated endpoints started failing. One flaky dependency, full outage.

The fix took 10 minutes. The outage lasted 45.


## The 80% Solution: One Line

`Microsoft.Extensions.Http.Resilience` ships with a pre-configured pipeline that handles retries, circuit breakers, and timeouts out of the box:

```csharp
builder.Services.AddHttpClient("MyApi")
    .AddStandardResilienceHandler();
```

That's it. You get exponential backoff with jitter, a circuit breaker, and a timeout - all with sensible defaults. For most HTTP clients, this is all you need.

```bash
dotnet add package Microsoft.Extensions.Http.Resilience
```

If `AddStandardResilienceHandler()` covers your use case, stop here. What follows is for the cases where it doesn't.

## When You Need More

I reach for custom Polly pipelines when:

- **Different backends need different configs.** A payment gateway gets 2 retries and a 5-second timeout. An analytics endpoint gets 5 retries and 30 seconds.
- **Non-HTTP scenarios.** Database calls, message queues, file I/O - `AddStandardResilienceHandler` only works with `IHttpClientFactory`.
- **Stricter SLAs.** The default circuit breaker settings are generous. If your SLA is 500ms, you need tighter controls.
- **Observability hooks.** Custom `OnRetry`, `OnOpened`, `OnTimeout` callbacks for structured logging and alerting.

## Retries Without Thundering Herd

Retries are the simplest pattern - if something fails, try again. Naive retries make things worse though. If a service is struggling, hammering it with immediate retries adds fuel.

**When to use retries:**
- Transient failures (network blips, temporary unavailability)
- Idempotent operations (safe to repeat)

**When NOT to:**
- Non-idempotent operations (payments, order creation) without safeguards
- Validation errors (4xx won't succeed on retry)

```csharp
var retryPipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromSeconds(1),
        BackoffType = DelayBackoffType.Exponential,
        UseJitter = true,
        OnRetry = args =>
        {
            Console.WriteLine($"Retry {args.AttemptNumber} after {args.RetryDelay}");
            return ValueTask.CompletedTask;
        }
    })
    .Build();

var result = await retryPipeline.ExecuteAsync(async ct =>
{
    return await _httpClient.GetAsync("/api/data", ct);
});
```

`UseJitter = true` is crucial. Without it, all your instances retry at the same intervals - thundering herd. Jitter adds randomness to spread retries out.

## Circuit Breaker: Fail Fast, Recover Fast

Circuit breakers prevent cascading failures. When a downstream service is unhealthy, you fail fast instead of queueing up doomed requests.

**Three states:**
- **Closed** - normal, requests flow through
- **Open** - too many failures, requests fail immediately
- **Half-Open** - after the break, a few test requests check recovery

```csharp
var circuitBreakerPipeline = new ResiliencePipelineBuilder()
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions
    {
        FailureRatio = 0.5,
        SamplingDuration = TimeSpan.FromSeconds(10),
        MinimumThroughput = 8,
        BreakDuration = TimeSpan.FromSeconds(30),
        OnOpened = args =>
        {
            Console.WriteLine("Circuit opened - failing fast");
            return ValueTask.CompletedTask;
        },
        OnClosed = args =>
        {
            Console.WriteLine("Circuit closed - back to normal");
            return ValueTask.CompletedTask;
        }
    })
    .Build();
```

`MinimumThroughput` is often overlooked. It stops the circuit from opening during low-traffic periods when a single failure would exceed the ratio.

## Timeouts: Your Safety Net

Without timeouts, a slow downstream service consumes your connection pool and thread pool until the whole app stalls.

I set two levels: an overall timeout for the entire operation (including retries) and a per-attempt timeout for individual calls.

```csharp
var timeoutPipeline = new ResiliencePipelineBuilder()
    .AddTimeout(new TimeoutStrategyOptions
    {
        Timeout = TimeSpan.FromSeconds(10),
        OnTimeout = args =>
        {
            Console.WriteLine($"Timeout after {args.Timeout}");
            return ValueTask.CompletedTask;
        }
    })
    .Build();
```

Common mistake: timeouts too high. If your SLA requires a response in 2 seconds, a 30-second timeout means you'll violate the SLA long before it triggers.

Set timeouts from your actual latency requirements, not how long the downstream *might* take.

## Combining Strategies

Polly's power is in composition. Order matters - strategies apply outer to inner.

Typical production setup:
1. **Overall timeout** - max time for the entire operation
2. **Retry** - retry transient failures
3. **Circuit breaker** - stop trying if the service is unhealthy
4. **Per-attempt timeout** - limit individual call duration

```csharp
var resiliencePipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 3,
        Delay = TimeSpan.FromSeconds(1),
        BackoffType = DelayBackoffType.Exponential
    })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions
    {
        FailureRatio = 0.5,
        BreakDuration = TimeSpan.FromSeconds(30)
    })
    .AddTimeout(TimeSpan.FromSeconds(5))
    .Build();
```

Each HTTP call gets 5 seconds. Failures retry up to 3 times with exponential backoff. If 50% of calls fail, the circuit opens for 30 seconds. The whole operation must finish within 30 seconds.

## Custom Pipelines with HttpClient

When `AddStandardResilienceHandler()` isn't enough, use `AddResilienceHandler` for full control:

```csharp
builder.Services.AddHttpClient("PaymentGateway")
    .AddResilienceHandler("strict", builder =>
    {
        builder
            .AddTimeout(TimeSpan.FromSeconds(5))
            .AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = 2,
                BackoffType = DelayBackoffType.Exponential
            })
            .AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.3,
                SamplingDuration = TimeSpan.FromSeconds(10),
                BreakDuration = TimeSpan.FromSeconds(30)
            });
    });

builder.Services.AddHttpClient("AnalyticsApi")
    .AddStandardResilienceHandler();
```

Payment gateway: tight timeout, fewer retries, aggressive circuit breaker. Analytics: default resilience is fine. Different backends, different configs.

`HttpRetryStrategyOptions` and `HttpCircuitBreakerStrategyOptions` handle transient HTTP errors (5xx, network failures) without you specifying which exceptions to catch.

## WorkflowForge Integration

If you're using [WorkflowForge](https://github.com/animatlabs/workflow-forge) for workflow orchestration, the Polly extension adds resilience as middleware on your foundry.

**Retry only** - add to the foundry, applies to all operations:

```csharp
// dotnet add package WorkflowForge.Extensions.Resilience.Polly
using WorkflowForge.Extensions.Resilience.Polly;

using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
foundry.UsePollyRetry(maxRetryAttempts: 3, baseDelay: TimeSpan.FromSeconds(1));
```

**All-in-one** - retry, circuit breaker, and timeout in a single call:

```csharp
foundry.UsePollyComprehensive(
    maxRetryAttempts: 3,
    circuitBreakerThreshold: 5,
    timeoutDuration: TimeSpan.FromSeconds(30));
```

Or wrap individual operations instead of the whole foundry:

```csharp
var resilientOp = PollyRetryOperation.WithRetryPolicy(
    new ActionWorkflowOperation("CallApi", async (input, foundry, ct) =>
    {
        // call external API
    }),
    maxRetryAttempts: 3,
    baseDelay: TimeSpan.FromSeconds(1));
```

## My Defaults

| Pattern | Default Value | Reasoning |
|-----|--------|------|
| Retry attempts | 3 | Enough for transient failures, not so many we delay failure detection |
| Initial delay | 1 second | Long enough for transient issues to resolve |
| Backoff | Exponential with jitter | Prevents thundering herd |
| Circuit breaker failure ratio | 50% | Sensitive enough to catch problems, not so sensitive normal variance triggers it |
| Circuit break duration | 30 seconds | Long enough for recovery, short enough we don't miss when services come back |
| Timeout | 10 seconds (per-call), 30 seconds (overall) | Depends on your SLA |

What's saved me in production: circuit breakers on every external HTTP client, no exceptions. Structured logging in `OnRetry` and `OnOpened`. Separate configs for critical vs non-critical services.

## Run It

The code snippets in this post are standalone. Copy-paste into any .NET 8+ project:

```bash
dotnet add package Microsoft.Extensions.Http.Resilience
```

For custom pipelines outside of `IHttpClientFactory`:

```bash
dotnet add package Polly
```

For WorkflowForge integration:

```bash
dotnet add package WorkflowForge.Extensions.Resilience.Polly
```

Start with `AddStandardResilienceHandler()`. Customize when you hit its limits. The best time to add resilience was before your first outage.

---

*What's your go-to when a downstream service starts flaking?*

{% include cta-workflowforge.html %}