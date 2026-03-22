---
title: "Serilog in Production: The Setup I Actually Use"
excerpt: >-
  "Most .NET Serilog tutorials stop at Console and File sinks. Production setup: appsettings-driven, correlation IDs, PII redaction, async sinks, and graceful shutdown."
categories:
  - Technical
  - .NET
tags:
  - C#
  - .NET
  - Serilog
  - Logging
  - Production
  - Observability
author: animat089
last_modified_at: 2026-04-06
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Most Serilog tutorials show you `Log.Information("Hello")` and call it a day. Production is different.

You need logs you can query when something breaks, correlation IDs across services, config-driven levels so ops can change them without redeployment, and redaction so you don't ship card numbers to the SIEM. Non-negotiable.

This is what I run. Config-heavy on purpose: **log levels do not belong hard-coded in assemblies.** I learned that the hard way once.

## Why Structured Logging

Text logs are fine for `tail -f` during development. In production, when you're searching for one failed payment among millions of requests, they don't cut it. Grep stops working fast once more than one noisy service prints "Processing request" with no identifiers. You grep for "error" and get 12,000 hits. You grep for "payment" and get every successful transaction too.

Structured logs are JSON. Each field is queryable. In Seq or Kibana, you write:

```
CorrelationId = 'a1b2c3d4' and Level = 'Error'
```

One query, one request, the full trace. Plain text versus structured:

```
2026-03-14 02:17:23 [INF] Processing request for user 8472
2026-03-14 02:17:23 [INF] Processing request for user 8472
2026-03-14 02:17:24 [ERR] Payment failed
```

Which request? Which user? You can't tell. Structured:

```json
{"@t":"2026-03-14T02:17:24Z","@l":"Error","@mt":"Payment failed","UserId":8472,"CorrelationId":"a1b2c3d4","OrderId":"ord_9x7k2"}
```

Query by `CorrelationId` and you get the full story.

## The Config

### appsettings.json

Ops teams need to change log levels and sinks without redeployment. That's why I use `ReadFrom.Configuration` instead of the fluent API in code:

```json
{
  "Serilog": {
    "Using": [ "Serilog.Sinks.Console", "Serilog.Sinks.File" ],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft": "Warning",
        "Microsoft.Hosting.Lifetime": "Information",
        "System": "Warning"
      }
    },
    "WriteTo": [
      {
        "Name": "Console",
        "Args": {
          "outputTemplate": "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"
        }
      },
      {
        "Name": "File",
        "Args": {
          "path": "logs/app-.log",
          "rollingInterval": "Day",
          "retainedFileCountLimit": 14,
          "outputTemplate": "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj} {Properties:j}{NewLine}{Exception}"
        }
      }
    ],
    "Enrich": [ "FromLogContext", "WithMachineName", "WithEnvironmentName" ]
  }
}
```

The `Override` section matters. `Microsoft` and `System` are incredibly chatty at `Information` level. Set them to `Warning` in production. Add `Serilog.Enrichers.Environment` for `WithMachineName` and `WithEnvironmentName`.

### Development Overrides

Verbose in dev, quiet in prod:

```json
{
  "Serilog": {
    "MinimumLevel": {
      "Default": "Debug",
      "Override": {
        "Microsoft": "Information",
        "Microsoft.EntityFrameworkCore": "Information"
      }
    }
  }
}
```

### Program.cs

```csharp
using Serilog;

var builder = WebApplication.CreateBuilder(args);

Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .CreateLogger();

builder.Host.UseSerilog();

try
{
    var app = builder.Build();
    app.UseSerilogRequestLogging();
    // ... middleware, endpoints
    app.Run();
}
finally
{
    await Log.CloseAndFlushAsync();
}
```

`ReadFrom.Configuration` pulls the `Serilog` section from appsettings. Change the config, restart, new behavior. `UseSerilogRequestLogging()` adds one log per request with duration, status code, and path, which is essential for spotting slow requests.

## Correlation IDs

A request hits your API, then a payment service, then an email service. Without correlation IDs, you're piecing together three separate log streams by timestamp. That's miserable.

