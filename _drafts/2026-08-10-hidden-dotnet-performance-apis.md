---
title: "5 Hidden .NET Performance APIs You're Not Using"
excerpt: >-
  "FrozenDictionary, SearchValues, CollectionsMarshal, StringValues, and more. These ship with .NET but almost nobody uses them."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Performance
  - FrozenDictionary
  - SearchValues
  - Optimization
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!--
TARGET: 1,200-1,500 words
ORIGINALITY CHECKLIST:
- [ ] Clear explanation of what frozen collections are
- [ ] Performance comparison with Dictionary, ImmutableDictionary, ReadOnlyDictionary
- [ ] Use cases: configuration, lookup tables, constants
- [ ] Limitations: creation cost, no modifications, size considerations
- [ ] Benchmark data showing performance improvements
- [ ] Migration guide from existing collections
-->

## What Are Frozen Collections

<!-- TODO: Explain FrozenDictionary and FrozenSet -->
<!-- TODO: Immutability guarantee, performance optimizations -->
<!-- TODO: Creation cost vs read performance trade-off -->

```csharp
// TODO: Add example creating frozen collections
// TODO: Show FrozenDictionary.ToFrozenDictionary() extension
// TODO: Show FrozenSet.ToFrozenSet() extension
```

## Performance Comparison

<!-- TODO: Benchmark data: XXX placeholder to be filled -->
<!-- TODO: Comparison with Dictionary, ImmutableDictionary, ReadOnlyDictionary -->
<!-- TODO: Lookup performance, memory usage, creation time -->

```csharp
// TODO: Add benchmark examples
// TODO: Show performance characteristics
// TODO: XXX - Add actual benchmark results
```

## Use Cases

<!-- TODO: Configuration data: app settings, feature flags -->
<!-- TODO: Lookup tables: country codes, currency codes -->
<!-- TODO: Constants: enum-like data, validation rules -->
<!-- TODO: Caching: read-only caches -->

```csharp
// TODO: Add configuration example
// TODO: Add lookup table example
// TODO: Add constants example
```

## Limitations

<!-- TODO: Creation cost: one-time overhead -->
<!-- TODO: No modifications: truly immutable -->
<!-- TODO: Size considerations: when frozen collections aren't worth it -->
<!-- TODO: Thread safety considerations -->

```csharp
// TODO: Add examples showing limitations
// TODO: Show when NOT to use frozen collections
```

## Conclusion

---

*Using frozen collections? Share your use cases!*
