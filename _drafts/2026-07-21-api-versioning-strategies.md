---
title: "API Versioning Strategies in ASP.NET Core"
excerpt: >-
  "URL, header, or query string? Here's how to version your APIs and migrate gracefully."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - API
  - Versioning
  - ASP.NET Core
  - REST
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST (from your plan):
- [ ] Does this include a real problem I faced?
- [ ] Did I run the examples myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,200-1,500 words
-->

## Why Version Your API?

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After deploying v1 of our API, we realized we needed to change the response structure 
for the user endpoint. But we had 50+ clients already consuming it. Versioning saved us."

Include:
- A real scenario from your work where versioning was needed
- Why breaking changes happen (schema changes, business logic changes, etc.)
- The cost of not versioning (breaking clients, forced migrations)
- When versioning becomes necessary
-->

## Versioning Approaches

<!-- 
TODO: Explain the three main approaches to API versioning
Include:
- URL path versioning (/api/v1/users, /api/v2/users)
- Query string versioning (/api/users?api-version=1.0)
- Header versioning (X-API-Version or Accept header)
- Pros and cons of each approach
- When to use which approach
-->

### URL Path Versioning

<!-- 
TODO: Explain URL path versioning in detail
Include:
- How it works (/api/v1/users, /api/v2/users)
- Visibility and cacheability benefits
- Implementation example
- Real-world example from your experience
-->

```csharp
// TODO: Add example of URL path versioning configuration
[ApiVersion("1.0")]
[Route("api/v{version:apiVersion}/users")]
public class UsersV1Controller : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { version = "1.0", users = GetUsersV1() });
    }
}

[ApiVersion("2.0")]
[Route("api/v{version:apiVersion}/users")]
public class UsersV2Controller : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { version = "2.0", users = GetUsersV2() });
    }
}
```

### Query String Versioning

<!-- 
TODO: Explain query string versioning
Include:
- How it works (/api/users?api-version=1.0)
- When it's appropriate
- Implementation example
- Limitations (cacheability issues)
-->

```csharp
// TODO: Add example of query string versioning configuration
[ApiVersion("1.0")]
[Route("api/users")]
public class UsersController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { version = "1.0", users = GetUsers() });
    }
}
```

### Header Versioning

<!-- 
TODO: Explain header-based versioning
Include:
- How it works (X-API-Version header or Accept header)
- When it's appropriate
- Implementation example
- Benefits (clean URLs, good cacheability)
-->

```csharp
// TODO: Add example of header versioning configuration
[ApiVersion("1.0")]
[Route("api/users")]
public class UsersController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok(new { version = "1.0", users = GetUsers() });
    }
}
```

## ASP.NET Core Implementation

<!-- 
TODO: Show how to configure API versioning in ASP.NET Core
Include:
- Package installation (Microsoft.AspNetCore.Mvc.Versioning)
- Service registration
- Configuration options
- Controller setup
- Complete working example
-->

```csharp
// TODO: Add Program.cs or Startup.cs configuration example
// Install: Microsoft.AspNetCore.Mvc.Versioning

builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1, 0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;
    options.ApiVersionReader = ApiVersionReader.Combine(
        new UrlSegmentApiVersionReader(),
        new QueryStringApiVersionReader("api-version"),
        new HeaderApiVersionReader("X-API-Version")
    );
});

builder.Services.AddVersionedApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";
    options.SubstituteApiVersionInUrl = true;
});
```

## Migration Strategies

<!-- 
TODO: Explain how to migrate between versions gracefully
Include:
- Deprecation strategies
- Sunset headers
- Communication with clients
- Version lifecycle management
- Your own experience migrating versions
-->

```csharp
// TODO: Add example of deprecation and sunset headers
[ApiVersion("1.0", Deprecated = true)]
[Route("api/v{version:apiVersion}/users")]
public class UsersV1Controller : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        Response.Headers.Add("Sunset", "Sat, 31 Dec 2026 23:59:59 GMT");
        Response.Headers.Add("Link", "<https://api.example.com/api/v2/users>; rel=\"successor-version\"");
        return Ok(new { version = "1.0", users = GetUsersV1() });
    }
}
```

### Version Comparison

<!-- 
TODO: Create a comparison table
Include:
- Visibility
- Cacheability
- Simplicity
- Browser support
- Your recommendation for each scenario
-->

| Approach | Visibility | Cacheability | Simplicity | Browser Support | Best For |
|----------|------------|--------------|------------|-----------------|----------|
| URL Path | High | Good | High | Excellent | Public APIs, RESTful services |
| Query String | Medium | Poor | High | Excellent | Internal APIs, quick prototypes |
| Header | Low | Good | Medium | Good | Enterprise APIs, mobile apps |

## My Recommendations

<!-- 
TODO: Share your personal opinion on which approach to use when
Include:
- Your preferred approach for different scenarios
- What you've used in production
- Lessons learned
- Migration tips
- Gotchas to avoid
-->

### When to Use Each Approach

1. **URL Path Versioning** - Use for public APIs where version visibility matters
2. **Query String Versioning** - Use for internal APIs or when you need quick versioning
3. **Header Versioning** - Use for enterprise APIs where clean URLs are important

## Conclusion

<!-- 
TODO: Summarize with your personal recommendation
What's your takeaway? What should readers do next?
Include:
- Key points to remember
- Next steps for implementing versioning
- Resources for further learning
-->

**You can access the example code from my** [GitHub Repo](https://github.com/animat089/playground){: .btn .btn--primary}

---

*What versioning strategy do you use? Share in the comments!*
