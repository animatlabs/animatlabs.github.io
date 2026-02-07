---
title: "Native AOT in .NET: Faster Startup, Smaller Binaries"
excerpt: >-
  "Ahead-of-time compilation for .NET - here's when it makes sense and what you lose."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Native AOT
  - Performance
  - Startup Time
  - Binary Size
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- TARGET: 1,200-1,500 words -->

## What is Native AOT?

<!-- TODO: Brief explanation -->

## Enabling Native AOT

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>
</PropertyGroup>
```

```bash
dotnet publish -c Release -r win-x64
```

## Real Benchmarks

<!-- TODO: Run your own benchmarks comparing JIT vs AOT -->

| Metric | JIT | Native AOT | Improvement |
|--------|-----|------------|-------------|
| Startup time | XXX ms | XXX ms | XX% |
| Binary size | XXX MB | XXX MB | XX% |
| Memory (startup) | XXX MB | XXX MB | XX% |
| Throughput | XXX req/s | XXX req/s | XX% |

## What Works and What Doesn't

### Works
- Most ASP.NET Core Minimal APIs
- gRPC
- Console applications
- Most of System.Text.Json

### Doesn't Work (or needs trimming annotations)
- Reflection-heavy code
- Dynamic assembly loading
- Some serializers (Newtonsoft.Json)

## Trimming Warnings

<!-- TODO: How to handle trimming warnings -->

## When to Use Native AOT

<!-- TODO: Your recommendations -->

| Scenario | AOT Recommended? |
|----------|------------------|
| Lambda functions | Yes |
| CLI tools | Yes |
| Microservices with cold starts | Yes |
| Traditional web APIs | Maybe |
| Reflection-heavy apps | No |

## Conclusion

**Benchmark code:** [GitHub](https://github.com/animat089/native-aot-benchmarks){: .btn .btn--primary}
