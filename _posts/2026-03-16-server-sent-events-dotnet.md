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
last_modified_at: 2026-03-16
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I added SignalR to a project that only needed server-to-client updates. 200 lines of hub code, connection management, and a JavaScript dependency - for a dashboard that never sends data back. SSE does it in 15 lines.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/ServerSentEvents){: .btn .btn--primary}

## What SSE Actually Is

HTTP. Set `Content-Type: text/event-stream`, keep the connection open, write `data: something\n\n`. Each double-newline ends an event.

The browser's `EventSource` API parses it. That's the whole spec.

No WebSocket upgrade. Proxies treat it like a long-lived HTTP response - most already allow it. `EventSource` reconnects automatically and sends `Last-Event-ID` so the server knows where to resume.

Three optional fields: `data` (payload), `event` (name for multiple types on one stream), `id` (for reconnection).

## Pattern 1: Simple Stream (Clock)

One event type. One value. Fire every second. No names, no IDs.

**Server (C#):**

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

`IAsyncEnumerable` keeps the stream lazy. Each tick becomes a `data:` line. The `\n\n` is the event boundary. Flush after each write or the client won't see it until the buffer fills.

**Client (JavaScript):**

```javascript
const clock = new EventSource('/events/clock');
clock.onmessage = e => {
    document.getElementById('clock').textContent = e.data;
};
clock.onopen = () => document.getElementById('clock-status').classList.remove('off');
clock.onerror = () => document.getElementById('clock-status').classList.add('off');
```

`onmessage` handles unnamed events. No library. Native `EventSource` in every modern browser.

## Pattern 2: Named Events (Orders)

Multiple event types on one connection. Use the `event:` field.

**Server (C#):**

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

`event: placed` or `event: cancelled` goes before `data:`. The client listens by name.

**Client (JavaScript):**

```javascript
const orders = new EventSource('/events/orders');
orders.addEventListener('placed', e => addOrderLine(e.data, 'placed'));
orders.addEventListener('cancelled', e => addOrderLine(e.data, 'cancelled'));
```

`onmessage` only fires for unnamed events. Named events need `addEventListener`. One connection, multiple handlers.

## Pattern 3: Event IDs (Metrics)

Reconnection without losing your place. The server sends `id:` with each event. On reconnect, the browser sends `Last-Event-ID` in the request headers.

**Server (C#):**

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

Read `Last-Event-ID`, start the sequence from there. JSON in `data:` is just a string - parse it on the client.

**Client (JavaScript):**

```javascript
const metrics = new EventSource('/events/metrics');
metrics.onmessage = e => {
    const d = JSON.parse(e.data);
    document.getElementById('cpu').textContent = d.cpu + '%';
    document.getElementById('mem').textContent = d.mem + '%';
    document.getElementById('seq').textContent = '#' + d.seq;
};
```

The browser handles reconnection. It sends `Last-Event-ID` automatically. You don't write that code.

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

HTTP/2 multiplexes over one connection -- problem disappears. If you're on HTTP/1.1, keep streams under the limit.

**Text only.** No binary. Base64 if you must.

## Run It

```bash
cd playground/ServerSentEvents/AnimatLabs.ServerSentEvents
dotnet run
```

Open `http://localhost:5074`. Three sections, three patterns. No NuGet. No hub. Just a GET endpoint and a loop.

For full code and setup details, see the [playground README](https://github.com/animat089/playground/tree/main/ServerSentEvents).

**Next up:** I pair SSE with HTMX for a real-time workflow dashboard - no custom JavaScript at all. Stay tuned.

What are you streaming? Dashboards, logs, or something else?

