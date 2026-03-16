---
title: "Real-Time Workflow Dashboard: HTMX + WorkflowForge, Zero JavaScript"
excerpt: >-
  "Submit an order. Watch 5 steps execute live. Flip a switch -- watch it fail and roll back. HTMX + WorkflowForge. No React. No SignalR. Zero custom JavaScript."
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
last_modified_at: 2026-03-14
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## This Didn't Need React

I needed a workflow status page. Click a button, watch steps execute, show success or rollback. That's it.

My first instinct was a React frontend with WebSocket updates. Then I looked at the requirements again -- one-way data, server renders the UI, no client state.

HTMX has an SSE extension. It opens an `EventSource` with attributes. The server sends HTML fragments, HTMX swaps them into the page.

I paired that with WorkflowForge 2.1.1 for a 5-step order workflow with automatic compensation. The result: a real-time dashboard with zero script tags.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard){: .btn .btn--primary}

> If you're new to SSE in .NET, start with my [Server-Sent Events post](/2026/03/16/server-sent-events-dotnet/) -- it covers the three SSE patterns from scratch.

## How It Works

Two endpoints, one flow.

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

Button click fetches an HTML fragment with SSE attributes. HTMX opens the stream and the server pushes step updates as HTML.

Click "Run with Failure" -- ChargePayment throws, WorkflowForge compensates ReserveStock and ValidateOrder, all streamed live.

## The Frontend

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

That's the entire interactive UI. No `onclick`. No `EventSource`. The `<head>` loads HTMX and the SSE extension. Everything else is server-driven.

## Two Endpoints

**Reset** returns an HTML fragment pre-wired for SSE:

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

`hx-ext="sse"` is set on the `<body>` tag. The reset endpoint returns a fragment with `sse-connect` -- HTMX opens an EventSource to that URL.

`sse-swap="step"` means "when an SSE event named `step` arrives, swap this div." `hx-swap="beforeend"` appends each step. `sse-close="close"` shuts down the connection when the workflow finishes.

**Stream** runs the workflow and pushes events:

```csharp
app.MapGet("/workflow/stream", async (HttpContext ctx, bool fail = false) =>
{
    var bufferingFeature = ctx.Features.Get<IHttpResponseBodyFeature>();
    bufferingFeature?.DisableBuffering();

    ctx.Response.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    ctx.Response.Headers.Connection = "keep-alive";

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

Workflow runs on a background task. `ChannelEventSink` buffers step events. The main loop reads and pushes HTML fragments. When the channel completes, we send `done` then `close` -- the `close` event triggers `sse-close` on the client, which shuts down the EventSource connection.

## The Channel Bridge

`System.Threading.Channels` connects WorkflowForge to SSE:

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

`SingleWriter = false` because multiple operations report concurrently. The reader is the SSE loop -- one consumer, serialized writes to the response.

## The Workflow

Five operations, each with inline compensation:

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

Each operation implements `ForgeAsyncCore` (do the work) and `RestoreAsync` (undo it). WorkflowForge calls `RestoreAsync` in reverse on failure. `ChargePaymentOperation` has a `shouldFail` flag:

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

`GetPropertyOrDefault` in `RestoreAsync` checks if a charge happened. No charge, no refund.

## Server-Rendered HTML Over SSE

Each step becomes a `<div>` with a status label:

```csharp
static string BuildStepHtml(WorkflowEvent evt)
{
    var label = evt.Status.ToUpperInvariant();
    return $"""<div class="step">[{label}] <strong>{evt.OperationName}</strong> {WebUtility.HtmlEncode(evt.Detail)}</div>""";
}
```

Plain text, no client-side rendering. The browser inserts HTML fragments directly.

## When This Fits

HTMX SSE works well for admin dashboards, status monitors, internal tools -- anything where the server owns the state and the client just displays it. Reconnection is handled by the browser. You don't manage WebSocket connections.

Not the right pick for chat or collaborative editing. Use WebSockets or SignalR for bidirectional communication.

## Run It

```bash
cd playground/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard
dotnet run
```

Open `http://localhost:5075`. Two buttons. One happy path, one failure. Watch the steps stream in -- on failure, compensation runs in reverse.

**WorkflowForge 2.1.1** -- inline compensation, `GetOperationOutput`, automatic reverse-order rollback. One NuGet package.

| What | Where |
|------|-------|
| WorkflowForge | [GitHub](https://github.com/animatlabs/workflow-forge) \| [NuGet](https://www.nuget.org/packages/WorkflowForge) |
| HTMX | [htmx.org](https://htmx.org) |
| Playground | [WorkflowForge/HtmxDashboard](https://github.com/animat089/playground/tree/main/WorkflowForge/AnimatLabs.WorkflowForge.HtmxDashboard) |

---

*What's your pick for real-time dashboards -- SSE, SignalR, or something else?*

{% include cta-workflowforge.html %}

---

<!-- LINKEDIN PROMO

Submit an order. Watch 5 steps execute live. Flip a switch -- payment fails, compensation cascades in real time.

No React. No SignalR. No custom JavaScript.

HTMX has an SSE extension. The server returns HTML fragments. HTMX swaps them into the page with attributes -- sse-connect, sse-swap. I paired it with WorkflowForge 2.1.1 for a 5-step order workflow. If ChargePayment fails, ReserveStock and ValidateOrder automatically roll back. All streamed to the browser.

Working playground. Two buttons. One success path, one failure path. Run it locally in 30 seconds.

Full post with code: [link]

What do you use for real-time dashboards?

#dotnet #htmx #workflowforge
-->
