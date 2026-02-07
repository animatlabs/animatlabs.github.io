---
title: "Source Generators in C#: Eliminate Boilerplate, Boost Performance"
excerpt: >-
  "Stop writing repetitive code. Source generators create it at compile time - zero runtime cost, full IntelliSense, completely debuggable."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Source Generators
  - Code Generation
  - Roslyn
  - Performance
  - Metaprogramming
author: animat089
last_modified_at: 2026-02-03
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Problem: Death by Boilerplate

Every .NET developer has been here. You're building a system with 50 DTOs, and for each one you need:

- A mapper to convert between entities and DTOs
- Validation logic
- Equality comparisons
- `ToString()` overrides for debugging
- JSON serialization hints

That's 5 pieces of boilerplate per class. 250 methods that are 90% identical, differing only in property names. You write them by hand, copy-paste errors creep in, and when a property changes, you forget to update the mapper.

**The traditional solutions all have problems:**

| Approach | Problem |
|----------|---------|
| Reflection (AutoMapper) | Runtime overhead, no compile-time safety |
| T4 Templates | Clunky tooling, poor IDE support, runs pre-build |
| Code snippets | Still manual, still error-prone |
| IL Weaving (Fody) | Post-compilation magic, hard to debug |

Source generators offer a different path: **generate the code at compile time, as if you wrote it yourself**.

## What Source Generators Actually Do

Source generators hook into the Roslyn compiler. They:

1. **Inspect** your code via syntax trees and semantic models
2. **Generate** new C# source files
3. **Add them** to your compilation

The generated code is real C# - visible in your IDE, navigable with "Go to Definition", fully debuggable. There's zero runtime overhead for the generation itself.

Here's how they fit into the build pipeline:

```
Your Code → Roslyn Parser → Syntax Trees → SOURCE GENERATORS → Additional Code → Compilation → IL
```

The key difference from reflection: by the time your app runs, the generated code is already compiled. No `Type.GetProperties()`, no `Activator.CreateInstance()`, no JIT compilation of dynamic methods.

## Real-World Example #1: Strongly-Typed Configuration

**The Problem:** You have `appsettings.json` with nested configuration. Every time you access it, you're dealing with magic strings:

{% raw %}
```csharp
// Fragile - typos compile but fail at runtime
var connectionString = configuration["Database:ConnectionString"];
var timeout = int.Parse(configuration["Database:Timeout"] ?? "30");
```

**The Solution:** Generate a strongly-typed wrapper from your settings classes.

First, define your configuration shape:

```csharp
[GenerateConfiguration]
public partial class DatabaseSettings
{
    public string ConnectionString { get; set; } = "";
    public int Timeout { get; set; } = 30;
    public RetrySettings Retry { get; set; } = new();
}

public class RetrySettings
{
    public int MaxAttempts { get; set; } = 3;
    public int DelayMs { get; set; } = 1000;
}
```

The generator creates the binding code:

```csharp
// Generated: DatabaseSettings.g.cs
public partial class DatabaseSettings
{
    public static DatabaseSettings Bind(IConfiguration configuration)
    {
        var section = configuration.GetSection("Database");
        return new DatabaseSettings
        {
            ConnectionString = section["ConnectionString"] ?? "",
            Timeout = int.TryParse(section["Timeout"], out var t) ? t : 30,
            Retry = new RetrySettings
            {
                MaxAttempts = int.TryParse(section.GetSection("Retry")["MaxAttempts"], out var m) ? m : 3,
                DelayMs = int.TryParse(section.GetSection("Retry")["DelayMs"], out var d) ? d : 1000
            }
        };
    }
}
```

Now your code is type-safe:

```csharp
var settings = DatabaseSettings.Bind(configuration);
var timeout = settings.Timeout; // int, not string
var maxRetries = settings.Retry.MaxAttempts; // Compile-time checked
```

Rename a property? The compiler catches every usage. Change a type? Same thing. No more runtime `ConfigurationBindingException` in production.

