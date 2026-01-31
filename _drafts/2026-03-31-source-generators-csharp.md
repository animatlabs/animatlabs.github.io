---
title: "Source Generators: Compile-Time Code Generation in C#"
excerpt: >-
  "Generate boilerplate at compile time, not runtime. Here's how Source Generators work and when to use them."
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
  - Compile Time
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## What Are Source Generators?

Source Generators are a C# compiler feature that lets you inspect user code and generate additional source files during compilation. Unlike reflection-based code generation that happens at runtime, source generators produce actual C# files that become part of your compilation.

The key insight: the generated code is visible, debuggable, and has zero runtime overhead for the generation itself. It's as if you wrote the code by hand - because by the time your application runs, you essentially did.

Source generators are part of the Roslyn compiler platform. They plug into the compilation pipeline, analyze your code through the syntax tree and semantic model, and emit new source files that get compiled alongside your original code.

**Common use cases in the .NET ecosystem:**
- `System.Text.Json` - Generates serialization code for JSON
- `RegexGenerator` - Compiles regex patterns at build time
- `LoggerMessage` - Generates high-performance logging methods
- `Microsoft.Extensions.Options` - Generates validation code

## When to Use Source Generators

Source generators shine when you need to eliminate boilerplate that follows predictable patterns. They're not a good fit for everything.

| Use Case | Good Fit? | Why |
|----------|-----------|-----|
| DTO mapping | Yes | Predictable pattern, compile-time safety |
| Serialization | Yes | No runtime reflection overhead |
| DI service registration | Yes | Auto-discover and register services |
| Logging methods | Yes | High-performance, structured logging |
| Interface implementations | Yes | Generate implementations from interfaces |
| Complex runtime logic | No | Logic should stay in regular code |
| User-configurable behavior | No | Can't change after compilation |

**My rule of thumb:** If you're writing the same boilerplate code repeatedly and the pattern is mechanical (doesn't require human judgment), it's a candidate for source generation.

## Creating Your First Generator

Let's build a practical source generator step by step.

### Project Setup

Source generators must target `netstandard2.0` for compatibility with both .NET Framework and .NET Core builds:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>netstandard2.0</TargetFramework>
    <EnforceExtendedAnalyzerRules>true</EnforceExtendedAnalyzerRules>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
  
  <ItemGroup>
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4" PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.8.0" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

The `EnforceExtendedAnalyzerRules` property enables stricter validation for analyzer/generator code.

### Basic Generator

Here's the simplest possible generator - it adds a static class to every compilation:

```csharp
using Microsoft.CodeAnalysis;

[Generator]
public class HelloWorldGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        context.RegisterPostInitializationOutput(ctx =>
        {
            ctx.AddSource("HelloWorld.g.cs", """
                namespace Generated;
                
                public static class HelloWorld
                {
                    public static string SayHello() => "Hello from Source Generator!";
                }
                """);
        });
    }
}
```

To use this generator, reference it from a consumer project:

```xml
<ItemGroup>
  <ProjectReference Include="..\MyGenerator\MyGenerator.csproj" 
                    OutputItemType="Analyzer" 
                    ReferenceOutputAssembly="false" />
</ItemGroup>
```

Now `Generated.HelloWorld.SayHello()` is available in your code - generated at compile time.

## Practical Example: Auto-Register Services

Let's build something useful: a generator that automatically registers services with dependency injection based on an attribute.

First, define the marker attribute (in a shared project):

```csharp
[AttributeUsage(AttributeTargets.Class)]
public class AutoRegisterAttribute : Attribute
{
    public ServiceLifetime Lifetime { get; }
    
    public AutoRegisterAttribute(ServiceLifetime lifetime = ServiceLifetime.Scoped)
    {
        Lifetime = lifetime;
    }
}

public enum ServiceLifetime { Singleton, Scoped, Transient }
```

Now the generator that finds these attributes and generates registration code:

```csharp
[Generator]
public class ServiceRegistrationGenerator : IIncrementalGenerator
{
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // Find all classes with [AutoRegister]
        var classDeclarations = context.SyntaxProvider
            .CreateSyntaxProvider(
                predicate: static (node, _) => node is ClassDeclarationSyntax { AttributeLists.Count: > 0 },
                transform: static (ctx, _) => GetServiceInfo(ctx))
            .Where(static info => info is not null);

        // Combine with compilation
        var compilationAndClasses = context.CompilationProvider.Combine(classDeclarations.Collect());

        // Generate the registration extension method
        context.RegisterSourceOutput(compilationAndClasses, 
            static (spc, source) => Execute(source.Left, source.Right!, spc));
    }

    private static ServiceInfo? GetServiceInfo(GeneratorSyntaxContext context)
    {
        var classDeclaration = (ClassDeclarationSyntax)context.Node;
        var symbol = context.SemanticModel.GetDeclaredSymbol(classDeclaration);
        
        if (symbol is null) return null;
        
        var attribute = symbol.GetAttributes()
            .FirstOrDefault(a => a.AttributeClass?.Name == "AutoRegisterAttribute");
        
        if (attribute is null) return null;
        
        var lifetime = attribute.ConstructorArguments.Length > 0
            ? (int)attribute.ConstructorArguments[0].Value!
            : 1; // Default to Scoped
        
        return new ServiceInfo(
            symbol.ContainingNamespace.ToDisplayString(),
            symbol.Name,
            lifetime);
    }

    private static void Execute(Compilation compilation, 
        ImmutableArray<ServiceInfo?> services, 
        SourceProductionContext context)
    {
        var validServices = services.Where(s => s is not null).Cast<ServiceInfo>().ToList();
        
        if (validServices.Count == 0) return;
        
        var lifetimeMethods = new[] { "AddSingleton", "AddScoped", "AddTransient" };
        
        var sb = new StringBuilder();
        sb.AppendLine("using Microsoft.Extensions.DependencyInjection;");
        sb.AppendLine();
        sb.AppendLine("namespace Generated;");
        sb.AppendLine();
        sb.AppendLine("public static class ServiceCollectionExtensions");
        sb.AppendLine("{");
        sb.AppendLine("    public static IServiceCollection AddAutoRegisteredServices(this IServiceCollection services)");
        sb.AppendLine("    {");
        
        foreach (var service in validServices)
        {
            var method = lifetimeMethods[service.Lifetime];
            sb.AppendLine($"        services.{method}<{service.Namespace}.{service.ClassName}>();");
        }
        
        sb.AppendLine("        return services;");
        sb.AppendLine("    }");
        sb.AppendLine("}");
        
        context.AddSource("ServiceCollectionExtensions.g.cs", sb.ToString());
    }
}

record ServiceInfo(string Namespace, string ClassName, int Lifetime);
```

