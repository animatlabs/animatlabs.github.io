---
title: "gRPC in .NET: High-Performance Service Communication"
excerpt: >-
  "When REST isn't fast enough. Here's how I use gRPC for inter-service communication in .NET."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - gRPC
  - Protobuf
  - Microservices
  - API
  - Performance
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## When to Use gRPC

gRPC and REST serve different purposes. REST is ubiquitous, human-readable, and works everywhere. gRPC is faster, more efficient, and designed for service-to-service communication.

Here's my decision framework:

| Criteria | REST | gRPC |
|----------|------|------|
| Browser support | Yes | Limited (requires grpc-web) |
| Human readable | Yes | No (binary Protobuf) |
| Performance | Good | Excellent |
| Streaming | Limited | Native (bidirectional) |
| Code generation | Optional | Required |
| Contract-first | Optional | Required |
| Tooling ecosystem | Mature | Growing |

**Use REST for:**
- Public APIs consumed by browsers
- APIs where human readability matters
- Simple CRUD operations
- When you need maximum compatibility

**Use gRPC for:**
- Internal service-to-service communication
- High-throughput, low-latency requirements
- Streaming data (real-time updates, file transfers)
- When you want strict contracts with code generation

In practice, I use gRPC for communication between backend microservices and REST for external APIs that browsers or mobile apps consume.

## Basic Setup

### Proto File

gRPC is contract-first. You define your service in a `.proto` file, and tooling generates the client and server code:

```protobuf
syntax = "proto3";

option csharp_namespace = "MyService.Grpc";

package orders;

service OrderService {
  rpc GetOrder (GetOrderRequest) returns (OrderResponse);
  rpc CreateOrder (CreateOrderRequest) returns (OrderResponse);
  rpc StreamOrders (StreamOrdersRequest) returns (stream OrderResponse);
}

message GetOrderRequest {
  int32 id = 1;
}

message CreateOrderRequest {
  string customer_name = 1;
  repeated OrderItem items = 2;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  double unit_price = 3;
}

message OrderResponse {
  int32 id = 1;
  string customer_name = 2;
  double total = 3;
  string status = 4;
}

message StreamOrdersRequest {
  string customer_id = 1;
}
```

Add the proto file to your `.csproj`:

```xml
<ItemGroup>
  <Protobuf Include="Protos\order.proto" GrpcServices="Both" />
</ItemGroup>

<ItemGroup>
  <PackageReference Include="Grpc.AspNetCore" Version="2.60.0" />
</ItemGroup>
```

The `GrpcServices="Both"` generates both client and server code. Use `Server` or `Client` if you only need one.

### Server Implementation

The generated code creates a base class you override:

```csharp
public class OrderServiceImpl : OrderService.OrderServiceBase
{
    private readonly IOrderRepository _repository;
    private readonly ILogger<OrderServiceImpl> _logger;
    
    public OrderServiceImpl(IOrderRepository repository, ILogger<OrderServiceImpl> logger)
    {
        _repository = repository;
        _logger = logger;
    }
    
    public override async Task<OrderResponse> GetOrder(
        GetOrderRequest request, 
        ServerCallContext context)
    {
        _logger.LogInformation("Getting order {OrderId}", request.Id);
        
        var order = await _repository.GetByIdAsync(request.Id, context.CancellationToken);
        
        if (order is null)
        {
            throw new RpcException(new Status(StatusCode.NotFound, $"Order {request.Id} not found"));
        }
        
        return new OrderResponse
        {
            Id = order.Id,
            CustomerName = order.CustomerName,
            Total = order.Total,
            Status = order.Status.ToString()
        };
    }
    
    public override async Task<OrderResponse> CreateOrder(
        CreateOrderRequest request, 
        ServerCallContext context)
    {
        var order = new Order
        {
            CustomerName = request.CustomerName,
            Items = request.Items.Select(i => new OrderItem
            {
                ProductId = i.ProductId,
                Quantity = i.Quantity,
                UnitPrice = i.UnitPrice
            }).ToList()
        };
        
        await _repository.CreateAsync(order, context.CancellationToken);
        
        return new OrderResponse
        {
            Id = order.Id,
            CustomerName = order.CustomerName,
            Total = order.Total,
            Status = order.Status.ToString()
        };
    }
}
```

Register the service in `Program.cs`:

```csharp
builder.Services.AddGrpc();

var app = builder.Build();

app.MapGrpcService<OrderServiceImpl>();
```

### Client Usage

The generated client makes calling the service straightforward:

```csharp
using var channel = GrpcChannel.ForAddress("https://localhost:5001");
var client = new OrderService.OrderServiceClient(channel);

var response = await client.GetOrderAsync(new GetOrderRequest { Id = 1 });
Console.WriteLine($"Order: {response.CustomerName}, Total: {response.Total}");
```

For dependency injection, register the client in your consuming service:

```csharp
builder.Services.AddGrpcClient<OrderService.OrderServiceClient>(options =>
{
    options.Address = new Uri("https://order-service:5001");
});
```

## Streaming

