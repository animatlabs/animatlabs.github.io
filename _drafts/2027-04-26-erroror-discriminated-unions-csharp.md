---
title: "ErrorOr, OneOf, and the Result Pattern: Discriminated Unions in C#"
excerpt: >-
  "Three libraries, one goal: stop throwing exceptions for expected failures. Here's how ErrorOr, OneOf, and Ardalis.Result compare -- and which one fits your project."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - ErrorOr
  - OneOf
  - Result Pattern
  - Discriminated Unions
  - Error Handling
  - Functional Programming
author: animat089
last_modified_at: 2027-04-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- Recap: why exceptions for expected failures are problematic (link to Result pattern post)
- The discriminated union concept (F#, Rust, TypeScript -- C# is catching up)
- Library comparison:
  - ErrorOr (2k stars): fluent API, built-in error types, minimal
  - OneOf (4k stars): general-purpose DU, exhaustive matching
  - Ardalis.Result (popular in Clean Architecture): enterprise-friendly, ASP.NET integration
- Side-by-side code examples for the same use case
- Integration with ASP.NET Core (controller returns, middleware)
- Integration with MediatR/Wolverine handlers
- Performance comparison
- The path to native C# discriminated unions (proposal status)
- Decision framework: which library for which project
- Migration from exception-based to result-based error handling

UNIQUE ANGLE: Sequel to the Result pattern post (2024-03-23). 
Practical comparison with real code. Decision framework instead of "just use X."

LIBRARIES:
- ErrorOr (NuGet, 2k GitHub stars)
- OneOf (NuGet, 4k GitHub stars)
- Ardalis.Result (NuGet)

LOCAL DEV: No cloud services needed.
-->

## Previously on AnimatLabs...

In [Better Result Handling with Result](/technical/.net/.net-core/better-result-handling-with-result-object/), we explored why exceptions shouldn't control normal program flow and how the Result pattern provides a cleaner alternative. Since then, the .NET ecosystem has evolved -- three libraries now compete for the "best way to handle expected failures" crown.

Let's compare them honestly.

## The Core Problem (Quick Recap)

```csharp
// The anti-pattern: exceptions for expected failures
public User GetUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    if (user == null)
        throw new NotFoundException($"User with email {email} not found");
    
    if (!user.IsActive)
        throw new ValidationException("User account is deactivated");
    
    return user;
}

// Caller must guess which exceptions to catch
try
{
    var user = GetUser(email);
}
catch (NotFoundException) { /* handle */ }
catch (ValidationException) { /* handle */ }
// What else could throw? Who knows!
```

The Result pattern makes the possible outcomes explicit in the return type.

## The Contenders

### ErrorOr (2k GitHub Stars)

Minimal, fluent, purpose-built for the "success or error" pattern.

```csharp
// dotnet add package ErrorOr

using ErrorOr;

public ErrorOr<User> GetUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    if (user == null)
        return Error.NotFound(
            code: "User.NotFound",
            description: $"User with email '{email}' not found");

    if (!user.IsActive)
        return Error.Validation(
            code: "User.Inactive",
            description: "User account is deactivated");

    return user; // Implicit conversion to ErrorOr<User>
}

// Usage: fluent matching
var result = GetUser(email);

var response = result.Match(
    user => Ok(new UserResponse(user.Id, user.Name)),
    errors => Problem(errors)
);

// Or use if/else
if (result.IsError)
{
    var firstError = result.FirstError;
    return firstError.Type switch
    {
        ErrorType.NotFound => NotFound(firstError.Description),
        ErrorType.Validation => BadRequest(firstError.Description),
        _ => StatusCode(500, firstError.Description)
    };
}

var userValue = result.Value;
```

### OneOf (4k GitHub Stars)

General-purpose discriminated unions -- not limited to success/error.

```csharp
// dotnet add package OneOf

using OneOf;

// Define any combination of types
public OneOf<User, NotFound, ValidationError> GetUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    if (user == null)
        return new NotFound($"User with email '{email}' not found");

    if (!user.IsActive)
        return new ValidationError("User account is deactivated");

    return user;
}

// Usage: exhaustive matching (compiler enforces all cases)
var response = result.Match(
    user => Ok(new UserResponse(user.Id, user.Name)),
    notFound => NotFound(notFound.Message),
    validationError => BadRequest(validationError.Message)
);

// Custom result types
public record NotFound(string Message);
public record ValidationError(string Message);
```

### Ardalis.Result

Enterprise-friendly with built-in ASP.NET Core integration.

```csharp
// dotnet add package Ardalis.Result
// dotnet add package Ardalis.Result.AspNetCore

using Ardalis.Result;

public Result<User> GetUser(string email)
{
    var user = _db.Users.FirstOrDefault(u => u.Email == email);
    if (user == null)
        return Result<User>.NotFound($"User with email '{email}' not found");

    if (!user.IsActive)
        return Result<User>.Invalid(
            new ValidationError("User account is deactivated"));

    return Result<User>.Success(user);
}

// Usage: status-based switching
var result = GetUser(email);

return result.Status switch
{
    ResultStatus.Ok => Ok(result.Value),
    ResultStatus.NotFound => NotFound(result.Errors),
    ResultStatus.Invalid => BadRequest(result.ValidationErrors),
    _ => StatusCode(500)
};
```

## Side-by-Side Comparison

### The Same Use Case in All Three

```csharp
// Scenario: Create a user with validation

// === ErrorOr ===
public ErrorOr<User> CreateUser(CreateUserRequest request)
{
    var errors = new List<Error>();

    if (string.IsNullOrWhiteSpace(request.Email))
        errors.Add(Error.Validation("Email.Required", "Email is required"));

    if (string.IsNullOrWhiteSpace(request.Name))
        errors.Add(Error.Validation("Name.Required", "Name is required"));

    if (errors.Count > 0)
        return errors;

    if (_db.Users.Any(u => u.Email == request.Email))
        return Error.Conflict("Email.Duplicate", "Email already registered");

    var user = new User(request.Name, request.Email);
    _db.Users.Add(user);
    return user;
}

// === OneOf ===
public OneOf<User, ValidationErrors, ConflictError> CreateUser(CreateUserRequest request)
{
    var errors = new List<string>();

    if (string.IsNullOrWhiteSpace(request.Email))
        errors.Add("Email is required");

    if (string.IsNullOrWhiteSpace(request.Name))
        errors.Add("Name is required");

    if (errors.Count > 0)
        return new ValidationErrors(errors);

    if (_db.Users.Any(u => u.Email == request.Email))
        return new ConflictError("Email already registered");

    var user = new User(request.Name, request.Email);
    _db.Users.Add(user);
    return user;
}

// === Ardalis.Result ===
public Result<User> CreateUser(CreateUserRequest request)
{
    var errors = new List<ValidationError>();

    if (string.IsNullOrWhiteSpace(request.Email))
        errors.Add(new ValidationError("Email is required"));

    if (string.IsNullOrWhiteSpace(request.Name))
        errors.Add(new ValidationError("Name is required"));

    if (errors.Count > 0)
        return Result<User>.Invalid(errors);

    if (_db.Users.Any(u => u.Email == request.Email))
        return Result<User>.Conflict("Email already registered");

    var user = new User(request.Name, request.Email);
    _db.Users.Add(user);
    return Result<User>.Success(user);
}
```

## ASP.NET Core Integration

### ErrorOr with Minimal APIs

```csharp
app.MapPost("/users", (CreateUserRequest request, UserService service) =>
{
    return service.CreateUser(request).Match(
        user => Results.Created($"/users/{user.Id}", user),
        errors => errors.First().Type switch
        {
            ErrorType.Validation => Results.BadRequest(errors.Select(e => e.Description)),
            ErrorType.Conflict => Results.Conflict(errors.First().Description),
            _ => Results.Problem()
        });
});
```

### Ardalis.Result with Controllers

```csharp
// Ardalis.Result.AspNetCore provides TranslateResultToActionResult
[HttpPost]
[TranslateResultToActionResult]
public Result<UserDto> CreateUser(CreateUserRequest request)
{
    // Just return the Result -- the attribute handles HTTP status codes
    return _service.CreateUser(request);
}
```

## Integration with MediatR / Wolverine

```csharp
// ErrorOr works naturally with CQRS handlers
public record CreateUserCommand(string Name, string Email) : IRequest<ErrorOr<User>>;

public class CreateUserHandler : IRequestHandler<CreateUserCommand, ErrorOr<User>>
{
    public async Task<ErrorOr<User>> Handle(
        CreateUserCommand command, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(command.Email))
            return Error.Validation("Email.Required", "Email is required");

        var user = new User(command.Name, command.Email);
        await _db.Users.AddAsync(user, ct);
        await _db.SaveChangesAsync(ct);
        return user;
    }
}
```

## The Feature Comparison Table

| Feature | ErrorOr | OneOf | Ardalis.Result |
|---------|---------|-------|----------------|
| GitHub Stars | ~2,000 | ~4,000 | ~3,500 |
| Purpose | Error handling | General DU | Error handling |
| Built-in error types | Yes (7 types) | No (define your own) | Yes (6 statuses) |
| Exhaustive matching | No | **Yes** | No |
| ASP.NET integration | Manual | Manual | **Built-in** |
| Fluent API | **Yes** | Yes | Moderate |
| Multiple errors | **Yes** | Custom | **Yes** |
| Learning curve | Low | Medium | Low |
| AOT compatible | Yes | Yes | Yes |
| Type safety | Good | **Best** | Good |

## Decision Framework

**Choose ErrorOr when:**
- You want the simplest possible Result pattern
- Built-in error types (NotFound, Validation, Conflict, etc.) cover your needs
- You like fluent APIs and implicit conversions
- Your team is new to the pattern

**Choose OneOf when:**
- You need general-purpose discriminated unions (not just success/error)
- Exhaustive matching at compile time is critical
- You have complex return types beyond simple error cases
- You're coming from F#, Rust, or TypeScript

**Choose Ardalis.Result when:**
- You're using Clean Architecture (it was built for this)
- You want built-in ASP.NET Core attribute-based integration
- You prefer convention over configuration
- You're in an enterprise environment

## The Future: Native Discriminated Unions in C#

The C# language team has an active proposal for native discriminated unions. When it lands (likely C# 15 or 16), it could look like:

```csharp
// Proposed syntax (not final)
enum class Result<T>
{
    Success(T Value),
    NotFound(string Message),
    ValidationError(List<string> Errors),
    Conflict(string Message)
}

// Pattern matching would be exhaustive
var response = result switch
{
    Result<User>.Success(var user) => Ok(user),
    Result<User>.NotFound(var msg) => NotFound(msg),
    Result<User>.ValidationError(var errors) => BadRequest(errors),
    Result<User>.Conflict(var msg) => Conflict(msg)
};
```

Until then, ErrorOr, OneOf, and Ardalis.Result are the best options available.

## Conclusion

All three libraries solve the same fundamental problem: making error handling explicit instead of relying on exceptions. The "right" choice depends on your project's architecture, team experience, and how general-purpose you need the discriminated union to be.

My personal pick for most projects in 2027? **ErrorOr** -- it's the simplest, most focused, and the fluent API makes code read beautifully. But I reach for **OneOf** when I need true exhaustive matching, and **Ardalis.Result** when I'm working in Clean Architecture.

---

*Which result pattern library do you use? Made the switch from exceptions? Share your experience below!*
