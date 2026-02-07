---
title: "Polly v8: Resilience Patterns for Production .NET Apps"
excerpt: >-
  "Circuit breakers, retries, and timeouts - here's how I use Polly v8 to build resilient .NET services that survive failures gracefully."
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
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Why Resilience Matters

Every distributed system fails eventually. The question is not *if* your external dependencies will become unavailable, but *when* - and whether your application fails gracefully or takes down everything with it.

I learned this the hard way when a third-party API started timing out intermittently. Without circuit breakers, each request queued up waiting for a response that never came. Within minutes, our connection pool was exhausted, and requests to completely unrelated endpoints started failing. A single flaky dependency cascaded into a full system outage.

The fix took 10 minutes to implement. The outage lasted 45 minutes. Here's how to avoid the same mistake.

## Polly v8: What Changed

If you've used Polly before, v8 is a significant departure from the policy-based approach of v7. The new API is cleaner, more composable, and delivers better performance.

Key changes in Polly v8:

- **Unified `ResiliencePipeline` approach** - Instead of separate policies, you now build pipelines that chain strategies together
- **Better performance** - Reduced allocations and improved throughput, especially under high load
- **Simplified configuration** - Fluent builder pattern makes complex configurations readable
- **Native async support** - First-class async/await without the awkward `PolicyAsync` distinction
- **Built-in telemetry** - OpenTelemetry integration for observability

The mental model shift: think of resilience as a *pipeline* that your operations flow through, with each strategy acting as a stage in that pipeline.

## Pattern 1: Retry with Exponential Backoff

Retries are the simplest resilience pattern - if something fails, try again. But naive retries can make things worse. If a service is struggling under load, hammering it with immediate retries only adds fuel to the fire.

**When to use retries:**
- Transient failures (network blips, temporary unavailability)
- Idempotent operations (safe to repeat)
- External services with occasional hiccups

**When NOT to use retries:**
- Non-idempotent operations (payments, order creation) without additional safeguards
- Validation errors or bad requests (4xx responses won't succeed on retry)
- When the downstream service is clearly overloaded

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

// Usage
var result = await retryPipeline.ExecuteAsync(async ct =>
{
    return await _httpClient.GetAsync("/api/data", ct);
});
```

The `UseJitter = true` setting is crucial. Without jitter, all your instances retry at exactly the same intervals, creating thundering herd problems. Jitter adds randomness to spread out the retry attempts.

## Pattern 2: Circuit Breaker

Circuit breakers prevent cascading failures by "breaking the circuit" when a downstream service is unhealthy. Instead of continuing to send requests that will likely fail, the circuit breaker fails fast and gives the downstream service time to recover.

**The three states:**
- **Closed** - Normal operation, requests flow through
- **Open** - Too many failures detected, requests fail immediately without attempting the call
- **Half-Open** - After the break duration, a limited number of requests are allowed through to test if the service has recovered

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

The `MinimumThroughput` setting is often overlooked but important. It prevents the circuit from opening during low-traffic periods when a single failure would exceed the failure ratio.

## Pattern 3: Timeout

Timeouts are your safety net against hanging requests. Without them, a slow downstream service can consume your connection pool and thread pool, eventually bringing down your entire application.

I prefer setting two levels of timeouts: an overall timeout for the entire operation (including retries) and a per-attempt timeout for individual calls.

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

A common mistake is setting timeouts too high. If your SLA requires a response in 2 seconds, a 30-second timeout means you'll violate your SLA long before the timeout triggers. Set timeouts based on your actual latency requirements, not on how long you think the downstream service *might* take.

## Pattern 4: Combining Strategies

The real power of Polly comes from combining strategies. The order matters - strategies are applied from outer to inner, like layers of an onion.

A typical production configuration:
1. **Overall timeout** - Maximum time for the entire operation
2. **Retry** - Retry transient failures
3. **Circuit breaker** - Stop trying if the service is unhealthy
4. **Per-attempt timeout** - Limit individual call duration

```csharp
var resiliencePipeline = new ResiliencePipelineBuilder()
    .AddTimeout(TimeSpan.FromSeconds(30))          // Overall timeout
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
    .AddTimeout(TimeSpan.FromSeconds(5))           // Per-attempt timeout
    .Build();
```

With this configuration, each individual HTTP call has 5 seconds to complete. If it fails, we retry up to 3 times with exponential backoff. If 50% of calls fail within the sampling window, the circuit opens and we fail fast for 30 seconds. The entire operation (including all retries) must complete within 30 seconds.

## Using with HttpClient (Recommended)

For HTTP calls, the cleanest approach is integrating Polly with `IHttpClientFactory`. This gives you centralized configuration and proper HttpClient lifecycle management.

```csharp
// In Program.cs
builder.Services.AddHttpClient("ResilientClient")
    .AddResilienceHandler("default", builder =>
    {
        builder
            .AddTimeout(TimeSpan.FromSeconds(10))
            .AddRetry(new HttpRetryStrategyOptions
            {
                MaxRetryAttempts = 3,
                BackoffType = DelayBackoffType.Exponential
            })
            .AddCircuitBreaker(new HttpCircuitBreakerStrategyOptions
            {
                FailureRatio = 0.5,
                SamplingDuration = TimeSpan.FromSeconds(10),
                BreakDuration = TimeSpan.FromSeconds(30)
            });
    });
```

The `HttpRetryStrategyOptions` and `HttpCircuitBreakerStrategyOptions` are HTTP-aware variants that automatically handle transient HTTP errors (5xx responses, network failures) without you needing to specify which exceptions to catch.

## WorkflowForge Integration

If you're using [WorkflowForge](https://github.com/animatlabs/workflow-forge) for workflow orchestration, resilience is built-in through the Polly extension:

```csharp
// WorkflowForge.Extensions.Resilience.Polly
var foundry = WorkflowForge.CreateFoundry("OrderProcessing")
    .UsePollyResilience(options =>
    {
        options.RetryCount = 3;
        options.CircuitBreakerThreshold = 5;
        options.TimeoutSeconds = 30;
    })
    .Build();
```

This applies resilience patterns to all workflow operations automatically, so you don't need to wrap each step individually.

## My Recommendations

After running Polly in production across multiple services, here are the defaults I start with:

| Pattern | Default Value | Reasoning |
|---------|---------------|-----------|
| Retry attempts | 3 | Enough for transient failures, not so many that we delay failure detection |
| Initial delay | 1 second | Long enough for transient issues to resolve |
| Backoff | Exponential with jitter | Prevents thundering herd |
| Circuit breaker failure ratio | 50% | Sensitive enough to catch problems, not so sensitive that normal variance triggers it |
| Circuit break duration | 30 seconds | Long enough for recovery, short enough that we don't miss when services come back |
| Timeout | 10 seconds (per-call), 30 seconds (overall) | Depends on your SLA |

**What has saved me in production:**
- Circuit breakers on every external HTTP client, no exceptions
- Structured logging in the `OnRetry` and `OnOpened` callbacks for debugging
- Separate resilience configurations for critical vs. non-critical services
- Regular chaos testing to verify resilience actually works

## Conclusion

Resilience isn't optional in distributed systems - it's a requirement. Polly v8 makes implementing production-grade resilience patterns straightforward with its pipeline-based approach.

Start with the basics: retries with exponential backoff, circuit breakers on external calls, and timeouts everywhere. Then tune based on your specific latency requirements and failure patterns.

The best time to add resilience was before your first outage. The second best time is now.

---

*Have questions about resilience patterns or Polly configuration? Let me know in the comments!*
