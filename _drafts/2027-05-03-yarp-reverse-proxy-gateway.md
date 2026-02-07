---
title: "YARP: Build a Custom API Gateway in 50 Lines of C#"
excerpt: >-
  "YARP powers billions of daily requests at Microsoft. It's also the easiest way to build a custom API gateway in .NET. Here's a production-ready setup."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - YARP
  - Reverse Proxy
  - API Gateway
  - Load Balancing
  - Microservices
  - Infrastructure
author: animat089
last_modified_at: 2027-05-03
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- What is YARP and why Microsoft built it
- The "50 lines" gateway: minimal setup
- Configuration-driven routing (appsettings.json)
- Code-driven routing (for dynamic scenarios)
- Features tour:
  - Route matching (path, headers, query strings)
  - Load balancing strategies (round-robin, least requests, random, power of two)
  - Health checks (active and passive)
  - Header/query/path transforms
  - Rate limiting integration
  - Authentication/authorization forwarding
  - WebSocket and gRPC proxying
  - HTTP/2 and HTTP/3 support
- Production patterns:
  - BFF (Backend for Frontend) with Blazor/React
  - Aggregation gateway
  - Canary deployments
  - A/B testing with header-based routing
- Monitoring with OpenTelemetry
- YARP vs Nginx vs Traefik vs Ocelot
- Performance characteristics
- Docker setup for local development

UNIQUE ANGLE: "50 lines" hook. YARP is massively underused in the .NET ecosystem 
despite being Microsoft's own production proxy. Show real production patterns, not just "hello proxy."

LIBRARIES:
- Yarp.ReverseProxy (NuGet, Microsoft)
- OpenTelemetry (for monitoring)

LOCAL DEV: Docker Compose for backend services. No cloud needed.
-->

## What is YARP?

YARP (Yet Another Reverse Proxy) is Microsoft's toolkit for building fast, customizable reverse proxies in .NET. It powers Azure App Services, Microsoft 365, and Azure AI -- handling billions of requests daily.

Despite this pedigree, most .NET developers reach for Nginx or Traefik when they need a reverse proxy. That's a mistake. YARP gives you the full power of ASP.NET Core middleware with the performance of a dedicated proxy.

## The 50-Line API Gateway

```csharp
// Program.cs -- that's the entire gateway
var builder = WebApplication.CreateBuilder(args);

// Add YARP from configuration
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();

app.MapReverseProxy();

app.Run();
```

```json
// appsettings.json
{
  "ReverseProxy": {
    "Routes": {
      "users-route": {
        "ClusterId": "users-cluster",
        "Match": {
          "Path": "/api/users/{**catch-all}"
        },
        "Transforms": [
          { "PathRemovePrefix": "/api" }
        ]
      },
      "orders-route": {
        "ClusterId": "orders-cluster",
        "Match": {
          "Path": "/api/orders/{**catch-all}"
        },
        "Transforms": [
          { "PathRemovePrefix": "/api" }
        ]
      }
    },
    "Clusters": {
      "users-cluster": {
        "Destinations": {
          "primary": { "Address": "http://users-service:5001/" },
          "secondary": { "Address": "http://users-service-2:5001/" }
        },
        "LoadBalancingPolicy": "RoundRobin"
      },
      "orders-cluster": {
        "Destinations": {
          "primary": { "Address": "http://orders-service:5002/" }
        }
      }
    }
  }
}
```

That's it. You have an API gateway with load balancing, path rewriting, and multiple backend services.

## Route Matching

YARP supports sophisticated route matching:

```json
{
  "Routes": {
    "versioned-api": {
      "ClusterId": "api-v2",
      "Match": {
        "Path": "/api/v2/{**remainder}",
        "Headers": [
          {
            "Name": "X-API-Version",
            "Values": ["2.0"],
            "Mode": "ExactHeader"
          }
        ]
      }
    },
    "mobile-bff": {
      "ClusterId": "mobile-backend",
      "Match": {
        "Path": "/mobile/{**catch-all}",
        "Headers": [
          {
            "Name": "User-Agent",
            "Values": ["MobileApp/*"],
            "Mode": "HeaderPrefix"
          }
        ]
      }
    }
  }
}
```

## Load Balancing Strategies

```json
{
  "Clusters": {
    "high-availability": {
      "LoadBalancingPolicy": "PowerOfTwoChoices",
      "Destinations": {
        "east-1": { "Address": "http://service-east-1:5000/" },
        "east-2": { "Address": "http://service-east-2:5000/" },
        "west-1": { "Address": "http://service-west-1:5000/" },
        "west-2": { "Address": "http://service-west-2:5000/" }
      }
    }
  }
}
```

Available policies:
- **RoundRobin**: Sequential distribution
- **LeastRequests**: Routes to the least busy destination
- **Random**: Random selection
- **PowerOfTwoChoices**: Picks two random destinations, routes to the least busy (best general-purpose)
- **FirstAlphabetical**: Deterministic, useful for sticky sessions

## Health Checks

```json
{
  "Clusters": {
    "monitored-cluster": {
      "HealthCheck": {
        "Active": {
          "Enabled": true,
          "Interval": "00:00:10",
          "Timeout": "00:00:05",
          "Path": "/health"
        },
        "Passive": {
          "Enabled": true,
          "Policy": "TransportFailureRate",
          "ReactivationPeriod": "00:00:30"
        }
      },
      "Destinations": {
        "primary": { 
          "Address": "http://service:5000/",
          "Health": "http://service:5000/health"
        }
      }
    }
  }
}
```

