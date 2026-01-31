---
title: "OpenTelemetry in .NET: Distributed Tracing That Actually Works"
excerpt: >-
  "Tracing across microservices doesn't have to be painful. Here's my setup for OpenTelemetry with Jaeger visualization."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - OpenTelemetry
  - Distributed Tracing
  - Jaeger
  - Observability
  - Microservices
  - WorkflowForge
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Why Distributed Tracing?

In a monolith, debugging is straightforward. You have one process, one log file, and stack traces that tell you exactly where things went wrong. A request comes in, flows through your code, and returns a response. Easy.

In microservices, a single user request might touch five different services, three databases, and two external APIs. When something fails - or worse, when something is *slow* - figuring out where the problem lies becomes detective work.

Distributed tracing solves this by connecting the dots. Each request gets a unique trace ID that follows it across service boundaries. Every operation becomes a "span" with timing information. When you visualize a trace, you see the entire journey of a request: which services it touched, how long each step took, and where things went wrong.

Without tracing, you're guessing. With tracing, you're debugging with data.

## OpenTelemetry Basics

OpenTelemetry (OTel) is the industry standard for observability. It's vendor-neutral, meaning you can export your telemetry data to Jaeger, Zipkin, Azure Monitor, Datadog, or any other backend without changing your instrumentation code.

### Core Concepts

**Traces:** The complete journey of a request through your system. A trace contains multiple spans.

**Spans:** Individual operations within a trace. Each span has a name, start/end time, and can contain tags (key-value metadata) and events.

**Context Propagation:** The mechanism that passes trace context (trace ID, span ID) across service boundaries, typically via HTTP headers.

### Setup

Here's the basic setup for a .NET service:

```csharp
// Install packages:
// OpenTelemetry
// OpenTelemetry.Extensions.Hosting
// OpenTelemetry.Instrumentation.AspNetCore
// OpenTelemetry.Instrumentation.Http
// OpenTelemetry.Exporter.Jaeger

builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .SetResourceBuilder(ResourceBuilder.CreateDefault()
                .AddService("OrderService", serviceVersion: "1.0.0"))
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddEntityFrameworkCoreInstrumentation()
            .AddSource("OrderService")  // Custom activity source
            .AddJaegerExporter(options =>
            {
                options.AgentHost = "localhost";
                options.AgentPort = 6831;
            });
    });
```

This configuration:
1. Names your service "OrderService" (appears in trace UI)
2. Automatically instruments incoming HTTP requests (ASP.NET Core)
3. Automatically instruments outgoing HTTP requests (HttpClient)
4. Automatically instruments EF Core database calls
5. Registers a custom activity source for manual instrumentation
6. Exports traces to a local Jaeger instance

### Creating Custom Spans

Auto-instrumentation covers HTTP and database calls, but you'll want to add custom spans for important business operations:

```csharp
private static readonly ActivitySource ActivitySource = new("OrderService");

public async Task<Order> ProcessOrderAsync(Order order)
{
    using var activity = ActivitySource.StartActivity("ProcessOrder");
    
    // Add useful metadata
    activity?.SetTag("order.id", order.Id);
    activity?.SetTag("order.total", order.Total);
    activity?.SetTag("order.item_count", order.Items.Count);
    
    // Record events for important milestones
    activity?.AddEvent(new ActivityEvent("ValidationStarted"));
    await ValidateOrderAsync(order);
    activity?.AddEvent(new ActivityEvent("ValidationCompleted"));
    
    activity?.AddEvent(new ActivityEvent("PaymentProcessingStarted"));
    await ProcessPaymentAsync(order);
    activity?.AddEvent(new ActivityEvent("PaymentCompleted"));
    
    return order;
}
```

Spans are hierarchical. If `ProcessOrderAsync` calls `ValidateOrderAsync`, and `ValidateOrderAsync` creates its own span, the validation span automatically becomes a child of the processing span.

## Jaeger Setup with Docker

Jaeger is a popular open-source tracing backend. The all-in-one Docker image is perfect for local development:

```yaml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"   # UI
      - "6831:6831/udp" # Agent (Thrift compact)
      - "14268:14268"   # Collector HTTP
      - "14250:14250"   # Collector gRPC
    environment:
      - COLLECTOR_ZIPKIN_HOST_PORT=:9411
```

Run `docker-compose up -d jaeger`, then open `http://localhost:16686` to access the Jaeger UI.