This middleware assigns a correlation ID to every request:

```csharp
using Serilog.Context;

app.Use(async (context, next) =>
{
    var correlationId = context.Request.Headers["X-Correlation-ID"].FirstOrDefault()
        ?? Guid.NewGuid().ToString("N")[..8];
    context.Response.Headers["X-Correlation-ID"] = correlationId;

    using (LogContext.PushProperty("CorrelationId", correlationId))
    {
        await next(context);
    }
});
```

Now every log line during that request includes `CorrelationId`. If the upstream service already set `X-Correlation-ID`, we reuse it, so you can trace across service boundaries.

## Redacting Sensitive Data

Logs end up in dashboards, SIEM tools, support tickets. PII, tokens, and card numbers don't belong there.

Use a destructuring policy to strip sensitive fields before they reach any sink:

```csharp
Log.Logger = new LoggerConfiguration()
    .ReadFrom.Configuration(builder.Configuration)
    .Destructure.ByTransforming<CreditCardRequest>(r => new
    {
        r.OrderId,
        CardLast4 = r.CardNumber?[^4..],
        r.Amount
    })
    .CreateLogger();
```

For broader protection, a regex-based enricher catches anything that slips through:

```csharp
using System.Text.RegularExpressions;
using Serilog.Core;
using Serilog.Events;

public class SensitiveDataEnricher : ILogEventEnricher
{
    private static readonly Regex CardRegex = new(@"\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?(\d{4})\b");
    private static readonly Regex EmailRegex = new(@"[\w.-]+@[\w.-]+\.\w+");

    public void Enrich(LogEvent logEvent, ILogEventPropertyFactory factory)
    {
        var message = logEvent.RenderMessage();
        message = CardRegex.Replace(message, "****-****-****-$1");
        message = EmailRegex.Replace(message, "***@***.***");
        logEvent.AddOrUpdateProperty(factory.CreateProperty("SanitizedMessage", message));
    }
}
```

Register with `.Enrich.With<SensitiveDataEnricher>()`. Better approach: don't log those objects at all. Use destructuring so they never hit the message template in the first place.

## Performance

Logging can block. Two things matter here.

**Async sinks:** `Serilog.Sinks.Async` wraps the file sink with a bounded queue. A background thread handles the I/O. Your request thread never blocks on disk writes. Under load, sync file writes can add 5-20ms per request. Async drops that to near zero:

```json
{
  "Name": "Async",
  "Args": {
    "configure": [
      {
        "Name": "File",
        "Args": {
          "path": "logs/app-.log",
          "rollingInterval": "Day"
        }
      }
    ]
  }
}
```

**Container shutdown:** when the app exits, buffered logs get lost unless you flush. `Log.CloseAndFlushAsync()` in the `finally` block handles normal shutdown. For Kubernetes, hook into `ApplicationStopping`:

```csharp
var host = builder.Build();
var lifetime = host.Services.GetRequiredService<IHostApplicationLifetime>();
lifetime.ApplicationStopping.Register(() =>
{
    Log.Information("Shutdown requested, flushing logs");
    Log.CloseAndFlush();
});
```

`ApplicationStopping` fires when SIGTERM arrives. Flush before the process exits.

## What Comes Next

This setup gives you structured logs with correlation IDs, PII redaction, and async writes. Next article wires the same logs into Prometheus metrics and Grafana dashboards for production monitoring (the part where pretty graphs finally justify all the JSON).

---

<!-- LINKEDIN PROMO

Most Serilog tutorials stop at Console and File sinks. Production stack I actually run:

Config-driven setup (appsettings.json, not fluent API) so ops can change log levels without redeploying. Correlation ID middleware for tracing requests across services. Destructuring policies and regex enrichers to redact card numbers and emails before they hit any sink. Async file sinks so logging doesn't add 5-20ms per request under load. Graceful shutdown flushing for Kubernetes.

The post is code-heavy: working config, correlation middleware, redaction enricher, async sink setup. No external dependencies beyond Serilog NuGet packages.

Full post: [link]

#dotnet #serilog #logging #observability
-->
