---
title: "Polly v8 in .NET: Retry, Circuit Breaker, and Timeout Resilience Patterns"
excerpt: >-
  Practical Polly v8 resilience patterns for .NET including retry, circuit breaker, timeout, and rate limiting. From the one-liner that covers 80% of cases to custom pipelines.
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
last_modified_at: 2026-03-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
faq:
  - q: "What is Polly v8 in .NET?"
    a: "The usual resilience toolbox—retry, breaker, timeout, rate limit, hedging—exposed as composable pipelines. Pair it with `IHttpClientFactory` and `Microsoft.Extensions.Http.Resilience` in ASP.NET Core and you're most of the way there."
  - q: "What is the difference between Polly v7 and v8?"
    a: "v8 is pipeline-first (`ResiliencePipelineBuilder`) instead of the old policy objects, plays nicer with DI, and lines up with `Microsoft.Extensions.Resilience`. Same ideas, different surface area."
  - q: "How do I add retry and circuit breaker to HttpClient in .NET?"
    a: "On the client registration, chain `AddStandardResilienceHandler()` from `Microsoft.Extensions.Http.Resilience`. Honestly, that one line covers most HTTP cases I see—retry with jitter, breaker, timeout—before anyone hand-rolls loops."
---

Most .NET apps I've worked on had zero resilience code until something actually broke. A third-party API times out, the connection pool fills up, and suddenly completely unrelated endpoints start failing. The usual pattern: someone adds a try-catch, wraps it in a retry loop with `Thread.Sleep`, and calls it a day. Works until it doesn't.

Polly v8 does this properly. I want to walk through how I set it up, what the defaults give you, and where I've had to go beyond them. Retries without jitter are basically a distributed denial of service you aimed at yourself, which is a mouthful, but it is also the fastest way to turn a brownout into an outage when every pod wakes up and slams the same downstream at the same millisecond.

## Start Here

`Microsoft.Extensions.Http.Resilience` gives you a pre-configured pipeline with one line:

```bash
dotnet add package Microsoft.Extensions.Http.Resilience
```

```csharp
builder.Services.AddHttpClient("MyApi")
    .AddStandardResilienceHandler();
```

That gets you exponential backoff with jitter, a circuit breaker, and a timeout. Sensible defaults. For most HTTP clients in a typical web app, this is enough. Honestly, I wish more teams would start here instead of building custom retry logic from scratch.

If this covers your case, stop reading. What follows is for the other 20%.

## Going Beyond the Defaults

I reach for custom Polly pipelines when the one-liner doesn't fit. In my experience that's usually one of these situations:

- A payment gateway needs 2 retries with a 5-second timeout while an analytics endpoint is fine with 5 retries and 30 seconds
- Database calls, message queues, file I/O. Anything that isn't `IHttpClientFactory`
- The SLA is tight enough (say 500ms) that the default circuit breaker settings are too generous
- I need `OnRetry` or `OnOpened` callbacks wired into our structured logging

## Retries

If something fails, try again. Simple idea, easy to get wrong. Naive retries with fixed delays can turn a struggling service into a dead one because every instance retries at the same interval and you get a thundering herd.

The fix is jitter. `UseJitter = true` adds randomness to the backoff so retries spread out instead of hitting the downstream service in waves. I've seen this make the difference between a service recovering on its own and a full cascading failure.

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

One thing to watch: don't retry non-idempotent operations without safeguards. Retrying a payment charge can double-bill someone. Retrying a 400 is pointless because it'll fail the same way every time.

## Circuit Breaker

When a downstream service is unhealthy, retrying just delays the inevitable. Circuit breakers flip the approach: once failures cross a threshold, stop trying altogether and fail fast.

The circuit has three states. Closed (normal flow), Open (requests fail immediately), and Half-Open (a few test requests probe whether the service recovered). Pretty standard pattern, but there's a setting most people miss:

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

