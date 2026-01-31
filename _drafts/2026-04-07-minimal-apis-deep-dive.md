---
title: "Minimal APIs Deep Dive: When Controllers Are Overkill"
excerpt: >-
  "Controllers aren't always the answer. Here's when Minimal APIs shine and how to structure them for production."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Minimal APIs
  - ASP.NET Core
  - REST
  - API Development
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Controllers vs Minimal APIs

When Minimal APIs shipped with .NET 6, the immediate question was: "Should I abandon controllers?" The answer, as with most things in software, is "it depends."

**Controllers excel at:**
- Large APIs with dozens of endpoints (the class structure helps organization)
- Teams already comfortable with the MVC pattern
- Complex APIs requiring extensive use of filters and model binding
- APIs that heavily leverage attribute-based routing and documentation

**Minimal APIs excel at:**
- Microservices with focused, small APIs
- Quick prototypes and proof-of-concepts
- Lambda-style handlers where brevity matters
- Native AOT scenarios (Minimal APIs have better AOT support)
- Teams that prefer explicit over convention-based configuration

I reach for Minimal APIs when building microservices with 5-15 endpoints. The reduced ceremony and explicit routing make the code easier to follow. For larger APIs or when working with teams deeply invested in MVC patterns, controllers still make sense.

## Basic Minimal API Setup

Here's the simplest possible Minimal API - no controllers, no startup class, just handlers:

```csharp
var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

app.MapGet("/api/users", async (IUserService service) =>
{
    var users = await service.GetAllAsync();
    return Results.Ok(users);
});

app.MapGet("/api/users/{id}", async (int id, IUserService service) =>
{
    var user = await service.GetByIdAsync(id);
    return user is null ? Results.NotFound() : Results.Ok(user);
});

app.Run();
```

Notice how dependency injection works directly in the handler parameters. No constructor injection, no field declarations - the framework resolves `IUserService` automatically.

The `Results` class provides typed results that map to HTTP status codes: `Results.Ok()`, `Results.NotFound()`, `Results.BadRequest()`, `Results.Created()`, and more.

## Organizing Minimal APIs for Production

The "everything in Program.cs" approach doesn't scale. For production APIs, I organize endpoints into static extension method classes:

### Endpoint Groups

```csharp
public static class UserEndpoints
{
    public static void MapUserEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/users")
            .WithTags("Users")
            .RequireAuthorization();
        
        group.MapGet("/", GetAll);
        group.MapGet("/{id}", GetById);
        group.MapPost("/", Create);
        group.MapPut("/{id}", Update);
        group.MapDelete("/{id}", Delete);
    }
    
    private static async Task<IResult> GetAll(IUserService service)
    {
        return Results.Ok(await service.GetAllAsync());
    }
    
    private static async Task<IResult> GetById(int id, IUserService service)
    {
        var user = await service.GetByIdAsync(id);
        return user is null ? Results.NotFound() : Results.Ok(user);
    }
    
    private static async Task<IResult> Create(CreateUserRequest request, IUserService service)
    {
        var user = await service.CreateAsync(request);
        return Results.Created($"/api/users/{user.Id}", user);
    }
    
    private static async Task<IResult> Update(int id, UpdateUserRequest request, IUserService service)
    {
        var user = await service.UpdateAsync(id, request);
        return user is null ? Results.NotFound() : Results.Ok(user);
    }
    
    private static async Task<IResult> Delete(int id, IUserService service)
    {
        var deleted = await service.DeleteAsync(id);
        return deleted ? Results.NoContent() : Results.NotFound();
    }
}
```

The `MapGroup` method creates a route group with shared configuration. All routes in the group inherit the base path (`/api/users`), OpenAPI tags, and authorization requirements.

In `Program.cs`, registration becomes clean:

```csharp
var builder = WebApplication.CreateBuilder(args);
// ... service registration

var app = builder.Build();

app.MapUserEndpoints();
app.MapOrderEndpoints();
app.MapProductEndpoints();

app.Run();
```

### Folder Structure

For larger projects, I organize endpoint files to mirror the API structure:

```
/Endpoints
  /Users
    UserEndpoints.cs
    CreateUserRequest.cs
    UpdateUserRequest.cs
  /Orders
    OrderEndpoints.cs
    CreateOrderRequest.cs
  /Products
    ProductEndpoints.cs
```

## Validation

