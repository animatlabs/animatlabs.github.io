---
title: "Real-Time Workflow Dashboard: HTMX + WorkflowForge, Zero JavaScript"
excerpt: >-
  "Submit an order. Watch 5 steps execute live. Flip a switch—watch it fail and roll back in real-time. HTMX + WorkflowForge. No React. No SignalR. Just SSE."
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
last_modified_at: 2026-03-23
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Real-Time Dashboards Don't Need React

I've seen teams reach for SignalR, Blazor, or a full React stack just to show a workflow running step-by-step. The requirement is simple: click a button, stream status updates to the browser. The solution often balloons into WebSockets, state management, and a build pipeline.

HTMX has 38k GitHub stars because it solves this without the ceremony. Server-Sent Events stream data one way. The browser's native `EventSource` API consumes it. No framework. No npm install.

Pair that with WorkflowForge 2.1.1 — a .NET workflow orchestration library with inline compensation and automatic rollback — and you get a real-time workflow dashboard in under 200 lines of code. HTMX (or plain HTML + EventSource) renders the UI. WorkflowForge orchestrates the process.

I built a playground to prove it. Here's how it works.

---

## The Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser                                                     │
│  └─ EventSource('/workflow/start?fail=false')                │
│       │                                                      │
│       ▼ SSE stream                                           │
├─────────────────────────────────────────────────────────────┤
│  ASP.NET Core Minimal API                                    │
│  └─ /workflow/start → text/event-stream                      │
│       │                                                      │
│       ├─ ChannelEventSink ← WorkflowForge operations report   │
│       │                                                      │
│       └─ OrderProcessingWorkflow (5 ops, each with restore)  │
│            ValidateOrder → ReserveStock → ChargePayment      │
│            → CreateShipment → SendNotification               │
└─────────────────────────────────────────────────────────────┘
```

Two buttons: "Run Order Workflow" and "Run with Failure". The second one fails at ChargePayment and triggers automatic compensation — ReserveStock releases inventory, ValidateOrder clears its record. All streamed to the browser in real time.

---

## The SSE Endpoint

The `/workflow/start` endpoint returns `text/event-stream` and keeps the connection open. A `ChannelEventSink` pipes events from WorkflowForge operations into the response:

```csharp
app.MapGet("/workflow/start", async (HttpContext ctx, bool fail = false) =>
{
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

    _ = Task.Run(async () =>
    {
        try
        {
            await smith.ForgeAsync(workflow, foundry, ct).ConfigureAwait(false);
            await SendSseAsync(ctx, "done",
                """<div id="final-status" class="status-success">All steps completed successfully</div>""",
                ct).ConfigureAwait(false);
        }
        catch (OperationCanceledException) { }
        catch
        {
            await SendSseAsync(ctx, "done",
                """<div id="final-status" class="status-failed">Workflow failed &mdash; compensation complete</div>""",
                ct).ConfigureAwait(false);
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
});
```

The workflow runs on a background task. The main loop reads from the channel and pushes HTML fragments to the client. Each event is a small `<div>` with the step name, status, and detail.

---

## The Channel Bridge

`System.Threading.Channels` connects WorkflowForge to the SSE stream. Operations call `sink.Report(name, status, detail)`; the channel buffers events until the response loop reads them:

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

`SingleWriter = false` because multiple operations can report concurrently. The reader is the SSE loop.

---

## The Workflow: Five Operations, Inline Compensation

Each operation extends `WorkflowOperationBase` and implements `ForgeAsyncCore` (do the work) and `RestoreAsync` (undo it if something fails downstream). WorkflowForge 2.1.1 runs compensation automatically in reverse order.

```csharp
public static class OrderProcessingWorkflow
{
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
}
```

`ChargePaymentOperation` has a `shouldFail` flag for the demo. When it throws, WorkflowForge rolls back ReserveStock and ValidateOrder:

```csharp
public sealed class ChargePaymentOperation(IWorkflowEventSink sink, bool shouldFail) : WorkflowOperationBase
{
    public override string Name => "ChargePayment";

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

    public override async Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        if (foundry.GetPropertyOrDefault<bool>(OrderKeys.PaymentCharged))
        {
            sink.Report(Name, "compensating", "Issuing refund...");
            await Task.Delay(800, ct).ConfigureAwait(false);
            sink.Report(Name, "compensated", "$149.99 refunded");
        }
        else
        {
            sink.Report(Name, "compensated", "No charge to reverse");
        }
    }
}
```

`GetPropertyOrDefault` lets compensation check whether a charge actually happened. No charge, no refund.

---

## The Frontend

The HTML loads HTMX (and the SSE extension) but the demo uses the native `EventSource` API directly — about 30 lines of script. Dark theme, step cards that animate in, and two buttons:

```html
<div class="controls">
    <button class="btn-success" onclick="startWorkflow(false)">Run Order Workflow</button>
    <button class="btn-danger" onclick="startWorkflow(true)">Run with Failure</button>
    <button class="btn-reset" onclick="resetDashboard()">Reset</button>
</div>

<div id="workflow-panel">
    <div id="steps">
        <div class="empty-state">Click a button to start a workflow</div>
    </div>
    <div id="final-status"></div>
</div>
```

```javascript
function startWorkflow(fail) {
    document.getElementById('steps').innerHTML = '';
    document.getElementById('final-status').innerHTML = '';

    const evtSource = new EventSource('/workflow/start?fail=' + fail);

    evtSource.addEventListener('step', function(e) {
        const steps = document.getElementById('steps');
        const temp = document.createElement('div');
        temp.innerHTML = e.data;
        const newStep = temp.firstChild;
        const existingStep = document.getElementById(newStep.id);
        if (existingStep) {
            existingStep.replaceWith(newStep);
        } else {
            steps.appendChild(newStep);
        }
    });

    evtSource.addEventListener('done', function(e) {
        document.getElementById('final-status').innerHTML = e.data;
        evtSource.close();
    });

    evtSource.onerror = function() {
        evtSource.close();
    };
}
```

Each `step` event carries server-rendered HTML. The script either appends a new step or replaces an existing one (for status updates: running → completed → compensating). No virtual DOM, no diffing.

---

## Server-Rendered HTML Over the Wire

The server builds each step as a `<div>` with status-specific classes:

```csharp
static string BuildStepHtml(WorkflowEvent evt)
{
    var icon = evt.Status switch
    {
        "running" => "&#9654;",
        "completed" => "&#10004;",
        "failed" => "&#10008;",
        "compensating" => "&#8634;",
        "compensated" => "&#8634;",
        _ => "&#9679;"
    };

    return $"""<div class="step step-{evt.Status}" id="step-{evt.OperationName}"><span class="step-icon">{icon}</span><span class="step-name">{evt.OperationName}</span><span class="step-detail">{WebUtility.HtmlEncode(evt.Detail)}</span></div>""";
}
```

CSS handles the colors: green for completed, red for failed, amber for compensating. The browser just inserts HTML. HTMX's SSE extension could do the same with `hx-sse` — the pattern is identical.

---

## WorkflowForge 2.1.1: What You Get

| Feature | What it does |
|---------|--------------|
| **Inline compensation** | Each operation defines its own `RestoreAsync` — no separate saga handler |
| **GetOperationOutput** | Downstream operations can read outputs from previous steps via the foundry |
| **Automatic rollback** | On failure, WorkflowForge runs `RestoreAsync` in reverse order for all completed steps |

No Durable Functions, no Azure Logic Apps. One NuGet package, in-process execution.

---

## Run It

```bash
cd playground/HtmxWorkflowForge/AnimatLabs.HtmxWorkflowForge
dotnet run
```

Open `http://localhost:5000`. Click "Run Order Workflow" — watch 5 steps light up over ~4 seconds. Click "Run with Failure" — ChargePayment fails, then ReserveStock and ValidateOrder compensate. The UI updates in real time.

---

## When This Fits

**Good fit:**
- Admin dashboards, internal tools, status monitors
- Workflows that need compensation (payments, inventory, external APIs)
- Teams that want real-time without the complexity of SignalR or WebSockets

**Not ideal:**
- True bidirectional chat (use WebSockets)
- Offline-first or heavy client state (use a SPA)

---

## Resources

| What | Where |
|------|-------|
| WorkflowForge | [GitHub](https://github.com/animatlabs/workflow-forge) \| [NuGet](https://www.nuget.org/packages/WorkflowForge) |
| HTMX | [htmx.org](https://htmx.org) |
| Playground | [HtmxWorkflowForge](https://github.com/animat089/playground/tree/main/HtmxWorkflowForge) |

---

*What's your go-to for real-time dashboards — SSE, SignalR, or something else?*

{% include cta-workflowforge.html %}

---

<!-- ========== LINKEDIN PROMO POST - DO NOT PUBLISH IN BLOG ========== -->

**LinkedIn Promo Post (150–250 words):**

Submit an order. Watch 5 steps execute live. Flip a switch — watch it fail and roll back in real time.

No React. No SignalR. No WebSockets.

I paired HTMX + WorkflowForge 2.1.1 to build a real-time workflow dashboard in under 200 lines. Server-Sent Events stream step updates from the server. The browser's native EventSource API consumes them. WorkflowForge orchestrates the process with inline compensation — if ChargePayment fails, ReserveStock and ValidateOrder automatically roll back.

The architecture is simple: a `ChannelEventSink` pipes events from WorkflowForge operations into the SSE response. Each operation reports status (running, completed, failed, compensating). The server sends HTML fragments. The client just inserts them. No virtual DOM, no build step.

I built a playground you can run — two buttons, one happy path, one failure path. Click "Run with Failure" and watch the compensation cascade in real time.

Full post with code: [link to blog post]

What do you use for real-time dashboards — SSE, SignalR, or something else?
