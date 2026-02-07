---
title: "FastEndpoints: Why I Stopped Using Minimal APIs"
excerpt: >-
  "Same performance as Minimal APIs, better developer experience. FastEndpoints brings structure without the MVC overhead."
categories:
  - Technical
  - .NET
  - API Development
tags:
  - .NET
  - FastEndpoints
  - Minimal APIs
  - REST API
  - Web API
  - Performance
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Minimal APIs Trade-off

Minimal APIs are fast and lightweight, but they can become messy as projects grow. Controllers provide structure but add overhead.

FastEndpoints gives you both: Minimal API performance with endpoint-per-file organization.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. The problem with scaling Minimal APIs
2. What is FastEndpoints (REPR pattern)
3. Performance comparison (vs MVC, vs Minimal APIs)
4. Setting up FastEndpoints
5. Validation, authentication, authorization
6. Testing endpoints

CODE EXAMPLES:
- Basic endpoint
- Request/response DTOs
- FluentValidation integration
- Pre/post processors
- Endpoint testing
-->

## The Minimal APIs Scaling Problem

```csharp
// This gets messy fast...
app.MapGet("/users", GetUsers);
app.MapGet("/users/{id}", GetUser);
app.MapPost("/users", CreateUser);
app.MapPut("/users/{id}", UpdateUser);
app.MapDelete("/users/{id}", DeleteUser);
// x100 more endpoints...
```

## FastEndpoints: REPR Pattern

Request → Endpoint → Response Pattern. One file per endpoint.

```csharp
public class CreateUserEndpoint : Endpoint<CreateUserRequest, CreateUserResponse>
{
    public override void Configure()
    {
        Post("/users");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CreateUserRequest req, CancellationToken ct)
    {
        var user = await _userService.CreateAsync(req.Name, req.Email);
        await SendAsync(new CreateUserResponse(user.Id, user.Name));
    }
}
```

## Performance Comparison

| Framework | Requests/sec | Latency | Memory |
|-----------|-------------|---------|--------|
| Minimal APIs | 257,730 | 1.97ms | Low |
| FastEndpoints | 254,103 | 1.99ms | Low |
| MVC Controller | 224,798 | 2.25ms | Medium |

Virtually identical to Minimal APIs, but with structure!

## Setup

```bash
dotnet add package FastEndpoints
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddFastEndpoints();

var app = builder.Build();
app.UseFastEndpoints();
app.Run();
```

## Validation

```csharp
public class CreateUserValidator : Validator<CreateUserRequest>
{
    public CreateUserValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2);
    }
}
```

## Authentication & Authorization

```csharp
public override void Configure()
{
    Post("/admin/users");
    Roles("Admin");
    Policies("RequireMfa");
}
```

## Testing

```csharp
// TODO: Endpoint testing with WebApplicationFactory
```

## Conclusion

<!-- TODO: FastEndpoints = best of both worlds -->

---

*Using FastEndpoints? Share your experience in the comments!*
