---
title: "Real-Time Events in C# with Server-Sent Events"
excerpt: >-
  "SSE gives you real-time server-to-client streaming in 15 lines of C#. No SignalR hub, no JavaScript library, no WebSocket handshake."
categories:
  - Technical
  - .NET
tags:
  - C#
  - .NET
  - Server-Sent Events
  - SSE
  - Real-Time
  - ASP.NET Core
author: animat089
last_modified_at: 2026-03-21
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I added SignalR to a project that only needed server-to-client updates. 200 lines of hub code, connection management, and a JavaScript dependency. All of that for a dashboard that never sends data back. SSE does it in 15 lines. I still ask "does the client ever push?" before I touch SignalR.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/ServerSentEvents){: .btn .btn--primary}

## What SSE Actually Is

HTTP. Set `Content-Type: text/event-stream`, keep the connection open, write `data: something\n\n`. Each double-newline ends an event.

The browser's `EventSource` API parses it. That's the whole spec.

No WebSocket upgrade. Proxies treat it like a long-lived HTTP response; most already allow it. `EventSource` reconnects automatically and sends `Last-Event-ID` so the server knows where to resume.

Three optional fields: `data` (payload), `event` (name for multiple types on one stream), `id` (for reconnection).

If your UI only needs the server to talk and the browser to listen, you skip the WebSocket handshake, you skip hub abstractions, and you stay on plain HTTP semantics that ops already know how to load-balance and cache-policy, which is why I reach for SSE first on internal dashboards.

## The Simplest Stream: A Clock

Start with the bare minimum: one event type, one value, fire every second:

```csharp
app.MapGet("/events/clock", async (HttpContext ctx) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

    var ct = ctx.RequestAborted;

    await foreach (var tick in StreamClock(ct))
    {
        await ctx.Response.WriteAsync($"data: {tick:HH:mm:ss}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }
});

static async IAsyncEnumerable<DateTime> StreamClock(
    [EnumeratorCancellation] CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        yield return DateTime.UtcNow;
        await Task.Delay(1000, ct);
    }
}
```

`IAsyncEnumerable` keeps the stream lazy. Each tick becomes a `data:` line, the `\n\n` is the event boundary. Important: flush after each write or the client won't see anything until the buffer fills.

On the browser side, `EventSource` is native. No library:

```javascript
const clock = new EventSource('/events/clock');
clock.onmessage = e => {
    document.getElementById('clock').textContent = e.data;
};
clock.onopen = () => document.getElementById('clock-status').classList.remove('off');
clock.onerror = () => document.getElementById('clock-status').classList.add('off');
```

## Named Events

What if you need multiple event types on one connection? The `event:` field handles that. Order stream example: it pushes both `placed` and `cancelled` events.

```csharp
app.MapGet("/events/orders", async (HttpContext ctx) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

    var ct = ctx.RequestAborted;
    var orderNum = 1000;

    while (!ct.IsCancellationRequested)
    {
        await Task.Delay(Random.Shared.Next(1500, 4000), ct);

        orderNum++;
        var amount = Math.Round(Random.Shared.NextDouble() * 500 + 10, 2);
        var status = Random.Shared.Next(10) < 8 ? "placed" : "cancelled";

        await ctx.Response.WriteAsync($"event: {status}\n", ct);
        await ctx.Response.WriteAsync($"data: Order #{orderNum} — ${amount}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }
});
```

The `event:` line goes before `data:`. On the client, you use `addEventListener` instead of `onmessage`. That's the key difference. `onmessage` only fires for unnamed events:

```javascript
const orders = new EventSource('/events/orders');
orders.addEventListener('placed', e => addOrderLine(e.data, 'placed'));
orders.addEventListener('cancelled', e => addOrderLine(e.data, 'cancelled'));
```

One connection, multiple handlers.

## Reconnection with Event IDs