Minimal APIs don't have built-in model validation like controllers do with `[ApiController]`. You need to add validation explicitly. FluentValidation integrates cleanly:

```csharp
// Install: FluentValidation.DependencyInjectionExtensions

public class CreateUserRequestValidator : AbstractValidator<CreateUserRequest>
{
    public CreateUserRequestValidator()
    {
        RuleFor(x => x.Email)
            .NotEmpty()
            .EmailAddress();
        
        RuleFor(x => x.Name)
            .NotEmpty()
            .MaximumLength(100);
    }
}

// Register validators
builder.Services.AddValidatorsFromAssemblyContaining<CreateUserRequestValidator>();
```

Then create a validation filter:

```csharp
public static class ValidationExtensions
{
    public static RouteHandlerBuilder WithValidation<T>(this RouteHandlerBuilder builder)
    {
        return builder.AddEndpointFilter(async (context, next) =>
        {
            var validator = context.HttpContext.RequestServices
                .GetService<IValidator<T>>();
            
            if (validator is null)
                return await next(context);
            
            var argument = context.Arguments
                .OfType<T>()
                .FirstOrDefault();
            
            if (argument is null)
                return await next(context);
            
            var result = await validator.ValidateAsync(argument);
            
            if (!result.IsValid)
            {
                return Results.ValidationProblem(result.ToDictionary());
            }
            
            return await next(context);
        });
    }
}
```

Apply it to endpoints:

```csharp
group.MapPost("/", Create)
    .WithValidation<CreateUserRequest>();
```

## OpenAPI / Swagger Integration

Minimal APIs integrate with OpenAPI through `Microsoft.AspNetCore.OpenApi`:

```csharp
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

Enhance documentation with extension methods:

```csharp
group.MapGet("/{id}", GetById)
    .WithName("GetUserById")
    .WithDescription("Retrieves a user by their unique identifier")
    .Produces<User>(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);
```

## Error Handling

Centralized error handling works through middleware or exception filters:

```csharp
app.UseExceptionHandler(errorApp =>
{
    errorApp.Run(async context =>
    {
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/problem+json";
        
        var error = context.Features.Get<IExceptionHandlerFeature>();
        
        var problemDetails = new ProblemDetails
        {
            Status = 500,
            Title = "An error occurred",
            Detail = app.Environment.IsDevelopment() 
                ? error?.Error.Message 
                : "An unexpected error occurred"
        };
        
        await context.Response.WriteAsJsonAsync(problemDetails);
    });
});
```

For typed results that can represent errors, consider the `Results<T1, T2>` pattern:

```csharp
private static async Task<Results<Ok<User>, NotFound, BadRequest<ValidationProblemDetails>>> 
    GetById(int id, IUserService service)
{
    if (id <= 0)
        return TypedResults.BadRequest(new ValidationProblemDetails());
    
    var user = await service.GetByIdAsync(id);
    
    return user is null 
        ? TypedResults.NotFound() 
        : TypedResults.Ok(user);
}
```

This provides compile-time safety for your return types and generates accurate OpenAPI documentation.

## My Recommendations

After using Minimal APIs in production, here's my decision framework:

| Scenario | My Choice | Why |
|----------|-----------|-----|
| New microservice (< 20 endpoints) | Minimal APIs | Less ceremony, explicit routing |
| Large API (50+ endpoints) | Controllers | Better organization with classes |
| Existing MVC codebase | Controllers | Consistency matters |
| Native AOT deployment | Minimal APIs | Better trimming support |
| Team new to .NET | Controllers | More learning resources available |
| Quick prototype | Minimal APIs | Faster to set up |

**Key practices I follow:**
1. Always organize endpoints into static classes - never leave everything in Program.cs
2. Use `MapGroup` for shared route configuration and authorization
3. Add validation explicitly with FluentValidation
4. Document endpoints properly for OpenAPI generation
5. Use typed results (`Results<T1, T2>`) for complex return scenarios

## Conclusion

Minimal APIs aren't a replacement for controllers - they're an alternative that's better suited for certain scenarios. For microservices, prototypes, and smaller APIs, they reduce boilerplate and make the code more explicit.

The key to success with Minimal APIs is organization. Once you move beyond the basic "handlers in Program.cs" examples and adopt proper grouping, validation, and error handling patterns, Minimal APIs become a viable choice for production workloads.

Start small, keep your endpoints organized, and let the framework do the heavy lifting.

---

*Have questions about structuring Minimal APIs? Let me know in the comments!*