## Real-World Example #2: API Client Generation

**The Problem:** You're calling an internal API. You write `HttpClient` code for every endpoint:

```csharp
public async Task<User?> GetUserAsync(int id)
{
    var response = await _client.GetAsync($"/api/users/{id}");
    response.EnsureSuccessStatusCode();
    return await response.Content.ReadFromJsonAsync<User>();
}

public async Task<User> CreateUserAsync(CreateUserRequest request)
{
    var response = await _client.PostAsJsonAsync("/api/users", request);
    response.EnsureSuccessStatusCode();
    return await response.Content.ReadFromJsonAsync<User>()!;
}

// 47 more methods...
```

**The Solution:** Define your API as an interface, let a generator implement it:

```csharp
[GenerateApiClient("https://api.example.com")]
public partial interface IUserApi
{
    [Get("/users/{id}")]
    Task<User?> GetUserAsync(int id);
    
    [Post("/users")]
    Task<User> CreateUserAsync([Body] CreateUserRequest request);
    
    [Put("/users/{id}")]
    Task<User> UpdateUserAsync(int id, [Body] UpdateUserRequest request);
    
    [Delete("/users/{id}")]
    Task DeleteUserAsync(int id);
    
    [Get("/users")]
    Task<PagedResult<User>> SearchUsersAsync([Query] string? name, [Query] int page = 1);
}
```

The generator produces a complete implementation:

```csharp
// Generated: UserApi.g.cs
public partial class UserApi : IUserApi
{
    private readonly HttpClient _client;
    
    public UserApi(HttpClient client)
    {
        _client = client;
        _client.BaseAddress = new Uri("https://api.example.com");
    }
    
    public async Task<User?> GetUserAsync(int id)
    {
        var response = await _client.GetAsync($"/users/{id}");
        if (response.StatusCode == HttpStatusCode.NotFound)
            return null;
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<User>();
    }
    
    public async Task<PagedResult<User>> SearchUsersAsync(string? name, int page = 1)
    {
        var queryParams = new List<string>();
        if (name != null) queryParams.Add($"name={Uri.EscapeDataString(name)}");
        queryParams.Add($"page={page}");
        var query = queryParams.Count > 0 ? "?" + string.Join("&", queryParams) : "";
        
        var response = await _client.GetAsync($"/users{query}");
        response.EnsureSuccessStatusCode();
        return await response.Content.ReadFromJsonAsync<PagedResult<User>>()!;
    }
    
    // ... other methods
}
```

