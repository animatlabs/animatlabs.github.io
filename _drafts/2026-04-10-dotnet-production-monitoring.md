---
title: "Why .NET Monitoring Is Not Optional in Production"
excerpt: >-
  "Your .NET app didn't crash. It's worse -- it's running, but the database is unreachable, the connection pool is exhausted, and background jobs stopped 3 hours ago."
categories:
  - Technical
  - .NET
tags:
  - C#
  - .NET
  - Monitoring
  - Prometheus
  - Grafana
  - Health Checks
  - Observability
author: animat089
last_modified_at: 2026-03-14
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Process Is Running. So What?

A .NET app rarely "dies" in production. More often: the API is running but can't reach the database. Requests start timing out because the connection pool is exhausted. Background jobs silently stop, but the process remains alive. Latency increases after a deployment, and you notice it hours later.

That's why monitoring isn't optional. You need two layers: health checks (is it alive? is it ready?) and metrics (how is it behaving over time?).

## Two Layers: Health Checks vs Metrics

Health checks answer binary questions. Is the process up? Can it talk to Postgres? Kubernetes uses these to decide whether to restart a pod or route traffic to it.

Metrics answer "how much" and "how fast." Request rate, latency percentiles, error counts. Prometheus scrapes them; Grafana visualizes them. You spot trends before they become incidents.

## Health Checks

### Liveness vs Readiness

**Liveness** (`/health/live`): Is the process alive? If this fails, Kubernetes restarts the pod. Keep it cheap -- no DB calls, no external dependencies.

**Readiness** (`/health/ready`): Can the app handle traffic? Check DB connectivity, Redis, message queues. If this fails, Kubernetes stops sending traffic until it recovers.

Here's the setup from the playground:

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddNpgSql(
        builder.Configuration.GetConnectionString("Postgres")
            ?? "Host=localhost;Port=5432;Database=monitoring_demo;Username=postgres;Password=postgres",
        name: "postgresql",
        tags: ["ready"]);
```

The `self` check is a no-op -- it always returns healthy. Tagged `live`. The Postgres check runs a quick query; tagged `ready`. You wire them to separate endpoints:

```csharp
// Liveness probe -- is the process alive?
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteHealthResponse
});

// Readiness probe -- can it handle traffic? (checks DB connectivity)
app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = WriteHealthResponse
});
```

### Custom JSON Response

The default health endpoint returns plain text. For Kubernetes you can use that, but for debugging and dashboards, JSON is nicer:

```csharp
static Task WriteHealthResponse(HttpContext ctx, HealthReport report)
{
    ctx.Response.ContentType = "application/json";
    var result = new
    {
        status = report.Status.ToString(),
        checks = report.Entries.Select(e => new
        {
            name = e.Key,
            status = e.Value.Status.ToString(),
            duration = e.Value.Duration.TotalMilliseconds + "ms",
            description = e.Value.Description
        })
    };
    return ctx.Response.WriteAsJsonAsync(result);
}
```

You get per-check status, duration, and description. When Postgres is down, you see it immediately.

### Kubernetes Usage

In your deployment manifest:

- `livenessProbe`: `httpGet` to `/health/live`. If it fails 3 times, Kubernetes restarts the container.
- `readinessProbe`: `httpGet` to `/health/ready`. If it fails, the pod is removed from the Service's endpoints. No traffic until it passes again.

That split matters. A deadlocked process might still respond to liveness (it's alive) but fail readiness (can't reach DB). Kubernetes won't restart it, but it won't send traffic either. You buy time to investigate.

## Prometheus Metrics

### Built-in HTTP Metrics

Add `prometheus-net.AspNetCore` and two lines:

```csharp
app.UseHttpMetrics();
app.MapMetrics();
```

You get `http_requests_received_total`, `http_request_duration_seconds`, and friends. Request count by path and status, latency histograms. No custom code.

### Custom Business Metrics

For domain-specific stuff, define your own. The playground has an order endpoint that records duration and success/failure:

```csharp
public sealed class OrderMetrics
{
    private static readonly Histogram OrderDuration = Metrics.CreateHistogram(
        "app_order_duration_seconds",
        "Time to process an order",
        new HistogramConfiguration
        {
            Buckets = Histogram.ExponentialBuckets(0.05, 2, 8)
        });

