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
last_modified_at: 2026-05-18
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Picture `Program.cs` after a few sprints. You open it and scroll. MapGet, MapPost, MapPut, another MapGet. Half the file is delegate wiring. The other half is `using` statements and shared helpers nobody agreed on.

That is the Minimal APIs scaling problem in one file. It starts cute. Ten routes feel fine. At a hundred, you are hunting for the handler that touches `OrderId` while your IDE search hits five partial matches.

Minimal APIs stay fast at runtime. The pain is human. You still need a place to put validation, auth, and tests. When everything routes through one startup file, that place becomes "wherever we put it last week."

Teams fight this with partial classes, extension methods, or a `Map*` method per area. Those tricks work until someone adds a tenth import and three people touch the same merge conflict. The runtime cost stays low. The cognitive cost does not.

## REPR: one endpoint, one file

FastEndpoints sticks to the **Request–Endpoint–Response** idea. You name the types, you name the class, and the framework maps HTTP to a single `HandleAsync` method.

Each endpoint class owns its route, verbs, and authorization in `Configure()`. Request and response shapes sit next to the handler or in a shared folder if you prefer. Validators are separate classes that plug in automatically if they inherit from `Validator<T>`.

You are not buying back full MVC. No views, no `ControllerBase` ceremony, no action filters unless you want them. You get folders that match your API surface and code that reads top to bottom.

At startup, FastEndpoints scans assemblies for endpoint types and wires routes. You do not maintain a central list of `MapGet` calls unless you opt into manual registration for odd cases. New file under `Endpoints`, new route shows up. Delete the file, the route disappears. That beats grep-driven development.

## Three lines that matter

The host wiring is thin. Add the service, build, use the middleware.

```csharp
builder.Services.AddFastEndpoints();

var app = builder.Build();
app.UseFastEndpoints();
```

The playground project references `FastEndpoints` 5.33.0 on `net8.0`. FluentValidation comes along for validators like `CreateUserValidator` without you hand-wiring a pipeline for 400 responses.

`Program.cs` really is almost empty:

```csharp
using FastEndpoints;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddFastEndpoints();

var app = builder.Build();

app.UseFastEndpoints();

app.Run();
```

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/FastEndpoints){: .btn .btn--primary}

## Create user: validation without boilerplate

`CreateUserEndpoint` takes a request DTO, returns a response DTO, and registers `Post("/api/users")`. FluentValidation lives in `CreateUserValidator`. If the request fails validation, FastEndpoints returns a 400 with errors before `HandleAsync` runs.

```csharp
using FastEndpoints;
using FluentValidation;

namespace AnimatLabs.FastEndpoints.Endpoints;

public class CreateUserRequest
{
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
}

public class CreateUserResponse
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
}

public class CreateUserValidator : Validator<CreateUserRequest>
{
    public CreateUserValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MinimumLength(2);
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
    }
}

public class CreateUserEndpoint : Endpoint<CreateUserRequest, CreateUserResponse>
{
    public override void Configure()
    {
        Post("/api/users");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CreateUserRequest req, CancellationToken ct)
    {
        var id = Random.Shared.Next(1000, 9999);
        await SendAsync(new CreateUserResponse
        {
            Id = id,
            Name = req.Name,
            Email = req.Email
        });
    }
}
```

The handler is intentionally boring. In a real service you would call a repository or mediator. The point is the shape: request in, response out, validation declared once.

## Read: list users

`GetUsersEndpoint` uses `EndpointWithoutRequest` because GET does not need a body. It returns a list of `CreateUserResponse` here; in a larger app you might introduce a dedicated `UserSummary` type.

```csharp
using FastEndpoints;

namespace AnimatLabs.FastEndpoints.Endpoints;

public class GetUsersEndpoint : EndpointWithoutRequest<List<CreateUserResponse>>
{
    public override void Configure()
    {
        Get("/api/users");
        AllowAnonymous();
    }

    public override async Task HandleAsync(CancellationToken ct)
    {
        var users = new List<CreateUserResponse>
        {
            new() { Id = 1, Name = "Alice", Email = "alice@example.com" },
            new() { Id = 2, Name = "Bob", Email = "bob@example.com" }
        };
        await SendAsync(users);
    }
}
```

For a single user, the route model carries `Id` from the path. Same response type, different `Configure()` line.

```csharp
using FastEndpoints;

namespace AnimatLabs.FastEndpoints.Endpoints;

public class GetUserRequest
{
    public int Id { get; set; }
}

public class GetUserEndpoint : Endpoint<GetUserRequest, CreateUserResponse>
{
    public override void Configure()
    {
        Get("/api/users/{Id}");
        AllowAnonymous();
    }

    public override async Task HandleAsync(GetUserRequest req, CancellationToken ct)
    {
        await SendAsync(new CreateUserResponse
        {
            Id = req.Id,
            Name = $"User {req.Id}",
            Email = $"user{req.Id}@example.com"
        });
    }
}
```

