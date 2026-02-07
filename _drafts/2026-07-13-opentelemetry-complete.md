---
title: "OpenTelemetry: The Complete .NET Guide"
excerpt: >-
  "Traces, metrics, and logs unified. OpenTelemetry is the observability standard—here's how to implement it in .NET."
categories:
  - Technical
  - .NET
  - Observability
tags:
  - .NET
  - OpenTelemetry
  - Observability
  - Distributed Tracing
  - Metrics
  - Logging
  - Jaeger
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Observability Standard

OpenTelemetry is the second-largest CNCF project after Kubernetes. It's the vendor-neutral standard for traces, metrics, and logs. If you're not using it, you're likely locked into a vendor.

<!--
TARGET: 2,500-3,000 words

OUTLINE:
1. What is OpenTelemetry (CNCF, vendor-neutral)
2. The three pillars: Traces, Metrics, Logs
3. Setting up in .NET
4. Automatic instrumentation (ASP.NET Core, EF Core, HttpClient)
5. Custom instrumentation
6. Exporters (Jaeger, OTLP, Prometheus)
7. Correlation: Connecting traces, metrics, and logs

CODE EXAMPLES:
- Full OpenTelemetry setup
- Custom spans and activities
- Custom metrics
- Structured logging with trace correlation
- Docker setup with Jaeger
-->

## What Is OpenTelemetry?

<!-- TODO: CNCF project, vendor-neutral, unified observability -->

## The Three Pillars

```
┌─────────────────────────────────────────┐
│            OpenTelemetry                │
├─────────────┬─────────────┬─────────────┤
│   Traces    │   Metrics   │    Logs     │
│  (Request   │  (Counters, │  (Events,   │
│   flow)     │   gauges)   │   errors)   │
└─────────────┴─────────────┴─────────────┘
```

## Setup in .NET 10

```bash
dotnet add package OpenTelemetry.Extensions.Hosting
dotnet add package OpenTelemetry.Instrumentation.AspNetCore
dotnet add package OpenTelemetry.Instrumentation.Http
dotnet add package OpenTelemetry.Instrumentation.SqlClient
dotnet add package OpenTelemetry.Exporter.OpenTelemetryProtocol
```

```csharp
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource
        .AddService("MyService"))
    .WithTracing(tracing => tracing
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSqlClientInstrumentation()
        .AddOtlpExporter())
    .WithMetrics(metrics => metrics
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddOtlpExporter());
```

## Automatic Instrumentation

<!-- TODO: What's captured out of the box -->

## Custom Traces

```csharp
public class OrderService
{
    private static readonly ActivitySource ActivitySource = new("MyApp.Orders");
    
    public async Task<Order> CreateOrderAsync(OrderRequest request)
    {
        using var activity = ActivitySource.StartActivity("CreateOrder");
        activity?.SetTag("order.items", request.Items.Count);
        
        // Business logic here
        
        activity?.SetTag("order.id", order.Id);
        return order;
    }
}
```

## Custom Metrics

```csharp
private static readonly Meter Meter = new("MyApp.Orders");
private static readonly Counter<int> OrdersCreated = Meter.CreateCounter<int>("orders.created");

public async Task<Order> CreateOrderAsync(OrderRequest request)
{
    var order = // create order
    OrdersCreated.Add(1, new KeyValuePair<string, object>("status", "success"));
    return order;
}
```

## Structured Logging with Correlation

```csharp
// TODO: Serilog/Microsoft.Extensions.Logging with trace IDs
```

## Exporters

### Jaeger (Local Development)

```yaml
# docker-compose
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"  # UI
    - "4317:4317"    # OTLP gRPC
```

### OTLP (Production)

```csharp
// TODO: OTLP exporter configuration
```

## Conclusion

<!-- TODO: OpenTelemetry is the future of observability -->

---

*Implementing OpenTelemetry? Share your setup in the comments!*
