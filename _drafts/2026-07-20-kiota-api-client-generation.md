---
title: "Kiota: Microsoft's Auto-Generated API Clients You've Never Heard Of"
excerpt: >-
  "Give Kiota an OpenAPI spec, get a strongly-typed C# client. No more hand-writing HttpClient code for every endpoint."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Kiota
  - OpenAPI
  - API Client
  - Code Generation
  - Microsoft
author: animat089
last_modified_at: 2026-07-20
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- The problem: writing HttpClient code for every API
- What is Kiota? (Microsoft's API client generator)
- Kiota vs NSwag vs Refit vs manual HttpClient
- Installation and setup
- Generate a client from a real OpenAPI spec
- Explore the generated code
- Authentication and middleware
- Customization options
- Multi-language support (C#, Go, Java, Python, TypeScript)
- When to use Kiota vs alternatives

UNIQUE ANGLE: Discovery post. Few .NET developers know this exists despite being from Microsoft.
-->

## The Problem

*Content to be written*

## What Is Kiota?

```bash
dotnet tool install -g Microsoft.OpenApi.Kiota
kiota generate -l CSharp -d https://api.example.com/openapi.json -o ./Client -n MyApi
```

## Conclusion

*Content to be written*

---

*Using Kiota or another API client generator? Let me know in the comments!*