    private static readonly Counter OrdersTotal = Metrics.CreateCounter(
        "app_orders_total",
        "Total orders processed",
        new CounterConfiguration
        {
            LabelNames = ["status"]
        });

    public void RecordOrder(double durationSeconds, bool success)
    {
        OrderDuration.Observe(durationSeconds);
        OrdersTotal.WithLabels(success ? "accepted" : "failed").Inc();
    }
}
```

Register it as a singleton, inject it where you process orders:

```csharp
builder.Services.AddSingleton<OrderMetrics>();

// In the endpoint:
app.MapPost("/api/orders", async (OrderMetrics metrics) =>
{
    var sw = Stopwatch.StartNew();
    // ... do work ...
    sw.Stop();
    metrics.RecordOrder(sw.Elapsed.TotalSeconds, success);
    return success ? Results.Ok(...) : Results.Problem(...);
});
```

Exponential buckets (0.05, 0.1, 0.2, 0.4, ...) give you good resolution for typical order latencies. The counter splits by `accepted` vs `failed` so you can track error rate.

### The /metrics Endpoint

`MapMetrics()` exposes `/metrics` in Prometheus text format. Scrape it every 5–15 seconds. Example `prometheus.yml`:

```yaml
global:
  scrape_interval: 5s
  evaluation_interval: 5s

scrape_configs:
  - job_name: 'dotnet-monitoring-demo'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['host.docker.internal:5076']
        labels:
          app: 'monitoring-demo'
```

Replace the target with your service URL. In Kubernetes, use a Service or PodMonitor.

## Grafana: Key Queries

Connect Grafana to Prometheus as a data source. Three queries cover most of what you need:

**Request rate (requests per second):**

```promql
rate(http_requests_received_total[5m])
```

**p95 latency:**

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Business metrics (orders):**

```promql
rate(app_orders_total[5m])
```

Or split by status:

```promql
sum by (status) (rate(app_orders_total[5m]))
```

Create a dashboard with a time-series panel for each. You'll see traffic spikes, latency degradation, and error rate changes before users complain.

## Extending It

**Redis health check:** `AddRedis(connectionString, name: "redis", tags: ["ready"])`. Same pattern as Postgres.

**Background job health:** Implement `IHealthCheck` and ping your job processor or check its last run timestamp. Tag it `ready` so traffic stops if jobs are stuck.

**Alerting:** Add Alertmanager to Prometheus. Alert when `up == 0` for a target, or when `rate(http_requests_received_total{status=~"5.."}[5m]) > 0.01` (error rate above 1%). Start simple; add more rules as you learn what failure looks like.

## Wrap Up

Health checks tell you if the app is alive and ready. Metrics tell you how it's behaving. Pair this with [structured logging](/technical/structured-logging-with-serilog-the-production-setup/) and you'll never debug blind in production again.

<!--
LINKEDIN PROMO (150-250 words):

Your .NET app didn't crash. It's worse -- it's running, but the database is unreachable, the connection pool is exhausted, and background jobs stopped 3 hours ago.

I've seen it. The process is alive. The health endpoint returns 200. But users are complaining.

Two layers fix this: health checks (is it alive? is it ready?) and metrics (how is it behaving over time?). Liveness vs readiness matters in Kubernetes. Readiness checks DB, Redis, queues. If it fails, traffic stops. You get time to fix it without restarting.

Prometheus + Grafana give you the "how much" and "how fast." Request rate, p95 latency, error rate. Custom business metrics for orders, jobs, whatever. I wrote up the setup: health checks with custom JSON, prometheus-net for HTTP metrics, a simple OrderMetrics class for domain-specific counters and histograms, and the Prometheus/Grafana configs.

Working code in the playground. No slides.

What's your go-to for catching "running but broken" before users do?
-->