### Reading Traces in Jaeger

When you search for traces in Jaeger:
1. Select your service from the dropdown
2. Set a time range
3. Click "Find Traces"

Each trace shows:
- **Duration:** Total time for the request
- **Span count:** Number of operations
- **Timeline:** Waterfall view of all spans

Click a trace to see details. Look for:
- Long spans (performance bottlenecks)
- Gaps between spans (network latency or missing instrumentation)
- Error tags on failed spans

## WorkflowForge Integration

If you're using [WorkflowForge](https://github.com/animatlabs/workflow-forge) for workflow orchestration, OpenTelemetry integration is built-in:

```csharp
// WorkflowForge.Extensions.Observability.OpenTelemetry
var foundry = WorkflowForge.CreateFoundry("OrderProcessing")
    .EnableOpenTelemetry("OrderService", "1.0.0")
    .Build();

// Each workflow operation is automatically traced
using var smith = WorkflowForge.CreateSmith();
var result = await smith.ForgeAsync(workflow, input);
```

With this enabled, each workflow operation appears as a child span under the workflow trace. You can see exactly how long each step took and where failures occurred.

## What to Trace

Not everything needs a span. Too many spans create noise and increase overhead. Here's my strategy:

**Always trace:**
- Incoming HTTP requests (auto-instrumented)
- Outgoing HTTP requests (auto-instrumented)
- Database queries (auto-instrumented)
- Message queue publish/consume
- External API calls
- Cache operations
- Long-running business operations

**Add tags for:**
- User ID or tenant ID (for filtering)
- Entity IDs (order ID, product ID)
- Business-relevant counts (item count, batch size)
- Feature flags or experiment variants

**Skip tracing:**
- CPU-bound loops (creates thousands of spans)
- Simple property access or validation
- In-memory transformations
- Anything that takes microseconds

### Sampling

In production, tracing every request is expensive. Use sampling to capture a representative subset:

```csharp
tracing.SetSampler(new TraceIdRatioBasedSampler(0.1)); // Sample 10% of traces
```

For errors or slow requests, you might want 100% sampling. Configure this with a composite sampler:

```csharp
// Always sample errors, sample 10% of everything else
tracing.SetSampler(new ParentBasedSampler(
    new TraceIdRatioBasedSampler(0.1)));
```

## Connecting Services

The real power of distributed tracing is seeing requests flow across services. OpenTelemetry handles context propagation automatically for HTTP calls.

When Service A calls Service B using HttpClient, OTel:
1. Injects trace headers into the outgoing request
2. Service B's instrumentation reads these headers
3. Service B's spans become children of Service A's span
4. The trace shows the complete journey

This works out of the box with `AddHttpClientInstrumentation()`.

For messaging systems (RabbitMQ, Kafka), you'll need to propagate context manually or use library-specific instrumentation packages.

## Production Considerations

**Choose your backend wisely.** Jaeger is great for development, but for production consider:
- Managed services (Azure Monitor, AWS X-Ray, Datadog)
- Self-hosted with storage (Jaeger with Elasticsearch/Cassandra)
- Cost implications of trace storage

**Set retention policies.** Traces generate significant data. Configure your backend to purge old traces automatically.

**Add service metadata.** Include environment, version, and deployment info in your resource builder:

```csharp
.SetResourceBuilder(ResourceBuilder.CreateDefault()
    .AddService("OrderService", serviceVersion: "1.0.0")
    .AddAttributes(new[]
    {
        new KeyValuePair<string, object>("deployment.environment", "production"),
        new KeyValuePair<string, object>("host.name", Environment.MachineName)
    }))
```

**Monitor tracing overhead.** While OTel is efficient, excessive spans or high sampling rates can impact performance. Measure before and after enabling tracing.

## Conclusion

Distributed tracing transforms microservices debugging from guesswork into data-driven investigation. OpenTelemetry provides a vendor-neutral standard, and the .NET integration makes instrumentation straightforward.

Start with auto-instrumentation for HTTP and database calls. Add custom spans for important business operations. Use Jaeger for local development, and consider managed backends for production.

When your next production incident happens, you'll be glad you have traces.

**Full example:** [GitHub](https://github.com/animat089/opentelemetry-sample){: .btn .btn--primary}

---

*Using OpenTelemetry in production? Share your setup in the comments!*
