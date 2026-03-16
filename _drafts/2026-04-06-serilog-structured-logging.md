---
title: "Structured Logging with Serilog: The Production Setup"
excerpt: >-
  "50,000 lines of 'Processing request...' with zero context. Here's the Serilog setup that actually helps at 2 AM."
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
last_modified_at: 2026-03-14
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The 2 AM Wake-Up Call

The alert fired at 2 AM. "Payment service unhealthy." I opened the logs and found 50,000 lines of "Processing request..." with zero context about which request, which user, or which payment. No timestamps that lined up. No way to trace a single transaction across the three services that touched it.

That's when I rewrote our logging setup.

## Why Structured Logging

Text logs are fine for `tail -f` during development. In production, when you're searching for one failed payment among millions of requests, they're useless. You grep for "error" and get 12,000 hits. You grep for "payment" and get every successful transaction too.

Structured logs are JSON. Each field is queryable. In Seq or Kibana, you run:

```
CorrelationId = 'a1b2c3d4' and Level = 'Error'
```

You get exactly the failed request and every log line that touched it. No grep. No regex. One query.

Here's the difference. Text log:

```
2026-03-14 02:17:23 [INF] Processing request for user 8472
2026-03-14 02:17:23 [INF] Processing request for user 8472
2026-03-14 02:17:24 [ERR] Payment failed
```

Which request failed? Which user? You can't tell. Structured log:

```json
{"@t":"2026-03-14T02:17:24Z","@l":"Error","@mt":"Payment failed","UserId":8472,"CorrelationId":"a1b2c3d4","OrderId":"ord_9x7k2"}
```

Query by `CorrelationId` and you get the full story. That's the setup below.

## The Production Setup

### 1. appsettings.json (Not Fluent API)

Ops teams need to change log levels and sinks without redeployment. Config-driven beats code-driven.

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

`Override` is critical. `Microsoft` and `System` are chatty. In production, set them to `Warning` unless you're debugging. In dev, you might use `Information` or `Debug` for EF Core. Add `Serilog.Enrichers.Environment` for `WithMachineName` and `WithEnvironmentName`.

### 2. appsettings.Development.json

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

### 3. Program.cs Bootstrap

```csharp
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// Serilog first - captures startup
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

`ReadFrom.Configuration` pulls the `Serilog` section from appsettings. No fluent API in code. Change the config, restart the app, new behavior.

`UseSerilogRequestLogging()` adds a log per request with duration, status code, and path. Essential for tracing slow requests.

## Correlation IDs

A request hits your API, then a payment service, then an email service. Without correlation IDs, you're piecing together three separate log streams by timestamp. Good luck.

Add middleware that assigns a correlation ID to every request and sticks it in `LogContext`:

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

Now every log during that request includes `CorrelationId`. Before: "Payment failed" somewhere in service B. After: grep for `CorrelationId = 'a1b2c3d4'` in Seq and you see the full path — API received request, called payment service, payment failed, returned 500.

## Sensitive Data

Logs end up in dashboards, SIEM tools, support tickets. PII, tokens, and card numbers don't belong there.

Use a destructuring policy to redact:

```csharp
// Add to LoggerConfiguration
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

Or mask inline with a custom enricher. Simpler approach — a regex-based sanitizer:

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

Register it: `.Enrich.With<SensitiveDataEnricher>()`. Any log that accidentally includes a card number or email gets redacted. Better: don't log those objects at all. Use the destructuring policy so they never hit the message template.

## Performance

Logging can block. Async sinks and buffering matter.

**Async file sink** — use `Serilog.Sinks.Async` to wrap the file sink. Logs go to a bounded queue; a background thread writes. Your request thread never blocks on disk I/O. Default buffer is 10,000 events. Under load, sync file writes can add 5–20ms per request. Async drops that to near zero.

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

**Container shutdown** — when the app exits, buffered logs can be lost. `Log.CloseAndFlushAsync()` in the `finally` block flushes before the process dies. For graceful shutdown in Kubernetes:

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

## Wrap Up

Structured logs, correlation IDs, and config-driven levels turn "50,000 lines of noise" into "one query, one request, full trace." The setup above is what I run in production — no external dependencies beyond NuGet packages.

In the next post, I'll show how these structured logs feed into Prometheus and Grafana dashboards.

---

*Questions about Serilog config or correlation IDs? Drop them in the comments.*

<!--
LINKEDIN PROMO (150-250 words):

The alert fired at 2 AM. "Payment service unhealthy." I opened the logs: 50,000 lines of "Processing request..." Zero context. Which request? Which user? Which payment? I couldn't trace a single transaction across the three services that touched it.

That's when I rewrote our logging.

I wrote up the Serilog setup that actually works in production: appsettings-driven config (so ops can change log levels without redeploying), correlation ID middleware so you can trace one request across your whole stack, destructuring policies to redact card numbers and emails, and async sinks so logging doesn't block your request thread. Also covered: Log.CloseAndFlushAsync() for graceful container shutdown — because buffered logs disappear when the process dies.

The post is code-heavy. 60%+ code blocks. No external deps beyond NuGet. Working config, not slides.

What's your go-to when you need to debug a failed request at 2 AM?
-->
