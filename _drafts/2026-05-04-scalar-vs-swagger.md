---
title: "Goodbye Swagger: Scalar is Now the .NET Default"
excerpt: >-
  "Microsoft replaced Swagger UI with Scalar in .NET 9. Here's why it's better and how to make the switch."
categories:
  - Technical
  - .NET
  - API Development
tags:
  - .NET
  - Scalar
  - Swagger
  - OpenAPI
  - API Documentation
  - Developer Experience
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The End of Swagger UI

For years, Swagger UI was synonymous with API documentation in .NET. But in .NET 9, Microsoft made a bold move: Scalar is now the default.

Why? Better performance, cleaner design, and features that Swagger UI never had.

<!--
TARGET: 1,500-2,000 words

OUTLINE:
1. What changed in .NET 9
2. Scalar vs Swagger UI comparison
3. Setting up Scalar
4. Advanced features (dark mode, try-it-out, multiple languages)
5. Migrating existing projects

CODE EXAMPLES:
- Default .NET 9 setup
- Scalar configuration options
- Custom styling
- Authentication integration
-->

## What Changed in .NET 9

<!-- TODO: Microsoft's decision, Swashbuckle retirement, Scalar adoption -->

## Scalar vs Swagger UI

| Feature | Swagger UI | Scalar |
|---------|------------|--------|
| Load time | ~1.5s | ~500ms |
| Bundle size | ~400KB | ~200KB |
| Dark mode | ❌ | ✅ |
| Code examples | Limited | Multiple languages |
| Search | Basic | Full-text |
| Mobile responsive | Partial | Full |

## Setting Up Scalar

```bash
dotnet add package Scalar.AspNetCore
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();

var app = builder.Build();
app.MapOpenApi();
app.MapScalarApiReference(); // That's it!
app.Run();
```

## Configuration Options

```csharp
app.MapScalarApiReference(options =>
{
    options.Title = "My API";
    options.Theme = ScalarTheme.Purple;
    options.DefaultHttpClient = new(ScalarTarget.CSharp, ScalarClient.HttpClient);
});
```

## Advanced Features

### Multiple Code Examples

<!-- TODO: Show the same request in cURL, JavaScript, Python, C# -->

### Authentication

```csharp
// TODO: OAuth, API key configuration
```

## Migrating from Swashbuckle

```csharp
// Before (.NET 8)
builder.Services.AddSwaggerGen();
app.UseSwagger();
app.UseSwaggerUI();

// After (.NET 9+)
builder.Services.AddOpenApi();
app.MapOpenApi();
app.MapScalarApiReference();
```

## Conclusion

<!-- TODO: Scalar is the future, make the switch -->

---

*Made the switch to Scalar? Share your experience in the comments!*