## Request/Response Transforms

```json
{
  "Routes": {
    "transformed-route": {
      "ClusterId": "backend",
      "Match": { "Path": "/api/{**catch-all}" },
      "Transforms": [
        { "PathRemovePrefix": "/api" },
        { "RequestHeadersCopy": "true" },
        { "RequestHeader": "X-Forwarded-Gateway", "Set": "yarp-gateway" },
        { "ResponseHeader": "X-Powered-By", "Set": "YARP", "When": "Always" },
        { "ResponseHeaderRemove": "Server" }
      ]
    }
  }
}
```

### Code-Based Transforms

```csharp
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        // Add correlation ID to every proxied request
        context.AddRequestTransform(transform =>
        {
            var correlationId = transform.HttpContext.Request.Headers["X-Correlation-Id"]
                .FirstOrDefault() ?? Guid.NewGuid().ToString();

            transform.ProxyRequest.Headers.Add("X-Correlation-Id", correlationId);
            return ValueTask.CompletedTask;
        });

        // Log response times
        context.AddResponseTransform(transform =>
        {
            var elapsed = transform.HttpContext.Items["RequestStart"] is DateTime start
                ? (DateTime.UtcNow - start).TotalMilliseconds
                : -1;

            transform.ProxyResponse?.Headers.Add("X-Response-Time", $"{elapsed:F0}ms");
            return ValueTask.CompletedTask;
        });
    });
```

## Production Patterns

### Backend for Frontend (BFF)

```csharp
// Aggregate multiple microservice calls into a single BFF response
app.MapGet("/bff/dashboard", async (HttpContext ctx, IHttpForwarder forwarder) =>
{
    // Parallel calls to multiple services
    var userTask = CallService("http://users-service/api/me", ctx);
    var ordersTask = CallService("http://orders-service/api/recent", ctx);
    var notificationsTask = CallService("http://notifications/api/unread", ctx);

    await Task.WhenAll(userTask, ordersTask, notificationsTask);

    return Results.Ok(new
    {
        User = await userTask,
        RecentOrders = await ordersTask,
        Notifications = await notificationsTask
    });
});
```

### Canary Deployments

```csharp
// Route 10% of traffic to the canary
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"))
    .AddTransforms(context =>
    {
        if (context.Route.RouteId == "canary-route")
        {
            context.AddRequestTransform(transform =>
            {
                // 10% canary traffic based on hash of user ID
                var userId = transform.HttpContext.User.FindFirst("sub")?.Value ?? "";
                var hash = Math.Abs(userId.GetHashCode()) % 100;

                if (hash < 10) // 10% to canary
                {
                    transform.ProxyRequest.RequestUri = new Uri(
                        "http://service-canary:5000" + 
                        transform.ProxyRequest.RequestUri?.PathAndQuery);
                }

                return ValueTask.CompletedTask;
            });
        }
    });
```

### Rate Limiting Integration

```csharp
// Combine with ASP.NET Core rate limiting
builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("api-limit", limiter =>
    {
        limiter.PermitLimit = 100;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 10;
    });
});

app.UseRateLimiter();

// Apply to specific YARP routes
app.MapReverseProxy(pipeline =>
{
    pipeline.UseRateLimiter();
});
```

## YARP vs Alternatives

| Feature | YARP | Nginx | Traefik | Ocelot |
|---------|------|-------|---------|--------|
| Language | C# | C | Go | C# |
| Config | JSON/Code | nginx.conf | YAML/Labels | JSON |
| Custom middleware | **Full ASP.NET** | Lua/C modules | Go plugins | Limited |
| Performance | Excellent | Excellent | Good | Moderate |
| gRPC proxy | Yes | Yes | Yes | Limited |
| WebSocket | Yes | Yes | Yes | Yes |
| Service discovery | Code-based | 3rd party | **Built-in** | Consul |
| Learning curve | Low (.NET devs) | Medium | Low | Low |
| Customization | **Unlimited** | Limited | Moderate | Limited |

**Choose YARP when:**
- You're already in the .NET ecosystem
- You need custom routing/transform logic in C#
- You want to leverage ASP.NET Core middleware
- You need programmatic control over routing decisions

## Monitoring with OpenTelemetry

```csharp
builder.Services.AddOpenTelemetry()
    .WithTracing(tracing =>
    {
        tracing
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource("Yarp.ReverseProxy")
            .AddJaegerExporter();
    })
    .WithMetrics(metrics =>
    {
        metrics
            .AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddPrometheusExporter();
    });
```

## Docker Compose for Local Development

```yaml
version: '3.8'
services:
  gateway:
    build: ./src/Gateway
    ports:
      - "8080:8080"
    depends_on:
      - users-service
      - orders-service

  users-service:
    build: ./src/UsersService
    ports:
      - "5001:5001"

  orders-service:
    build: ./src/OrdersService
    ports:
      - "5002:5002"
```

## Conclusion

YARP is the most underused tool in the .NET ecosystem. It's Microsoft's production reverse proxy, battle-tested at massive scale, and yet most teams reach for Nginx or write their own HTTP forwarding code.

In 50 lines of C#, you get a production-ready API gateway. With a few more, you get canary deployments, BFF aggregation, and custom routing logic that would take thousands of lines of Nginx configuration.

If you're building microservices in .NET, YARP should be your default gateway.

---

*Using YARP in production? Have a creative routing pattern? Share it in the comments!*
