---
title: "Build a Real-Time HTMX Dashboard in .NET Without JavaScript"
excerpt: >-
  Build a live workflow dashboard with HTMX SSE extension and WorkflowForge. Steps stream in, failures trigger compensation, all server-rendered with zero JavaScript.
categories:
  - Technical
  - .NET
  - Workflow
tags:
  - .NET
  - HTMX
  - WorkflowForge
  - Server-Sent Events
  - Real-Time
  - ASP.NET Core
  - Compensation
author: animat089
last_modified_at: 2026-03-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
faq:
  - q: "Can I build a real-time dashboard in .NET without JavaScript?"
    a: "For the UI updates, yes: HTMX's SSE extension pulls HTML over EventSource and patches the DOM. You still load HTMX itself, but you don't write custom JS for the stream."
  - q: "How does HTMX SSE work with ASP.NET Core?"
    a: "Attributes like `sse-connect` / `sse-swap` tell HTMX to open the stream; your minimal API or controller returns `text/event-stream` with HTML chunks. HTMX swaps them in—no hand-rolled `EventSource` code in your repo."
  - q: "What is WorkflowForge compensation in the HTMX dashboard?"
    a: "If a step blows up, WorkflowForge runs compensations newest-first. Here we just pipe those steps out as SSE so the page shows the rollback live—same saga idea, rendered as HTML fragments."
---

I needed a workflow status page. Click a button, watch steps execute, show success or rollback. React plus WebSockets was my first instinct. Then I looked at the actual requirements: one-way data, server renders the UI, no client state. Overkill.

HTMX has an SSE extension that opens an `EventSource` from attributes. The server sends HTML fragments, HTMX swaps them into the page. I paired it with WorkflowForge 2.1.1 for a five-step order workflow with automatic compensation. **Zero** custom JavaScript. 

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard){: .btn .btn--primary}

> If you're new to SSE in .NET, I wrote about the [three SSE patterns from scratch](https://animatlabs.com/technical/.net/server-sent-events-dotnet/) in the previous post.

## The Flow

Two endpoints, one flow:

```
Browser                                 Server
  │                                        │
  ├─ hx-get="/workflow/reset" ────────────>│ Returns HTML fragment
  │                                        │   with sse-connect attribute
  │<────── <div sse-connect="/stream"> ────┤
  │                                        │
  ├─ HTMX opens EventSource ─────────────>│ WorkflowForge runs 5 ops
  │                                        │   Channel pipes events
  │<──────── event: step ──────────────────┤
  │<──────── event: step ──────────────────┤
  │<──────── event: done ──────────────────┤
```

Button click fetches an HTML fragment with SSE attributes. HTMX opens the stream and the server pushes step updates as HTML. Click "Run with Failure" and ChargePayment throws. WorkflowForge then runs compensations in reverse order for every step that had completed up to the failure—including `ChargePayment`'s own `RestoreAsync` (which logs that there is no charge to reverse when the gateway never completed), then `ReserveStock`, then `ValidateOrder` - all streamed live.

## The HTML

The entire interactive UI:

```html
<div>
    <button hx-get="/workflow/reset"
            hx-target="#output"
            hx-swap="innerHTML">Run Order Workflow</button>
    <button hx-get="/workflow/reset?fail=true"
            hx-target="#output"
            hx-swap="innerHTML">Run with Failure</button>
</div>

<div id="output">
    <p>Click a button to start a workflow.</p>
</div>
```

No `onclick`. No `EventSource` in JavaScript. The `<head>` loads HTMX and the SSE extension. `hx-ext="sse"` goes on the `<body>` tag. Everything else is server-driven.

## The Server Side

The reset endpoint returns an HTML fragment pre-wired for SSE. When HTMX inserts this into the page, it sees the `sse-connect` attribute and opens an EventSource to the stream URL:

```csharp
app.MapGet("/workflow/reset", (bool fail = false) =>
{
    var html = $"""
        <div sse-connect="/workflow/stream?fail={fail.ToString().ToLowerInvariant()}" sse-close="close">
            <div id="steps" sse-swap="step" hx-swap="beforeend"></div>
            <div id="final-status" sse-swap="done" hx-swap="innerHTML"></div>
        </div>
        """;
    return Results.Content(html, "text/html");
});
```

`sse-swap="step"` means "when an SSE event named `step` arrives, swap this div." `hx-swap="beforeend"` appends each step instead of replacing. `sse-close="close"` shuts down the connection when the workflow finishes.

The stream endpoint runs the workflow on a background task and pushes events through a Channel:

