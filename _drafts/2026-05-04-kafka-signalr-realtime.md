---
title: "CDC Events to the Browser: Kafka + SignalR + SSE in .NET"
excerpt: >-
  Insert a row in PostgreSQL, see it in the browser within a second. A BackgroundService bridges Kafka to both SignalR and SSE so you can pick what fits.
categories:
  - Technical
  - .NET
  - Real-Time
tags:
  - .NET
  - Kafka
  - SignalR
  - SSE
  - Real-Time
  - ASP.NET Core
  - Event-Driven
author: animat089
last_modified_at: 2026-05-04
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Insert a row in PostgreSQL. Open your browser. The change shows up in under a second.

Database row change, captured by Debezium, piped through Kafka, consumed by a .NET `BackgroundService`, pushed to the browser. The [CDC post](/technical/.net/data%20engineering/cdc-debezium-kafka/) ended at a console consumer. This picks up where that left off and gets those events into a browser tab.

I wired both SignalR and SSE to the same Kafka consumer so you can compare them. If you want SSE fundamentals without Kafka, I covered that in the [March SSE post](/technical/.net/server-sent-events-dotnet/).

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/KafkaSignalR){: .btn .btn--primary}

## The BackgroundService

One `BackgroundService`, two outputs. Every Kafka message goes to a SignalR hub group and to a `Channel<string>` that feeds the SSE endpoint. No need for two separate consumers.

```csharp
using System.Threading.Channels;
using AnimatLabs.KafkaSignalR.Hubs;
using Confluent.Kafka;
using Microsoft.AspNetCore.SignalR;

public sealed class KafkaConsumerService : BackgroundService
{
    private readonly IHubContext<EventHub> _hub;
    private readonly Channel<string> _sseChannel;
    private readonly ILogger<KafkaConsumerService> _log;
    private readonly string _topic;
    private readonly ConsumerConfig _config;

    public KafkaConsumerService(
        IHubContext<EventHub> hub,
        Channel<string> sseChannel,
        IConfiguration configuration,
        ILogger<KafkaConsumerService> log)
    {
        _hub = hub;
        _sseChannel = sseChannel;
        _log = log;
        _topic = configuration.GetValue<string>("Kafka:Topic")
            ?? "orders.public.orders";
        _config = new ConsumerConfig
        {
            BootstrapServers = configuration.GetValue<string>("Kafka:BootstrapServers")
                ?? "localhost:9092",
            GroupId = "signalr-bridge",
            AutoOffsetReset = AutoOffsetReset.Latest,
            EnableAutoCommit = true
        };
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Yield();

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var consumer = new ConsumerBuilder<string, string>(_config).Build();
                consumer.Subscribe(_topic);
                _log.LogInformation("Subscribed to {Topic}", _topic);

                while (!stoppingToken.IsCancellationRequested)
                {
                    var result = consumer.Consume(stoppingToken);
                    if (result?.Message?.Value is null) continue;

                    var json = result.Message.Value;

                    await _hub.Clients.Group(_topic)
                        .SendAsync("ReceiveEvent", json, stoppingToken);
                    await _sseChannel.Writer
                        .WriteAsync(json, stoppingToken);
                }

                consumer.Close();
            }
            catch (OperationCanceledException) { break; }
            catch (ConsumeException ex)
            {
                _log.LogWarning(ex, "Kafka consume failed, retrying in 5s");
                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}
```

`Task.Yield()` at the top matters. `Consume()` is synchronous, so without the yield it blocks host startup and Kestrel never starts.

The outer try/catch retries on `ConsumeException`. If Kafka or the topic is not ready, the service waits 5 seconds and tries again instead of crashing the whole app.

`AutoOffsetReset = Latest` skips old messages. Change to `Earliest` if you want replay, but expect a flood in the browser.

## SignalR Hub

Bare minimum. Clients join a group matching the Kafka topic. `BackgroundService` calls `SendAsync` on that group, every connected client gets the event.

```csharp
using Microsoft.AspNetCore.SignalR;

public sealed class EventHub : Hub
{
    public async Task JoinTopic(string topic)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, topic);
    }

    public async Task LeaveTopic(string topic)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, topic);
    }
}
```

Groups scale. Add a second topic like `orders.public.customers` and clients subscribe only to what they need.

## SSE Endpoint

Single endpoint. A `Channel<string>` bridges the `BackgroundService` and the HTTP response stream.