This is the part that makes SSE actually production-ready. The server sends `id:` with each event. When the connection drops, the browser automatically reconnects and sends `Last-Event-ID` in the request header so the server can pick up where it left off.

{% raw %}
```csharp
app.MapGet("/events/metrics", async (HttpContext ctx) =>
{
    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

    var ct = ctx.RequestAborted;
    var lastId = 0;

    if (ctx.Request.Headers.TryGetValue("Last-Event-ID", out var lastEventId)
        && int.TryParse(lastEventId, out var parsed))
    {
        lastId = parsed;
    }

    var seq = lastId;
    while (!ct.IsCancellationRequested)
    {
        await Task.Delay(2000, ct);
        seq++;

        var cpu = Math.Round(Random.Shared.NextDouble() * 60 + 10, 1);
        var mem = Random.Shared.Next(40, 85);

        await ctx.Response.WriteAsync($"id: {seq}\n", ct);
        await ctx.Response.WriteAsync($"data: {{\"cpu\":{cpu},\"mem\":{mem},\"seq\":{seq}}}\n\n", ct);
        await ctx.Response.Body.FlushAsync(ct);
    }
});
```
{% endraw %}

The client code is straightforward. JSON in `data:` is a string, so you parse it:

```javascript
const metrics = new EventSource('/events/metrics');
metrics.onmessage = e => {
    const d = JSON.parse(e.data);
    document.getElementById('cpu').textContent = d.cpu + '%';
    document.getElementById('mem').textContent = d.mem + '%';
    document.getElementById('seq').textContent = '#' + d.seq;
};
```

The browser handles the reconnection loop and sends `Last-Event-ID` automatically. You don't write that code.

## When to Use What

| Use SSE when | Use SignalR when | Use WebSockets when |
|-------|---------|-----------|
| Server pushes, client never sends | Bidirectional, groups, auth | Raw bidirectional, custom protocol |
| Proxies must work (corporate, CDN) | You need hub abstractions | You control both ends |
| You want built-in reconnect | You need rooms, presence | You need binary frames |
| HTTP/2 multiplexing is fine | You're already in the ecosystem | You're building a game or trading feed |

SSE wins for dashboards, notifications, live logs, progress bars. SignalR wins for chat, collaborative editing, anything with lots of client→server traffic. WebSockets win when you need low-level control or binary data.

No tech is wrong. Pick by direction of data flow and what your infra allows.

## Gotchas

**HTTP/1.1 connection limits.** Browsers cap connections per domain at ~6. Open 6 SSE streams and your next fetch queues.

HTTP/2 multiplexes over one connection, so the problem disappears. If you're on HTTP/1.1, keep streams under the limit.

**Text only.** No binary. Base64 if you must, but at that point you probably want WebSockets.

The playground has all three patterns running on `http://localhost:5074`:

```bash
cd playground/ServerSentEvents/AnimatLabs.ServerSentEvents
dotnet run
```

No NuGet packages, no hub classes: just a GET endpoint and a loop. Full code and setup in the [playground README](https://github.com/animat089/playground/tree/main/ServerSentEvents).

Follow-up piece: SSE plus HTMX for a workflow dashboard where the server pushes HTML fragments. No custom JavaScript. I wanted that article to exist mostly so I'd stop re-explaining EventSource to myself every six months.

---

<!-- LINKEDIN PROMO

Added SignalR to a project that only needed server-to-client updates. 200 lines of hub code, connection management, a JS dependency, for a dashboard that never sends data back.

SSE does it in 15 lines. HTTP, text/event-stream content type, keep the connection open, write data lines. The browser's EventSource API handles parsing and automatic reconnection.

Walked through three patterns in C#:
- Simple stream (IAsyncEnumerable clock)
- Named events (multiple event types on one connection)
- Event IDs (reconnection without losing your place)

No NuGet packages. No hub abstractions. Native browser API. Works behind corporate proxies where WebSockets sometimes don't.

Working demo: [link]

#dotnet #sse #realtime #aspnetcore
-->