```csharp
app.MapGet("/workflow/stream", async (HttpContext ctx, bool fail = false) =>
{
    var bufferingFeature = ctx.Features.Get<IHttpResponseBodyFeature>();
    bufferingFeature?.DisableBuffering();

    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";
    ctx.Response.Headers["X-Accel-Buffering"] = "no";

    var sink = new ChannelEventSink();
    var ct = ctx.RequestAborted;
    var workflow = OrderProcessingWorkflow.Build(sink, fail);

    using var foundry = WF.CreateFoundry(
        workflowName: workflow.Name,
        initialProperties: new Dictionary<string, object?>
        {
            [OrderKeys.ShouldFail] = fail
        });

    using var smith = WF.CreateSmith(new ConsoleLogger("WF"));
    string? finalHtml = null;

    try
    {
        _ = Task.Run(async () =>
        {
            try
            {
                await smith.ForgeAsync(workflow, foundry, ct).ConfigureAwait(false);
                finalHtml = "<p><strong>All steps completed successfully.</strong></p>";
            }
            catch (OperationCanceledException) { }
            catch
            {
                finalHtml = "<p><strong>Workflow failed -- compensation complete.</strong></p>";
            }
            finally
            {
                sink.Complete();
            }
        }, ct);

        await foreach (var evt in sink.Reader.ReadAllAsync(ct))
        {
            var html = BuildStepHtml(evt);
            await SendSseAsync(ctx, "step", html, ct).ConfigureAwait(false);
        }

        if (finalHtml is not null)
        {
            await SendSseAsync(ctx, "done", finalHtml, ct).ConfigureAwait(false);
            await SendSseAsync(ctx, "close", "", ct).ConfigureAwait(false);
        }
    }
    catch (OperationCanceledException) { }
});
```

The `close` event triggers `sse-close` on the client, shutting down the EventSource so it doesn't auto-reconnect.

## Bridging WorkflowForge to SSE

`System.Threading.Channels` connects the two. Workflow operations write events, the SSE loop reads them:

```csharp
public sealed class ChannelEventSink : IWorkflowEventSink
{
    private readonly Channel<WorkflowEvent> _channel =
        Channel.CreateUnbounded<WorkflowEvent>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false
        });

    public ChannelReader<WorkflowEvent> Reader => _channel.Reader;

    public void Report(string operationName, string status, string detail)
    {
        _channel.Writer.TryWrite(new WorkflowEvent
        {
            OperationName = operationName,
            Status = status,
            Detail = detail
        });
    }

    public void Complete() => _channel.Writer.TryComplete();
}
```

`SingleWriter = false` because multiple operations can report concurrently. The reader is the SSE loop: one consumer, serialized writes to the response stream.

## The Workflow and Compensation

Five operations with WorkflowForge 2.1.1:

```csharp
public static IWorkflow Build(IWorkflowEventSink sink, bool shouldFail)
{
    return WF
        .CreateWorkflow("OrderProcessing")
        .AddOperation(new ValidateOrderOperation(sink))
        .AddOperation(new ReserveStockOperation(sink))
        .AddOperation(new ChargePaymentOperation(sink, shouldFail))
        .AddOperation(new CreateShipmentOperation(sink))
        .AddOperation(new SendNotificationOperation(sink))
        .Build();
}
```

Each operation implements `ForgeAsyncCore` (do the work) and `RestoreAsync` (undo it). When any step throws, WorkflowForge walks backward and invokes `RestoreAsync` for each completed step in reverse order (including the step that failed, when it has cleanup or a no-op path). The `ChargePaymentOperation` has a `shouldFail` flag that simulates a payment gateway timeout:

```csharp
protected override async Task<object?> ForgeAsyncCore(
    object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
{
    sink.Report(Name, "running", "Charging payment method...");
    await Task.Delay(1200, ct).ConfigureAwait(false);

    if (shouldFail)
    {
        sink.Report(Name, "failed", "Payment gateway timeout -- triggering compensation");
        throw new InvalidOperationException("Payment gateway timeout");
    }

    foundry.SetProperty(OrderKeys.PaymentCharged, true);
    sink.Report(Name, "completed", "$149.99 charged to card ending 4242");
    return inputData;
}
```

In `RestoreAsync`, it checks if a charge actually happened via `GetPropertyOrDefault`. No charge means no refund (the kind of detail that breaks things in production if you skip it).

Each step event becomes plain HTML:

```csharp
static string BuildStepHtml(WorkflowEvent evt)
{
    var label = evt.Status.ToUpperInvariant();
    return $"""<div class="step">[{label}] <strong>{evt.OperationName}</strong> {WebUtility.HtmlEncode(evt.Detail)}</div>""";
}
```

No client-side rendering. The browser inserts HTML fragments directly.

## Where This Fits

HTMX + SSE works well for admin dashboards, status monitors, internal tools: anything where the server owns the state and the client displays it. The browser handles reconnection.

Chat or collaborative editing? Wrong tool. WebSockets or SignalR when you need traffic both ways, which is a longer story than this write-up has room for but you already know when you need it.

To try it:

```bash
cd playground/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard
dotnet run
```

Open `http://localhost:5075`. Two buttons: one happy path, one failure. On failure, compensations run newest-first across all completed steps (including `ChargePayment`'s rollback hook), and you can see each step stream in.

| What | Where |
|------|-------|
| WorkflowForge | [GitHub](https://github.com/animatlabs/workflow-forge) \| [NuGet](https://www.nuget.org/packages/WorkflowForge) |
| HTMX | [htmx.org](https://htmx.org) |
| Playground | [WorkflowForge/HtmxDashboard](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard) |

{% include cta-workflowforge.html %}

---

## More on This Topic

- [Server-Sent Events in ASP.NET Core](/technical/.net/server-sent-events-dotnet/)
- [WorkflowForge introduction](/technical/.net/workflow/workflow-forge-introduction/)
- [MassTransit saga with WorkflowForge](/technical/.net/workflow/masstransit-workflowforge-saga/)