One of gRPC's killer features is native streaming support. There are three types:

### Server Streaming

The server sends multiple responses to a single request. Perfect for paginated data or real-time updates:

```protobuf
rpc StreamOrders (StreamOrdersRequest) returns (stream OrderResponse);
```

Server implementation:

```csharp
public override async Task StreamOrders(
    StreamOrdersRequest request,
    IServerStreamWriter<OrderResponse> responseStream,
    ServerCallContext context)
{
    var orders = _repository.GetOrdersForCustomerAsync(request.CustomerId);
    
    await foreach (var order in orders.WithCancellation(context.CancellationToken))
    {
        await responseStream.WriteAsync(new OrderResponse
        {
            Id = order.Id,
            CustomerName = order.CustomerName,
            Total = order.Total
        });
    }
}
```

Client consumption:

```csharp
using var call = client.StreamOrders(new StreamOrdersRequest { CustomerId = "cust-123" });

await foreach (var order in call.ResponseStream.ReadAllAsync())
{
    Console.WriteLine($"Received order: {order.Id}");
}
```

### Client Streaming

The client sends multiple messages, the server responds once. Useful for batch uploads:

```protobuf
rpc UploadOrderItems (stream OrderItem) returns (UploadSummary);
```

### Bidirectional Streaming

Both client and server stream simultaneously. Perfect for chat, real-time collaboration, or complex protocols:

```protobuf
rpc Chat (stream ChatMessage) returns (stream ChatMessage);
```

## Error Handling

gRPC uses status codes instead of HTTP status codes. The most common:

| Status Code | Meaning |
|-------------|---------|
| `OK` | Success |
| `NotFound` | Resource doesn't exist |
| `InvalidArgument` | Bad request data |
| `PermissionDenied` | Not authorized |
| `Unavailable` | Service temporarily unavailable |
| `Internal` | Unexpected error |

Throw `RpcException` to return an error:

```csharp
if (order is null)
{
    throw new RpcException(new Status(StatusCode.NotFound, "Order not found"));
}
```

On the client, catch `RpcException`:

```csharp
try
{
    var response = await client.GetOrderAsync(new GetOrderRequest { Id = 999 });
}
catch (RpcException ex) when (ex.StatusCode == StatusCode.NotFound)
{
    Console.WriteLine("Order not found");
}
catch (RpcException ex)
{
    Console.WriteLine($"gRPC error: {ex.Status.Detail}");
}
```

## Deadlines and Cancellation

Always set deadlines to prevent hanging calls:

```csharp
var deadline = DateTime.UtcNow.AddSeconds(5);
var response = await client.GetOrderAsync(
    new GetOrderRequest { Id = 1 },
    deadline: deadline);
```

Or use `CancellationToken`:

```csharp
using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
var response = await client.GetOrderAsync(
    new GetOrderRequest { Id = 1 },
    cancellationToken: cts.Token);
```

Deadlines propagate automatically. If Service A calls Service B with a 5-second deadline, and A spends 2 seconds before the call, B sees a 3-second deadline.

## My Recommendations

After using gRPC in production, here's what works:

**Do:**
- Use gRPC for internal service communication where performance matters
- Define clear proto contracts and version them
- Set deadlines on every call
- Use streaming for real-time data and large result sets
- Add interceptors for cross-cutting concerns (logging, metrics)

**Don't:**
- Use gRPC for browser-facing APIs (unless you add grpc-web)
- Forget to handle `RpcException` on clients
- Ignore proto backward compatibility (adding fields is safe, removing isn't)
- Skip deadline configuration

**Interceptors for cross-cutting concerns:**

```csharp
public class LoggingInterceptor : Interceptor
{
    private readonly ILogger<LoggingInterceptor> _logger;
    
    public LoggingInterceptor(ILogger<LoggingInterceptor> logger)
    {
        _logger = logger;
    }
    
    public override async Task<TResponse> UnaryServerHandler<TRequest, TResponse>(
        TRequest request,
        ServerCallContext context,
        UnaryServerMethod<TRequest, TResponse> continuation)
    {
        _logger.LogInformation("gRPC call: {Method}", context.Method);
        var stopwatch = Stopwatch.StartNew();
        
        try
        {
            return await continuation(request, context);
        }
        finally
        {
            _logger.LogInformation("gRPC call completed in {Elapsed}ms", stopwatch.ElapsedMilliseconds);
        }
    }
}
```

## Conclusion

gRPC excels at service-to-service communication where performance and type safety matter. The contract-first approach with Protobuf ensures clients and servers stay in sync, and native streaming support enables patterns that are awkward with REST.

Start with your highest-traffic internal endpoints. Define clean proto contracts, implement proper error handling, and always set deadlines. Once you've experienced the developer ergonomics of generated clients and the performance benefits of binary serialization, you'll find more places where gRPC fits.

REST for external APIs, gRPC for internal communication. That's my pattern.

**Sample project:** [GitHub](https://github.com/animat089/grpc-sample){: .btn .btn--primary}

---

*Using gRPC in your microservices? Share your experience in the comments!*