This is exactly what [Refit](https://github.com/reactiveui/refit) does - but now you understand the magic behind it.

## Real-World Example #3: Enum Extensions

**The Problem:** Working with enums means lots of `switch` statements and `ToString()` calls:

```csharp
public enum OrderStatus
{
    [Display(Name = "Pending Approval")]
    Pending,
    [Display(Name = "In Progress")]
    Processing,
    Shipped,
    Delivered,
    Cancelled
}

// Every time you need the display name:
public static string GetDisplayName(OrderStatus status)
{
    return status switch
    {
        OrderStatus.Pending => "Pending Approval",
        OrderStatus.Processing => "In Progress",
        _ => status.ToString()
    };
}
```

**The Solution:** Generate extension methods for all enums automatically:

```csharp
// You write:
[GenerateEnumExtensions]
public enum OrderStatus { /* ... */ }

// Generator produces:
public static class OrderStatusExtensions
{
    public static string ToDisplayName(this OrderStatus value) => value switch
    {
        OrderStatus.Pending => "Pending Approval",
        OrderStatus.Processing => "In Progress",
        OrderStatus.Shipped => "Shipped",
        OrderStatus.Delivered => "Delivered",
        OrderStatus.Cancelled => "Cancelled",
        _ => value.ToString()
    };
    
    public static bool IsFinal(this OrderStatus value) => 
        value is OrderStatus.Delivered or OrderStatus.Cancelled;
    
    public static OrderStatus? TryParse(string value) => value switch
    {
        "Pending" or "Pending Approval" => OrderStatus.Pending,
        "Processing" or "In Progress" => OrderStatus.Processing,
        "Shipped" => OrderStatus.Shipped,
        "Delivered" => OrderStatus.Delivered,
        "Cancelled" => OrderStatus.Cancelled,
        _ => null
    };
    
    public static IReadOnlyList<OrderStatus> GetAll() => new[]
    {
        OrderStatus.Pending,
        OrderStatus.Processing,
        OrderStatus.Shipped,
        OrderStatus.Delivered,
        OrderStatus.Cancelled
    };
}
```

No reflection. Compile-time generation. Blazing fast at runtime.

## Real-World Example #4: DTO Mapping Without AutoMapper

**The Problem:** AutoMapper is convenient but:
- Runtime reflection overhead
- Easy to misconfigure
- Errors surface at runtime, not compile time
- "Magic" that's hard to debug

**The Solution:** Generate explicit mappers:

```csharp
[GenerateMapper]
public partial class UserMapper
{
    public partial UserDto ToDto(User entity);
    public partial User ToEntity(UserDto dto);
}
```

The generator inspects both types and creates the mapping:

```csharp
// Generated: UserMapper.g.cs
public partial class UserMapper
{
    public partial UserDto ToDto(User entity)
    {
        if (entity == null) return null!;
        
        return new UserDto
        {
            Id = entity.Id,
            FullName = entity.FirstName + " " + entity.LastName,
            Email = entity.Email,
            CreatedAt = entity.CreatedAt,
            Address = entity.Address == null ? null : new AddressDto
            {
                Street = entity.Address.Street,
                City = entity.Address.City,
                PostalCode = entity.Address.PostalCode
            }
        };
    }
    
    public partial User ToEntity(UserDto dto)
    {
        if (dto == null) return null!;
        
        var nameParts = dto.FullName?.Split(' ', 2) ?? Array.Empty<string>();
        return new User
        {
            Id = dto.Id,
            FirstName = nameParts.Length > 0 ? nameParts[0] : "",
            LastName = nameParts.Length > 1 ? nameParts[1] : "",
            Email = dto.Email,
            CreatedAt = dto.CreatedAt,
            Address = dto.Address == null ? null : new Address
            {
                Street = dto.Address.Street,
                City = dto.Address.City,
                PostalCode = dto.Address.PostalCode
            }
        };
    }
}
```

This is what [Mapperly](https://github.com/riok/mapperly) does - a source-generated alternative to AutoMapper with zero runtime overhead.

## Real-World Example #5: High-Performance Logging

**The Problem:** String interpolation in logging has hidden costs:

```csharp
// This allocates strings even if Debug level is disabled!
_logger.LogDebug($"Processing order {order.Id} for customer {order.CustomerId}");
```

**The Solution:** Use `LoggerMessage` source generator (built into .NET):

```csharp
public static partial class LogMessages
{
    [LoggerMessage(Level = LogLevel.Debug, Message = "Processing order {OrderId} for customer {CustomerId}")]
    public static partial void ProcessingOrder(ILogger logger, int orderId, int customerId);
    
    [LoggerMessage(Level = LogLevel.Warning, Message = "Order {OrderId} exceeded timeout of {TimeoutMs}ms")]
    public static partial void OrderTimeout(ILogger logger, int orderId, int timeoutMs);
    
    [LoggerMessage(Level = LogLevel.Error, Message = "Failed to process order {OrderId}")]
    public static partial void OrderProcessingFailed(ILogger logger, int orderId, Exception ex);
}
```

Generated code checks the log level before doing any work:

```csharp
// Generated - no allocations if Debug is disabled
public static partial void ProcessingOrder(ILogger logger, int orderId, int customerId)
{
    if (logger.IsEnabled(LogLevel.Debug))
    {
        __ProcessingOrderCallback(logger, orderId, customerId, null);
    }
}
```

**Benchmarks show 5-10x performance improvement** for high-volume logging scenarios.

## Building Your Own Generator: Complete Walkthrough

Let's build a generator that creates `ToString()` methods automatically.

### Step 1: Project Structure

```
MyProject/
├── MyProject.Generators/          # netstandard2.0
│   ├── ToStringGenerator.cs
│   └── MyProject.Generators.csproj
├── MyProject.Attributes/          # netstandard2.0 (shared)
│   ├── AutoToStringAttribute.cs
│   └── MyProject.Attributes.csproj
└── MyProject.App/                 # net8.0 (consumer)
    ├── Models/
    └── MyProject.App.csproj
```

### Step 2: The Marker Attribute

```csharp
// MyProject.Attributes/AutoToStringAttribute.cs
namespace MyProject.Attributes;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
public sealed class AutoToStringAttribute : Attribute
{
    public bool IncludePrivate { get; set; } = false;
    public string[]? Exclude { get; set; }
}
```

### Step 3: The Generator

```csharp
// MyProject.Generators/ToStringGenerator.cs
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;
using System.Collections.Immutable;
using System.Text;

namespace MyProject.Generators;

[Generator]
public class ToStringGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // Step 1: Find all types with [AutoToString]
        var typeDeclarations = context.SyntaxProvider
            .ForAttributeWithMetadataName(
                "MyProject.Attributes.AutoToStringAttribute",
                predicate: static (node, _) => node is TypeDeclarationSyntax,
                transform: static (ctx, _) => GetTypeInfo(ctx))
            .Where(static info => info is not null);

        // Step 2: Generate code for each
        context.RegisterSourceOutput(typeDeclarations, 
            static (spc, typeInfo) => GenerateCode(spc, typeInfo!));
    }

    private static TypeInfo? GetTypeInfo(GeneratorAttributeSyntaxContext context)
    {
        if (context.TargetSymbol is not INamedTypeSymbol typeSymbol)
            return null;

        var attribute = context.Attributes.First();
        
        var includePrivate = attribute.NamedArguments
            .FirstOrDefault(a => a.Key == "IncludePrivate").Value.Value as bool? ?? false;
        
        var exclude = attribute.NamedArguments
            .FirstOrDefault(a => a.Key == "Exclude").Value.Values
            .Select(v => v.Value?.ToString())
            .Where(v => v != null)
            .ToArray();

        var properties = typeSymbol.GetMembers()
            .OfType<IPropertySymbol>()
            .Where(p => p.DeclaredAccessibility == Accessibility.Public || includePrivate)
            .Where(p => !exclude!.Contains(p.Name))
            .Where(p => !p.IsStatic && p.GetMethod != null)
            .Select(p => new PropertyInfo(p.Name, p.Type.ToDisplayString()))
            .ToList();

        return new TypeInfo(
            typeSymbol.ContainingNamespace.ToDisplayString(),
            typeSymbol.Name,
            typeSymbol.IsValueType,
            properties);
    }

    private static void GenerateCode(SourceProductionContext context, TypeInfo typeInfo)
    {
        var sb = new StringBuilder();
        
        sb.AppendLine($"namespace {typeInfo.Namespace};");
        sb.AppendLine();
        sb.AppendLine($"partial {(typeInfo.IsStruct ? "struct" : "class")} {typeInfo.Name}");
        sb.AppendLine("{");
        sb.AppendLine("    public override string ToString()");
        sb.AppendLine("    {");
        sb.AppendLine($"        return $\"{typeInfo.Name} {{ \" +");
        
        for (int i = 0; i < typeInfo.Properties.Count; i++)
        {
            var prop = typeInfo.Properties[i];
            var separator = i < typeInfo.Properties.Count - 1 ? ", " : "";
            sb.AppendLine($"            $\"{prop.Name} = {{{prop.Name}}}{separator}\" +");
        }
        
        sb.AppendLine("            \"}\";");
        sb.AppendLine("    }");
        sb.AppendLine("}");

        context.AddSource($"{typeInfo.Name}.ToString.g.cs", 
            SourceText.From(sb.ToString(), Encoding.UTF8));
    }
}

record TypeInfo(string Namespace, string Name, bool IsStruct, List<PropertyInfo> Properties);
record PropertyInfo(string Name, string Type);
```
{% endraw %}

### Step 4: Project References

```xml
<!-- MyProject.Generators.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <EnforceExtendedAnalyzerRules>true</EnforceExtendedAnalyzerRules>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
  
  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.8.0" PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4" PrivateAssets="all" />
  </ItemGroup>
  
  <ItemGroup>
    <ProjectReference Include="..\MyProject.Attributes\MyProject.Attributes.csproj" />
  </ItemGroup>
</Project>

<!-- MyProject.App.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
  </PropertyGroup>
  
  <ItemGroup>
    <ProjectReference Include="..\MyProject.Attributes\MyProject.Attributes.csproj" />
    <ProjectReference Include="..\MyProject.Generators\MyProject.Generators.csproj" 
                      OutputItemType="Analyzer" 
                      ReferenceOutputAssembly="false" />
  </ItemGroup>
</Project>
```

### Step 5: Usage

```csharp
using MyProject.Attributes;

[AutoToString(Exclude = new[] { "Password" })]
public partial class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string Password { get; set; } = ""; // Excluded from ToString
}

// Usage:
var user = new User { Id = 1, Name = "John", Email = "john@example.com" };
Console.WriteLine(user); // Output: User { Id = 1, Name = John, Email = john@example.com }
```

## Debugging and Testing Generators

### View Generated Files

Always enable this in consumer projects:

```xml
<PropertyGroup>
  <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
  <CompilerGeneratedFilesOutputPath>$(BaseIntermediateOutputPath)Generated</CompilerGeneratedFilesOutputPath>
</PropertyGroup>
```

Check `obj/Debug/net8.0/Generated/` for output.

### Attach Debugger During Build

```csharp
public void Initialize(IncrementalGeneratorInitializationContext context)
{
    #if DEBUG
    if (!Debugger.IsAttached)
    {
        Debugger.Launch();
    }
    #endif
    
    // ... rest of initialization
}
```

### Unit Test Generators Properly

```csharp
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Xunit;

public class ToStringGeneratorTests
{
    [Fact]
    public void GeneratesToString_ForSimpleClass()
    {
        var source = """
            using MyProject.Attributes;
            
            namespace TestNamespace;
            
            [AutoToString]
            public partial class Person
            {
                public int Id { get; set; }
                public string Name { get; set; }
            }
            """;

        var (diagnostics, output) = RunGenerator(source);
        
        Assert.Empty(diagnostics);
        Assert.Contains("public override string ToString()", output);
        Assert.Contains("Id = {Id}", output);
        Assert.Contains("Name = {Name}", output);
    }

    [Fact]
    public void ExcludesPropertiesFromToString()
    {
        var source = """
            using MyProject.Attributes;
            
            namespace TestNamespace;
            
            [AutoToString(Exclude = new[] { "Secret" })]
            public partial class Config
            {
                public string Name { get; set; }
                public string Secret { get; set; }
            }
            """;

        var (_, output) = RunGenerator(source);
        
        Assert.Contains("Name = {Name}", output);
        Assert.DoesNotContain("Secret", output);
    }

    private static (ImmutableArray<Diagnostic>, string) RunGenerator(string source)
    {
        var syntaxTree = CSharpSyntaxTree.ParseText(source);
        
        var references = AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => !a.IsDynamic && !string.IsNullOrEmpty(a.Location))
            .Select(a => MetadataReference.CreateFromFile(a.Location))
            .ToList();

        var compilation = CSharpCompilation.Create("TestAssembly",
            new[] { syntaxTree },
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

        var generator = new ToStringGenerator();
        var driver = CSharpGeneratorDriver.Create(generator);
        
        driver.RunGeneratorsAndUpdateCompilation(
            compilation, 
            out var outputCompilation, 
            out var diagnostics);

        var generatedOutput = outputCompilation.SyntaxTrees
            .Where(t => t.FilePath.EndsWith(".g.cs"))
            .Select(t => t.ToString())
            .FirstOrDefault() ?? "";

        return (diagnostics, generatedOutput);
    }
}
```

## Performance: Making Generators Fast

Generators run on every keystroke. A slow generator destroys the IDE experience.

### Do: Use Incremental Generators

```csharp
// GOOD - Only regenerates when inputs change
var provider = context.SyntaxProvider.ForAttributeWithMetadataName(
    "MyAttribute",
    predicate: (node, _) => true,
    transform: (ctx, _) => ProcessNode(ctx));
```

### Do: Filter Early

```csharp
// GOOD - Cheap syntax check before expensive semantic analysis
predicate: static (node, _) => 
    node is ClassDeclarationSyntax { AttributeLists.Count: > 0 }
```

### Don't: Process Everything

```csharp
// BAD - Analyzes entire compilation on every keystroke
context.RegisterSourceOutput(context.CompilationProvider, (ctx, compilation) => {
    foreach (var tree in compilation.SyntaxTrees) // Every file!
    {
        // ...
    }
});
```

### Don't: Allocate Heavily

```csharp
// BAD - New StringBuilder per call
var sb = new StringBuilder();

// BETTER - Use pooled builder or pre-allocated
var sb = StringBuilderPool.Get();
try { /* ... */ }
finally { StringBuilderPool.Return(sb); }
```

## Libraries Using Source Generators

These production libraries prove the pattern works at scale:

| Library | What It Generates |
|---------|-------------------|
| [System.Text.Json](https://docs.microsoft.com/en-us/dotnet/standard/serialization/system-text-json-source-generation) | JSON serializers (built-in) |
| [Mapperly](https://github.com/riok/mapperly) | Object-to-object mappers |
| [Refit](https://github.com/reactiveui/refit) | REST API clients |
| [StronglyTypedId](https://github.com/andrewlock/StronglyTypedId) | Strongly-typed ID wrappers |
| [Dunet](https://github.com/domn1995/dunet) | Discriminated unions |
| [Generator.Equals](https://github.com/diegofrata/Generator.Equals) | Equality members |
| [PropertyChanged.SourceGenerator](https://github.com/canton7/PropertyChanged.SourceGenerator) | INotifyPropertyChanged |

## Common Pitfalls and Solutions

| Pitfall | Symptom | Solution |
|---------|---------|----------|
| Wrong target framework | Generator silently doesn't run | Must be `netstandard2.0` |
| Missing analyzer reference | Generated code not found | Add `OutputItemType="Analyzer"` |
| Stale generated code | Changes not reflected | Restart IDE, clean rebuild |
| Non-deterministic output | Different output each build | Don't use timestamps, random values |
| Slow IDE | Typing lag, high CPU | Use incremental generator, filter early |
| Missing partial keyword | Compiler error on generated code | Consumer class must be `partial` |

## Conclusion

Source generators aren't just a cool compiler trick - they're a practical tool for eliminating the boilerplate that makes codebases harder to maintain. The examples above show real patterns you can implement today:

- **Configuration binding** without magic strings
- **API clients** without repetitive HttpClient code
- **Enum extensions** without reflection
- **DTO mapping** without AutoMapper overhead
- **Logging** without allocation

The investment in building a generator pays off every time it saves someone from writing (and debugging) boilerplate. Start with a simple pattern, test thoroughly, and scale from there.

**Next steps:**
1. Try [Mapperly](https://github.com/riok/mapperly) or [StronglyTypedId](https://github.com/andrewlock/StronglyTypedId) in a project
2. Enable `EmitCompilerGeneratedFiles` to see what they produce
3. Build a simple generator for your own repeated patterns

---

*Building something interesting with source generators? Found a use case I didn't cover? Let me know in the comments!*
