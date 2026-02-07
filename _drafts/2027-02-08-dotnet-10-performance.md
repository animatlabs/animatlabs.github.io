---
title: ".NET 9 Performance Improvements: Benchmarked"
excerpt: >-
  "What's actually faster in .NET 9? I benchmarked the key improvements so you don't have to."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Performance
  - Benchmarks
  - .NET 9
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!--
ORIGINALITY CHECKLIST:
- [ ] Did I run the benchmarks myself?
- [ ] Does this reference my actual scenarios?
- [ ] Are the results reproducible?

TARGET: 1,500-1,800 words
REQUIRES: Your actual benchmark data comparing .NET 8 vs .NET 9
-->

## Overview of Improvements

<!-- TODO: Brief overview of .NET 9 performance claims and what Microsoft announced -->

## Benchmark Methodology

<!-- TODO: Describe your test environment, BenchmarkDotNet setup, hardware specs -->

## Results

<!-- TODO: System.Text.Json improvements -->

| Scenario | .NET 8 | .NET 9 | Improvement |
|----------|--------|--------|-------------|
| JSON Serialization | XXX μs | XXX μs | XXX% |
| JSON Deserialization | XXX μs | XXX μs | XXX% |

<!-- TODO: LINQ improvements -->

| Operation | .NET 8 | .NET 9 | Improvement |
|-----------|--------|--------|-------------|
| Where().Select() | XXX μs | XXX μs | XXX% |
| Aggregate | XXX μs | XXX μs | XXX% |

<!-- TODO: Regex performance -->

| Pattern | .NET 8 | .NET 9 | Improvement |
|---------|--------|--------|-------------|
| Simple match | XXX μs | XXX μs | XXX% |
| Complex pattern | XXX μs | XXX μs | XXX% |

<!-- TODO: GC improvements -->

| Scenario | .NET 8 | .NET 9 | Improvement |
|----------|--------|--------|-------------|
| Memory pressure | XXX MB | XXX MB | XXX% |

<!-- TODO: Additional improvements (async/await, collections, etc.) -->

## Migration Tips

<!-- TODO: Your recommendations for upgrading, breaking changes to watch for, compatibility notes -->

## Conclusion

**Benchmark code:** [GitHub](https://github.com/animat089/dotnet-benchmarks){: .btn .btn--primary}

---

*Benchmarked .NET 9 yourself? Share your findings in the comments!*