## Authentication and authorization in `Configure()`

The playground keeps these routes anonymous so you can hit them with curl. Production code usually does the opposite.

You wire ASP.NET Core auth the normal way (`AddAuthentication`, JWT bearer, cookies, whatever you already use). On each endpoint, `Configure()` declares who may call it:

```csharp
public override void Configure()
{
    Post("/api/admin/users");
    Roles("Admin");
    Policies("RequireMfa");
}
```

`Roles` and `Policies` map to the claims and policy names you registered in `Program.cs`. You can mix `AllowAnonymous()` on public endpoints and role checks on internal ones without a separate attribute soup on each action method.

If you outgrow inline policies, FastEndpoints still plays nicely with the same `IAuthorizationService` and `HttpContext.User` you already know.

## Performance: not the reason to say no

People worry that an abstraction layer means slower requests. Benchmarks that compare raw Minimal APIs, FastEndpoints, and MVC usually land in the same ballpark for throughput. Allocation and pipeline depth matter more than the class name on your endpoint.

| Framework | Requests/sec (approx.) | Latency (approx.) | Memory |
|-----------|-------------------------|-------------------|--------|
| Minimal APIs | 257,730 | 1.97 ms | Low |
| FastEndpoints | 254,103 | 1.99 ms | Low |
| MVC Controller | 224,798 | 2.25 ms | Medium |

Treat numbers as directional. Your JSON serializers, database, and network will dominate before the difference between Minimal APIs and FastEndpoints shows up in a real trace. I reach for FastEndpoints when organization and testability matter, not when I am shaving a microsecond.

If you profile and see hot paths, fix data access and serialization first. Swapping endpoint frameworks to chase a few thousand requests per second on paper is usually the wrong lever.

## Testing endpoints

Integration tests look like any other ASP.NET Core app. Spin up the app with `WebApplicationFactory<Program>`, call `CreateClient()`, and assert status codes and bodies. FastEndpoints does not need a special test host beyond what Minimal APIs already use.

```csharp
public class UsersTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly HttpClient _client;

    public UsersTests(WebApplicationFactory<Program> factory) =>
        _client = factory.CreateClient();

    [Fact]
    public async Task Get_users_returns_ok()
    {
        var res = await _client.GetAsync("/api/users");
        res.EnsureSuccessStatusCode();
    }
}
```

The playground repo does not ship a test project yet. Drop something like the above into an xUnit test assembly that references your web project when you are ready.

You can also unit test validators in isolation because they are plain FluentValidation classes. That split saves time when you only care about bad input and do not want to boot the full pipeline.

## Run the demo

From the project folder:

```bash
dotnet run
```

Then try:

```bash
curl -s http://localhost:5000/api/users
curl -s -X POST http://localhost:5000/api/users ^
  -H "Content-Type: application/json" ^
  -d "{\"name\":\"Ada\",\"email\":\"ada@example.com\"}"
```

Adjust the port if Kestrel picks something else from `launchSettings.json`. On Windows you can use `Invoke-RestMethod` instead of curl if you prefer native PowerShell.

Hit `GET /api/users/42` to exercise the path-bound endpoint. You should see JSON with `Id` 42 and generated name and email strings from the demo handler.

## When FastEndpoints fits, and when Minimal APIs stay put

**FastEndpoints** helps when you have many routes, multiple contributors, and you want one file per use case without resurrecting MVC controllers. Validation, auth, and response typing stay next to the route definition. Onboarding is quick if the team already knows Minimal APIs and FluentValidation.

Code review gets easier when the diff is one endpoint file instead of a chunk of `Program.cs` plus whatever static helper absorbed the logic last time.

**Stick with plain Minimal APIs** when the API is tiny, internal, or you are prototyping in a single file on purpose. If `Program.cs` stays under a screenful and you do not care about folder structure yet, extra types buy you little. Glue code in Azure Functions, GitHub Actions custom steps, or a one-off admin API often never needs the ceremony.

**MVC** still wins when you are already deep in controller filters, areas, and conventions that FastEndpoints would fight. Migration cost matters. Some teams like the attribute model and Razor in the same assembly. That is a valid reason to stay put.

I still use Minimal APIs for scripts and spikes. For anything I expect to live in production past the first release, I prefer the REPR layout and the way FastEndpoints keeps cross-cutting rules visible in `Configure()`.

Greenfield services with clear bounded contexts are the sweet spot. Brownfield apps with a thousand controller tests might need a slower, slice-by-slice move instead of a big bang.

What is your cutoff: how many endpoints before `Program.cs` starts to feel wrong?

<!--
LinkedIn promo (paste when sharing):
FastEndpoints gave me Minimal API speed with files I can actually navigate. Wrote up REPR, validation, auth in Configure(), and why I still reach for plain Minimal APIs for tiny services. Link in first comment.
-->
