---
title: "Health Checks and Metrics in .NET: A Production Setup"
excerpt: >-
  Liveness, readiness, Prometheus, Grafana, custom business metrics. The monitoring setup I use and the docker-compose to run it all locally.
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
last_modified_at: 2026-04-10
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

A .NET app rarely crashes outright. The process stays alive, but the database connection pool fills up, or background jobs stop running, or latency creeps up after a deployment and nobody notices for hours. The process is healthy in the "it's not dead" sense, but it's not doing what it should. You find out from a ticket.

This is the monitoring setup I use. Two layers: health checks for "is it alive and can it serve traffic?" and Prometheus metrics for "how is it behaving over time?" I still split **readiness** from **liveness** on greenfield services because readiness is the probe that actually tells you whether traffic should hit the box.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/DotNetMonitoring){: .btn .btn--primary}

## Health Checks: Liveness vs Readiness

The distinction matters in Kubernetes (and honestly, in any deployment).

**Liveness** (`/health/live`): is the process alive? If this fails, Kubernetes restarts the pod. Keep it cheap. No DB calls, no external dependencies. A deadlocked process should still fail this, but a healthy process should never do anything expensive here.

**Readiness** (`/health/ready`): can the app handle traffic? This checks PostgreSQL connectivity, Redis, message queues (whatever the app depends on). If readiness fails, Kubernetes stops routing traffic to that pod but doesn't restart it. You buy time to investigate instead of flapping restarts while Postgres is briefly unhappy, which is the whole point of splitting liveness and readiness probes in the first place anyway.

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddNpgSql(
        builder.Configuration.GetConnectionString("Postgres")
            ?? "Host=localhost;Port=5432;Database=monitoring_demo;Username=postgres;Password=postgres",
        name: "postgresql",
        tags: ["ready"]);
```

The `self` check is a no-op that always returns healthy. Tagged `live`. The Postgres check runs a quick query; tagged `ready`. Separate endpoints:

```csharp
app.MapHealthChecks("/health/live", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("live"),
    ResponseWriter = WriteHealthResponse
});

app.MapHealthChecks("/health/ready", new HealthCheckOptions
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = WriteHealthResponse
});
```

The default health response is plain text. For debugging and dashboards, I use a custom JSON writer:

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

Per-check status, duration, and description. When Postgres is down, you see it immediately, not a generic "Unhealthy" string.

## Prometheus Metrics

Health checks answer binary questions. Metrics answer "how much" and "how fast." Add `prometheus-net.AspNetCore` and two lines:

```csharp
app.UseHttpMetrics();
app.MapMetrics();
```

You get `http_requests_received_total`, `http_request_duration_seconds`, and related counters without configuration. Request count by path and status, latency histograms. No custom code needed for the basics.

## Custom Business Metrics

For domain-specific tracking, define your own. The playground has an order endpoint that records how long processing takes and whether it succeeded:

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

Register as a singleton, inject where you process orders:

```csharp
builder.Services.AddSingleton<OrderMetrics>();

app.MapPost("/api/orders", async (OrderMetrics metrics) =>
{
    var sw = Stopwatch.StartNew();
    // ... do work ...
    sw.Stop();
    metrics.RecordOrder(sw.Elapsed.TotalSeconds, success);
    return success ? Results.Ok(...) : Results.Problem(...);
});
```

Exponential buckets (0.05, 0.1, 0.2, 0.4, ...) give good resolution for typical order latencies. The counter splits by `accepted` vs `failed` so you can track error rate separately.

## Prometheus Config

`MapMetrics()` exposes `/metrics` in Prometheus text format. The `prometheus.yml` for scraping:

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

`host.docker.internal` lets Prometheus inside Docker reach the app running on your host. In Kubernetes, you'd use a Service or PodMonitor instead.

## Grafana Queries

Connect Grafana to Prometheus as a data source (usually `http://prometheus:9090` when running inside the same Docker network). Three queries cover most of what you need:

**Request rate:**

```promql
rate(http_requests_received_total[5m])
```

**p95 latency:**

```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

**Order success/failure rate:**

```promql
sum by (status) (rate(app_orders_total[5m]))
```

Create a time-series panel for each. Spikes show up early. Usually before Slack blows up.

## Running the Stack

The playground includes a `docker-compose.yml` that starts PostgreSQL, Prometheus, and Grafana. All three are free to use. Grafana is AGPL-licensed (still free, just copyleft). If AGPL concerns you, Prometheus alone at `http://localhost:9090` gives you full query access. The compose commands work with Docker, Podman, or Rancher Desktop.

```bash
cd playground/DotNetMonitoring
docker-compose up -d
```

Then start the app:

```bash
cd AnimatLabs.DotNetMonitoring
dotnet run
```

Generate some metrics by hitting the order endpoint a few times:

```bash
curl -X POST http://localhost:5076/api/orders
```

- **Health:** http://localhost:5076/health/live, http://localhost:5076/health/ready
- **Metrics:** http://localhost:5076/metrics
- **Prometheus:** http://localhost:9090
- **Grafana:** http://localhost:3000 (admin/admin)

Without Docker, the app still runs; health checks report "Unhealthy" for PostgreSQL (expected) but liveness and metrics work fine.

## Extending It

Same pattern for any dependency. Redis: `AddRedis(connectionString, name: "redis", tags: ["ready"])`. Background jobs: implement `IHealthCheck` and check the last run timestamp. Tag it `ready` so traffic stops if jobs are stuck.

For alerting, add Alertmanager to Prometheus. Start simple: alert when `up == 0` or when error rate crosses 1%. Add rules as you learn what your failure patterns look like.

Pair this with the [Serilog write-up](/2026/04/06/serilog-structured-logging/) and you have structured logging, health checks, and metrics. Enough to stop debugging blind.

---

<!-- LINKEDIN PROMO

A .NET app rarely crashes outright. More often: the process is alive, the health endpoint returns 200, but the database connection pool is full and background jobs stopped 3 hours ago.

Two layers fix this. Health checks (liveness vs readiness) let Kubernetes stop traffic without restarting the pod. Prometheus metrics give you request rate, p95 latency, and custom business counters.

Wrote up the setup I use: health check registration with tags, custom JSON response writer, prometheus-net for HTTP metrics, a simple OrderMetrics class for domain-specific histograms and counters, Prometheus/Grafana config, and the PromQL queries that actually matter.

Working playground with docker-compose (PostgreSQL + Prometheus + Grafana): [link]

#dotnet #monitoring #prometheus #grafana
-->