Usage in your application:

```csharp
[AutoRegister(ServiceLifetime.Singleton)]
public class CacheService : ICacheService { }

[AutoRegister(ServiceLifetime.Scoped)]
public class UserService : IUserService { }

// In Program.cs
builder.Services.AddAutoRegisteredServices();
```

The generator finds all `[AutoRegister]` classes and generates the DI registration code. No reflection, no manual registration, no runtime discovery.

## Debugging Source Generators

Debugging generators is notoriously tricky because they run during compilation, not at runtime. Here's my workflow:

### 1. View Generated Files

Enable generated file output in your consumer project:

```xml
<PropertyGroup>
  <EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>
  <CompilerGeneratedFilesOutputPath>$(BaseIntermediateOutputPath)Generated</CompilerGeneratedFilesOutputPath>
</PropertyGroup>
```

Generated files appear in `obj/Generated/` and are navigable in your IDE.

### 2. Attach Debugger

Add this to your generator's `Initialize` method:

```csharp
#if DEBUG
if (!System.Diagnostics.Debugger.IsAttached)
{
    System.Diagnostics.Debugger.Launch();
}
#endif
```

When you build the consumer project, you'll be prompted to attach a debugger to the compiler process.

### 3. Unit Test Your Generator

Test generators by driving the Roslyn compilation programmatically:

```csharp
[Fact]
public void Generator_CreatesExpectedOutput()
{
    var source = """
        [AutoRegister]
        public class TestService { }
        """;
    
    var generator = new ServiceRegistrationGenerator();
    var driver = CSharpGeneratorDriver.Create(generator);
    
    var compilation = CSharpCompilation.Create("test",
        new[] { CSharpSyntaxTree.ParseText(source) },
        new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });
    
    driver.RunGeneratorsAndUpdateCompilation(compilation, out var outputCompilation, out var diagnostics);
    
    var generatedTrees = outputCompilation.SyntaxTrees
        .Where(t => t.FilePath.Contains(".g.cs"));
    
    Assert.Single(generatedTrees);
    Assert.Contains("AddAutoRegisteredServices", generatedTrees.First().ToString());
}
```

## Performance Considerations

Source generators run on every keystroke in the IDE and on every build. A slow generator degrades the entire development experience.

### Use Incremental Generators

Always use `IIncrementalGenerator` (not the older `ISourceGenerator`). Incremental generators cache results and only regenerate when inputs change:

```csharp
// Good: Only processes changed syntax
var provider = context.SyntaxProvider.CreateSyntaxProvider(...);

// Bad: Processes everything on every invocation
context.RegisterSourceOutput(context.CompilationProvider, (ctx, compilation) => {
    // This runs fully on every build
});
```

### Filter Early

Use the `predicate` in `CreateSyntaxProvider` to filter candidates before expensive semantic analysis:

```csharp
// Good: Syntax-only filtering is fast
predicate: static (node, _) => node is ClassDeclarationSyntax { AttributeLists.Count: > 0 }

// Bad: No filtering, analyzes every node
predicate: static (node, _) => node is ClassDeclarationSyntax
```

### Avoid Allocations

Generators run frequently. Minimize allocations by using `StringBuilder` pools, caching strings, and avoiding LINQ in hot paths.

## Common Pitfalls

**Pitfall 1: Targeting wrong framework**
Generators must target `netstandard2.0`. Targeting `net8.0` will fail mysteriously.

**Pitfall 2: Missing analyzer reference**
The project reference needs `OutputItemType="Analyzer"` or the generator won't run.

**Pitfall 3: Caching issues in IDE**
Sometimes you need to restart Visual Studio/Rider to pick up generator changes. If things seem stale, restart.

**Pitfall 4: Depending on mutable state**
Generators must be deterministic. Given the same input, they must produce the same output. Don't use timestamps, random numbers, or external state.

## Conclusion

Source generators move boilerplate from your codebase to the compiler. The result is code that's generated once, visible in your IDE, debuggable, and has zero runtime overhead.

They're particularly powerful for scenarios where you'd otherwise rely on reflection - serialization, dependency injection, mapping, and similar patterns. The upfront investment in building a generator pays off every time the generated code saves someone from writing boilerplate.

Start with the simple patterns, test your generators thoroughly, and always prioritize incremental generation for IDE performance.

---

*Questions about source generators or code generation patterns? Let me know in the comments!*
