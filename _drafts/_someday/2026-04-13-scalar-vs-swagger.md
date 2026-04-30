---
title: "Scalar Replaced Swagger in .NET 9. The Migration Guide"
excerpt: >-
  Swashbuckle went unmaintained. .NET 9 ships Scalar as the default API docs UI. Half the bundle, dark mode, code samples in six languages. Migration is three lines.
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
last_modified_at: 2026-04-13
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

If you've created a new .NET 9 web API project recently, you might have noticed Swagger is gone from the template. Scalar is the default now. Fine by me.

The backstory: Swashbuckle's maintainer stepped back. No .NET 8 release, no merged PRs since late 2022. Dead air. Microsoft had to choose between shipping templates that depend on dead code or building something new.

They went with new. `Microsoft.AspNetCore.OpenApi` handles spec generation natively. `MapOpenApi()` gives you `/openapi/v1.json` without any third-party package. For the UI, they picked Scalar. The ASP.NET team called it out in their release notes.

You can still use Swashbuckle. It's not blocked. But it's no longer the default, and I wouldn't bet on it for new projects.

## Why Scalar

| Feature | Swagger UI | Scalar |
|---------|------------|--------|
| Load time | ~1.5s | ~500ms |
| Bundle size | ~400KB | ~200KB |
| Dark mode | No | Yes |
| Code examples | Limited | 6 languages |
| Search | Basic | Full-text |
| Mobile responsive | Partial | Full |

The code examples are the biggest win for my team. Open any endpoint in Scalar and you see tabs: cURL, JavaScript, Python, C#, Go, Ruby. Click one, the code block updates. Frontend dev copies the fetch snippet, Python script gets requests, Go microservice gets net/http. When you ship a .NET API but half your consumers are on TypeScript or Python, those six-language samples save more time than every theme toggle combined, even if you personally only ever copy the C# tab. That alone has killed a lot of "how do I call this from X?" threads.

## Setup

```bash
dotnet add package Scalar.AspNetCore
```

```csharp
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();

var app = builder.Build();
app.MapOpenApi();
app.MapScalarApiReference();
app.Run();
```

Three lines after the standard builder. Your docs are at `/scalar/v1`.

## Configuration

```csharp
app.MapScalarApiReference(options =>
{
    options.WithTitle("My API");
    options.WithTheme(ScalarTheme.Purple);
    options.WithDefaultHttpClient(ScalarTarget.CSharp, ScalarClient.HttpClient);
});
```

`ScalarTarget` picks the default language for code samples. `ScalarClient` picks the HTTP client (`HttpClient` for C#, `Fetch` for JavaScript). I set C# + HttpClient because that's what my team reaches for.

## Pre-Filled Auth

This is something Swagger never did well. Scalar can pre-fill security schemes so devs don't type tokens by hand every time they open the docs.

API key:

```csharp
app.MapScalarApiReference(options => options
    .AddPreferredSecuritySchemes("ApiKey")
    .AddApiKeyAuthentication("ApiKey", apiKey =>
    {
        apiKey.Value = "your-dev-token";
    }));
```

Bearer token:

```csharp
app.MapScalarApiReference(options => options
    .AddPreferredSecuritySchemes("Bearer")
    .AddHttpAuthentication("Bearer", auth =>
    {
        auth.Token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
    }));
```

OAuth2 with PKCE:

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

Pre-filled auth is visible in the browser. Use this for dev and staging only. Not production.

## Migration from Swashbuckle

```csharp
// Swashbuckle
builder.Services.AddSwaggerGen();
app.UseSwagger();
app.UseSwaggerUI();

// OpenAPI + Scalar
builder.Services.AddOpenApi();
app.MapOpenApi();
app.MapScalarApiReference();
```

Remove the Swashbuckle package. Add `Scalar.AspNetCore`. Swap the three lines. Your docs move from `/swagger` to `/scalar/v1`. Existing OpenAPI annotations like `[ProducesResponseType]` still work; both generators read the same metadata.

If you have XML comments configured via `IncludeXmlComments`, those carry over too. The spec generation is framework-level now, not Swashbuckle-level.

Scalar is faster, lighter, and actively maintained. New .NET 9 project? Already there. Migrating? Three lines. Not complicated.

---

<!-- LINKEDIN PROMO

Swagger UI is gone from the .NET 9 web API template. Scalar is the default now.

Swashbuckle's maintainer stepped back, no releases since late 2022. Microsoft built native OpenAPI support into the framework (MapOpenApi) and picked Scalar for the UI.

Why Scalar: half the bundle size, ~500ms load vs ~1.5s, dark mode, and code samples in six languages per endpoint (cURL, JS, Python, C#, Go, Ruby). The multi-language code samples alone have killed a lot of Slack threads on my team.

Also covered: pre-filled auth (API key, Bearer, OAuth2 with PKCE) for dev environments, and the three-line migration from Swashbuckle.

Full post: [link]

#dotnet #scalar #openapi #webapi
-->
