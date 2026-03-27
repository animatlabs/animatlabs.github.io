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
last_modified_at: 2026-04-27
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Open a browser tab. In another terminal, insert a row into PostgreSQL. Within a second, the browser updates.

That is the full loop: database change, captured by Debezium, streamed through Kafka, consumed by a .NET `BackgroundService`, pushed to the browser via SignalR and SSE simultaneously. The [CDC piece](/2026/04/20/cdc-debezium-kafka/) stopped at the console consumer; this one gets those same events into the browser.

I wanted both SignalR and SSE side by side because someone always asks which to use. Fundamentals of SSE without Kafka or SignalR live in the [March SSE write-up](/2026/03/16/server-sent-events-dotnet/).

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/KafkaSignalR){: .btn .btn--primary}

## The BackgroundService

The Kafka consumer runs as a hosted service, which sounds dull until you realize you are multiplexing the same firehose into WebSocket frames and an HTTP stream without standing up two separate consumers. Each message gets pushed to two places: a SignalR hub group and a `Channel<string>` that feeds the SSE endpoint.

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

The `Task.Yield()` at the top is important. Without it, `ExecuteAsync` blocks the host startup because `Consume()` is synchronous. The yield lets the rest of the pipeline (Kestrel, SignalR hub registration) start first.

The outer `while` loop with `catch (ConsumeException)` handles the case where Kafka or the topic is not ready yet. Without it, the hosted service crashes the app on the first failed consume. The 5-second retry gives infrastructure time to settle.

`AutoOffsetReset = Latest` means the consumer only picks up new messages. If you want historical replay, change it to `Earliest`, but keep in mind that replayed events will flood connected browsers.

## SignalR Hub

The hub itself is minimal. Clients join a group matching the Kafka topic name. When the `BackgroundService` calls `SendAsync` on that group, every connected client gets the message.

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

Groups are the right abstraction here. If you later add a second Kafka topic (say `orders.public.customers`), clients can subscribe to just the topics they care about.

## SSE Endpoint

The SSE alternative is a single endpoint. A `Channel<string>` acts as the bridge between the `BackgroundService` and the HTTP response stream.

```csharp
app.MapGet("/sse/events", async (Channel<string> channel, HttpContext ctx, CancellationToken ct) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

    var feature = ctx.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpResponseBodyFeature>();
    feature?.DisableBuffering();

    await foreach (var json in channel.Reader.ReadAllAsync(ct))
    {
        await ctx.Response.WriteAsync($"data: {json}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }
});
```

`DisableBuffering` is critical. Without it, Kestrel buffers the response and the browser sees nothing until the buffer fills up.

One caveat: the `Channel<string>` is a single-reader by default. If two browser tabs open the SSE endpoint, only one gets events. For multiple SSE clients, you would need a broadcast pattern (a list of channels, or a `Subject` from System.Reactive). For this demo, the single channel is enough. In production, I would lean towards SignalR for multi-client scenarios.

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

A plain HTML page with two columns. The left column uses the SignalR JavaScript client. The right column uses native `EventSource`. Both show the same events, so you can compare latency and behavior.

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

Three lines for the SSE client, about ten for SignalR. That difference in complexity is real and scales with the features you need.

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

Both columns update. SignalR negotiates WebSockets first (then long-poll if it has to). The SSE side uses a long-lived HTTP connection. Same data, different transport.

If you do not have the CDC stack, this project has its own `docker-compose.yml` with a standalone Kafka (official Apache image, KRaft mode, no ZooKeeper). Start it with `docker-compose up -d`, wait about 15 seconds, then create the topic:

```bash
docker exec stream-kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:29092 \
  --create --topic orders.public.orders --partitions 1 --replication-factor 1
```

Then use the Kafka console producer to push test messages:

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

I use SSE for dashboards where data flows one way and I do not need per-user targeting. I use SignalR when clients need to subscribe to specific groups, or when I need the server to call specific connected users.

For this CDC pipeline, both work. I keep both transports in the demo on purpose. If you are building a monitoring dashboard that just shows the stream, SSE is less code. If you are building an order-tracking page where each user sees only their orders, SignalR groups are the right fit.

---

<!-- LINKEDIN PROMO

Insert a row in PostgreSQL, see it in the browser within a second.

Bridges the CDC pipeline from the previous article to the browser. A BackgroundService consumes Kafka events and pushes them to both a SignalR hub and an SSE endpoint simultaneously. A plain HTML page shows both feeds side by side so you can compare them.

Also includes a side-by-side comparison of when to pick SignalR (groups, auth, bidirectional) vs SSE (dashboard, one-way, zero client library).

Working playground: [link]

#dotnet #signalr #sse #kafka #realtime
-->