`MinimumThroughput` is the one. Without it, a single failure during low-traffic hours (say, 1 request in 10 seconds) would open the circuit because 1/1 = 100% failure. I set it to 8 so the circuit only evaluates after enough requests to be meaningful.

## Timeouts

This is the one that bit us the hardest. Without timeouts, a slow downstream service silently consumes your connection pool and thread pool until the whole app stalls. No errors, no exceptions. Just increasing latency and then everything stops.

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

I use two levels: an overall timeout for the entire operation (including retries) and a per-attempt timeout for individual calls. A common mistake is setting the timeout to 30 seconds when the SLA requires a 2-second response. By the time it fires, you've already violated the SLA.

## Putting It Together

Order matters when you compose strategies. They apply outer to inner:

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

So each HTTP call gets 5 seconds max. Failures retry up to 3 times with exponential backoff. If 50% of calls fail within the sampling window, the circuit opens for 30 seconds. And the whole thing wraps in a 30-second overall timeout.

## Per-Client Configuration

When `AddStandardResilienceHandler()` isn't enough, `AddResilienceHandler` gives you full control per named client:

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

Payment gateway gets tight timeouts, fewer retries, and an aggressive circuit breaker. Analytics API is fine with defaults. `HttpRetryStrategyOptions` and `HttpCircuitBreakerStrategyOptions` handle transient HTTP errors (5xx, network failures) so you don't have to specify which exceptions to catch.

## WorkflowForge Integration

If you're using [WorkflowForge](https://github.com/animatlabs/workflow-forge) for workflow orchestration, the Polly extension adds resilience as middleware on the foundry:

```csharp
// dotnet add package WorkflowForge.Extensions.Resilience.Polly
using WorkflowForge.Extensions.Resilience.Polly;

using var foundry = WorkflowForge.CreateFoundry("OrderProcessing");
foundry.UsePollyRetry(maxRetryAttempts: 3, baseDelay: TimeSpan.FromSeconds(1));
```

Or go all-in with retry, circuit breaker, and timeout together:

```csharp
foundry.UsePollyComprehensive(
    maxRetryAttempts: 3,
    circuitBreakerThreshold: 5,
    timeoutDuration: TimeSpan.FromSeconds(30));
```

You can also wrap individual operations instead of the entire foundry:

```csharp
var resilientOp = PollyRetryOperation.WithRetryPolicy(
    new ActionWorkflowOperation("CallApi", async (input, foundry, ct) =>
    {
        // call external API
    }),
    maxRetryAttempts: 3,
    baseDelay: TimeSpan.FromSeconds(1));
```

## What I Actually Run in Production

| Pattern | Value | Why |
|-----|--------|------|
| Retry attempts | 3 | Enough for transient blips, not so many it delays failure detection |
| Initial delay | 1 second | Gives transient issues time to clear |
| Backoff | Exponential + jitter | Prevents thundering herd |
| Circuit breaker ratio | 50% | Catches real problems without tripping on normal variance |
| Break duration | 30 seconds | Long enough for recovery, short enough to detect when services come back |
| Timeout | 10s per-call, 30s overall | Adjust to your SLA |

The patterns above are what I've settled on after running these in production for a while. Circuit breakers on every external HTTP client, structured logging in `OnRetry` and `OnOpened` so we actually know when things degrade, and separate configs for critical vs best-effort services.

The snippets above are standalone. Copy them into any .NET 8+ project with `dotnet add package Polly` (or `Microsoft.Extensions.Http.Resilience` for the `IHttpClientFactory` integration). For WorkflowForge, add `WorkflowForge.Extensions.Resilience.Polly`.

{% include cta-workflowforge.html %}

---

## More on This Topic

- [Redis distributed locking in .NET](/technical/.net/.net-core/redis-distributed-locking/)
- [Refit API clients](/technical/.net/.net-core/refit-api-sdk/)
- [MassTransit saga with WorkflowForge](/technical/.net/workflow/masstransit-workflowforge-saga/)
