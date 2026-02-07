---
title: "Kafka to Browser: Real-Time Notifications with SignalR"
excerpt: >-
  "Bridge your event stream to the browser. Here's the complete pipeline from Kafka events to real-time UI updates with SignalR."
categories:
  - Technical
  - .NET
  - Real-Time
tags:
  - .NET
  - Kafka
  - SignalR
  - Real-Time
  - WebSockets
  - Event-Driven
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Real-Time Gap

You have events flowing through Kafka. Your users need to see updates instantly. How do you bridge the gap between server-side event streams and browser clients?

SignalR + Kafka creates a powerful pipeline for real-time applications.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. The architecture: Kafka -> .NET Service -> SignalR -> Browser
2. Setting up the Kafka consumer
3. SignalR Hub design
4. Client subscription patterns (user-specific, group-based)
5. Scaling considerations (SignalR backplane)
6. Complete working example

CODE EXAMPLES:
- Background service consuming Kafka
- SignalR Hub with typed clients
- Broadcasting to specific users/groups
- JavaScript client setup
- Handling reconnection
-->

## The Architecture

```
┌─────────┐    ┌──────────────────┐    ┌─────────────┐
│  Kafka  │───>│  Bridge Service  │───>│  Browser    │
│         │    │  (Consumer +     │    │  (SignalR   │
│         │    │   SignalR Hub)   │    │   Client)   │
└─────────┘    └──────────────────┘    └─────────────┘
```

## Setting Up the Bridge Service

### Kafka Consumer

```csharp
public class KafkaToSignalRService : BackgroundService
{
    private readonly IHubContext<NotificationHub> _hubContext;
    private readonly IConsumer<string, string> _consumer;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _consumer.Subscribe("order-events");
        
        while (!stoppingToken.IsCancellationRequested)
        {
            var result = _consumer.Consume(stoppingToken);
            await ProcessMessage(result.Message);
        }
    }
    
    private async Task ProcessMessage(Message<string, string> message)
    {
        var orderEvent = JsonSerializer.Deserialize<OrderEvent>(message.Value);
        
        // Broadcast to specific user
        await _hubContext.Clients
            .User(orderEvent.UserId)
            .SendAsync("OrderUpdated", orderEvent);
    }
}
```

### SignalR Hub

```csharp
public class NotificationHub : Hub
{
    public async Task JoinOrderGroup(string orderId)
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, $"order-{orderId}");
    }
    
    public async Task LeaveOrderGroup(string orderId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"order-{orderId}");
    }
}
```

## Client-Side Setup

```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl("/notificationHub")
    .withAutomaticReconnect()
    .build();

connection.on("OrderUpdated", (event) => {
    console.log("Order updated:", event);
    updateOrderUI(event);
});

await connection.start();
await connection.invoke("JoinOrderGroup", orderId);
```

## Subscription Patterns

### User-Specific Updates

```csharp
// TODO: Send to authenticated user only
```

### Group-Based Updates

```csharp
// TODO: Order tracking, live dashboards
```

## Scaling with Redis Backplane

```csharp
// TODO: SignalR Redis backplane for multi-server
```

## Handling Reconnection

```csharp
// TODO: Graceful reconnection, message buffering
```

## Conclusion

<!-- TODO: Complete real-time pipeline -->

---

*Building real-time applications? Share your architecture in the comments!*