```csharp
app.MapGet("/sse/events", async (Channel<string> channel, HttpContext ctx, CancellationToken ct) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

    var feature = ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>();
    feature?.DisableBuffering();

    await ctx.Response.WriteAsync(": connected\n\n", ct);
    await ctx.Response.Body.FlushAsync(ct);

    await foreach (var json in channel.Reader.ReadAllAsync(ct))
    {
        await ctx.Response.WriteAsync($"data: {json}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }
});
```

Two things worth calling out.

`DisableBuffering` is non-negotiable. Without it, Kestrel buffers the response and the browser sees nothing until the buffer fills.

The `: connected` comment and immediate flush sends the HTTP response headers back to the client right away. Without this, `EventSource` (and curl) hang until the first Kafka message arrives. SSE comments (lines starting with `:`) are ignored by the browser but they force the response to start streaming.

The `Channel<string>` has one reader. Two browser tabs hitting `/sse/events` means one gets events, the other starves. For multi-client use, you'd need a broadcast pattern or switch to SignalR groups.

For this demo, the single channel is enough.

## Wiring It Up

```csharp
using System.Threading.Channels;
using AnimatLabs.KafkaSignalR.Hubs;
using AnimatLabs.KafkaSignalR.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton(Channel.CreateUnbounded<string>());
builder.Services.AddHostedService<KafkaConsumerService>();

var app = builder.Build();

app.UseDefaultFiles();
app.UseStaticFiles();

app.MapHub<EventHub>("/hub/events");

// SSE endpoint registered here (shown above)

app.Run();
```

The Kafka config lives in `appsettings.json`:

```json
{
  "Kafka": {
    "BootstrapServers": "localhost:9092",
    "Topic": "orders.public.orders"
  }
}
```

## The Browser

Plain HTML. Left column uses the SignalR JS client. Right column uses native `EventSource`. Same events, side by side.

```html
<div class="columns">
    <div>
        <h2>SignalR</h2>
        <div id="signalr-log" class="log"></div>
    </div>
    <div>
        <h2>Server-Sent Events</h2>
        <div id="sse-log" class="log"></div>
    </div>
</div>
```

SignalR client:

```javascript
var conn = new signalR.HubConnectionBuilder()
    .withUrl("/hub/events")
    .withAutomaticReconnect()
    .build();

conn.on("ReceiveEvent", function(json) {
    append(srLog, json);
});

conn.start().then(function() {
    return conn.invoke("JoinTopic", topic);
});
```

SSE client:

```javascript
var source = new EventSource("/sse/events");
source.onmessage = function(e) {
    append(sseLog, e.data);
};
```

Three lines for SSE. Ten for SignalR. You pay for features in code.

## Running It

If you have the [CDC project](https://github.com/animat089/playground/tree/main/CdcEventSourcing) running already, Kafka is already up. Just start the app:

```bash
cd AnimatLabs.KafkaSignalR
dotnet run
```

Open http://localhost:5180 and insert a row in another terminal:

```bash
docker exec -it cdc-postgres psql -U postgres -d orders -c \
  "INSERT INTO orders (customer, product, quantity, total_amount) VALUES ('eve', 'Widget E', 1, 19.99);"
```

Both columns update. SignalR negotiates WebSockets first (falls back to long-poll). SSE uses a long-lived HTTP connection.

Same data, different pipe.

No CDC stack running? This project ships its own `docker-compose.yml` with standalone Kafka (Apache image, KRaft mode, no ZooKeeper):

```bash
docker exec stream-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 \
  --create --topic orders.public.orders --partitions 1 --replication-factor 1
```

Push test messages with the console producer:

```bash
docker exec -it stream-kafka /opt/kafka/bin/kafka-console-producer.sh \
  --broker-list localhost:29092 --topic orders.public.orders
```

Type a JSON line, press Enter, and see it appear in the browser.

## SignalR vs SSE: When to Use Which

| | SignalR | SSE |
|--|---------|-----|
| Direction | Bidirectional | Server to client only |
| Protocol | WebSocket (falls back to long-poll) | HTTP/1.1 long-lived |
| Client library | Microsoft SignalR JS (~50KB) | Native `EventSource` (0KB) |
| Groups/Auth | Built-in group management, user mapping | Roll your own |
| Reconnect | `withAutomaticReconnect()` | Browser auto-reconnects |
| Multiple clients | Scales with backplane (Redis) | Need broadcast pattern |
| Complexity | More setup, more features | Minimal, fewer moving parts |

My rule of thumb: SSE for dashboards where data flows one way. SignalR when clients subscribe to groups or the server targets specific users.

For this CDC pipeline, both work. Monitoring dashboard that just shows the stream? SSE.

Order-tracking page where each user sees only their orders? SignalR groups.

What transport are you using for real-time feeds in your projects?
