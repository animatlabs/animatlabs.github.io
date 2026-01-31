---
title: "Memory Management with Span<T> and Memory<T>"
excerpt: >-
  "Reduce allocations and boost performance with Span and Memory. Here's how they work and when to use them."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Span
  - Memory
  - Performance
  - Allocations
  - High Performance
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
EXTENDS YOUR STRINGS POST

TARGET: 1,200-1,500 words
-->

## The Allocation Problem

<!-- TODO: Why allocations matter, GC pressure -->

## What is Span<T>?

```csharp
// Span is a view into contiguous memory - no allocation
Span<char> span = stackalloc char[100];

// Or a view into an existing array
int[] array = { 1, 2, 3, 4, 5 };
Span<int> slice = array.AsSpan(1, 3); // [2, 3, 4]
```

## Span vs Memory

| Feature | Span<T> | Memory<T> |
|---------|---------|-----------|
| Stack only | Yes | No |
| Can be stored in fields | No | Yes |
| Async methods | No | Yes |
| Performance | Faster | Slightly slower |

## Practical Examples

### Parsing Without Allocation

```csharp
// Before: Creates substring allocations
public (string name, string value) ParseOld(string input)
{
    var parts = input.Split('=');
    return (parts[0], parts[1]);
}

// After: Zero allocations
public (ReadOnlySpan<char> name, ReadOnlySpan<char> value) ParseNew(ReadOnlySpan<char> input)
{
    var index = input.IndexOf('=');
    return (input[..index], input[(index + 1)..]);
}
```

### String Building

```csharp
// Efficient string building with Span
public string BuildString(ReadOnlySpan<char> prefix, int number)
{
    Span<char> buffer = stackalloc char[64];
    prefix.CopyTo(buffer);
    number.TryFormat(buffer[prefix.Length..], out int written);
    return new string(buffer[..(prefix.Length + written)]);
}
```

## Benchmarks

<!-- TODO: Run your own benchmarks -->

```
| Method        | Mean     | Allocated |
|---------------|----------|-----------|
| WithStrings   | XXX ns   | XXX B     |
| WithSpan      | XXX ns   | 0 B       |
```

## When to Use Span

<!-- TODO: Your recommendations -->

## Common Patterns

### ArrayPool

```csharp
var pool = ArrayPool<byte>.Shared;
byte[] buffer = pool.Rent(1024);
try
{
    // Use buffer
}
finally
{
    pool.Return(buffer);
}
```

### String.Create

```csharp
string result = string.Create(length, state, (span, s) =>
{
    // Write directly to span
    s.Name.AsSpan().CopyTo(span);
});
```

## Conclusion

**Benchmark code:** [GitHub](https://github.com/animat089/span-benchmarks){: .btn .btn--primary}
