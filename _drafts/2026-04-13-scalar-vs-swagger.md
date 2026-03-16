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
last_modified_at: 2026-03-14
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The End of Swagger UI

For years, Swagger UI was synonymous with API documentation in .NET. But in .NET 9, Microsoft made a bold move: Scalar is now the default.

Why? Better performance, cleaner design, and features that Swagger UI never had.

## What Changed in .NET 9

Swashbuckle.AspNetCore had a good run. Then the maintainer stepped back. No .NET 8 release. No merged PRs since late 2022. The package went effectively unmaintained.

Microsoft had a choice: keep shipping templates that depended on dead code, or build something new.

They chose new. .NET 9 introduced `Microsoft.AspNetCore.OpenApi` — native OpenAPI document generation built into the framework. No third-party package for the spec itself. You call `MapOpenApi()` and you get `/openapi/v1.json`. Done.

For the UI, Microsoft picked Scalar. Same OpenAPI spec, different experience. Lighter bundle. Dark mode out of the box. Code samples in six languages instead of one. The ASP.NET team even called it out in their release notes.

Swagger isn't gone — you can still add Swashbuckle if you want. But it's no longer the default. Scalar is.

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
using Scalar.AspNetCore;

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
    options.WithTitle("My API");
    options.WithTheme(ScalarTheme.Purple);
    options.WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
});
```

`ScalarTarget` picks the language for code samples (CSharp, JavaScript, Python, cURL, Go, Ruby). `ScalarClient` picks the client library — e.g. `HttpClient` for C#, `Fetch` for JavaScript. Default is cURL. I set C# HttpClient because that's what my team uses.

## Advanced Features

### Multiple Code Examples

Open any endpoint in Scalar. You'll see a tab bar above the request: cURL, JavaScript, Python, C#, Go, Ruby. Click one — the code block updates instantly. Same endpoint, same parameters, different language.

Your frontend dev copies the fetch snippet. Your Python script gets the requests version. The Go microservice gets the net/http example. No more "how do I call this from X?" — the answer is right there. I've lost count of how many Slack threads that's killed.

Swagger gave you one code block. Scalar gives you the one you need.

### Authentication

Your OpenAPI spec defines the security schemes. Scalar can pre-fill them so devs don't type tokens by hand.

**API key:**

```csharp
app.MapScalarApiReference(options => options
    .AddPreferredSecuritySchemes("ApiKey")
    .AddApiKeyAuthentication("ApiKey", apiKey =>
    {
        apiKey.Value = "your-dev-token";
    }));
```

**Bearer token:**

```csharp
app.MapScalarApiReference(options => options
    .AddPreferredSecuritySchemes("Bearer")
    .AddHttpAuthentication("Bearer", auth =>
    {
        auth.Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
    }));
```

**OAuth2 (authorization code):**

```csharp
app.MapScalarApiReference(options => options
    .AddPreferredSecuritySchemes("OAuth2")
    .AddAuthorizationCodeFlow("OAuth2", flow =>
    {
        flow.ClientId = "your-client-id";
        flow.ClientSecret = "your-client-secret";
        flow.Pkce = Pkce.Sha256;
        flow.SelectedScopes = ["profile", "email"];
    }));
```

Security notice: pre-filled auth is visible in the browser. Use this for dev and staging only. Never in production.

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

Remove the Swashbuckle package. Add Scalar.AspNetCore. Swap the three lines. Your docs move from `/swagger` to `/scalar`. Existing OpenAPI annotations (e.g. `[ProducesResponseType]`) still work — both generators read the same metadata.

## Conclusion

Scalar is the default because it's faster, smaller, and more useful. If you're on .NET 9, you're already halfway there. Make the switch. Your API consumers will notice the difference.

---

*Made the switch to Scalar? Share your experience in the comments!*

<!--
LINKEDIN PROMO (150-250 words):

Swagger UI is dead in .NET 9. Microsoft replaced it with Scalar.

Not deprecated — replaced. The new web API templates ship Scalar by default. Swashbuckle's maintainer stepped back, the package went unmaintained, and Microsoft built native OpenAPI support into the framework instead.

I wrote up why Scalar wins: ~500ms load time vs ~1.5s, half the bundle size, dark mode, and code samples in six languages (cURL, JavaScript, Python, C#, Go, Ruby) instead of one. Plus OAuth2 and API key auth pre-configuration so your team doesn't retype tokens every time they hit the docs.

Migration is three lines. Remove Swashbuckle, add Scalar.AspNetCore, swap MapOpenApi + MapScalarApiReference for the old UseSwagger/UseSwaggerUI. Full post with code examples in the first comment.

What's your go-to for API docs — still Swagger, or have you switched?
-->
