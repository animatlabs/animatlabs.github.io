---
title: "3 things you should know about Strings"
excerpt: >-
  "We work with strings every day in our applications. We often don't see the mistakes we're making, or we don't see ways to potentially optimize the code. And there are many of them."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - Strings
author: animat089
last_modified_at: 2024-02-08
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Introduction

We work with strings every day in our applications. We often don't see the mistakes we're making, or we don't see ways to potentially optimize the code. And there are many of them. Today I'm going to show you 3 things you should know about working with strings as a .NET Developer. Those are:

1. Use **StringBuilder** for concatenation
2. Use **StringComparison** for performance
3. Leverage **Span** for memory efficiency

## Processing Strings

### Use StringBuilder for concatenation

In .NET, strings are immutable. This means once a string object is created, it cannot be modified. If you need to change a string by appending another string to it, .NET doesn't actually append the new string to the existing string. Instead, it creates a new string object that contains the combination of the two strings and then discards the old string. This behavior is efficient and safe for small or a few manipulations but becomes a performance and memory issue when done repeatedly, such as in a loop.

**StringBuilder** is a dynamic object that allows you to expand the number of characters in the string it contains without creating a new object for every concatenation. Under the hood, StringBuilder maintains an array of characters. When you append a string to a StringBuilder instance, it simply copies the added characters to the end of the internal array. If the array runs out of space, StringBuilder automatically allocates a new, larger array and copies the characters into it.

This happens far less frequently than string immutability would force, making StringBuilder much more efficient for concatenation operations, particularly in loops.

```C#
// Using string concatenation
string result = "";
for (int i = 0; i < 1000; i++)
{
    result += "a"; // Creates a new string object in each iteration
}

// Using StringBuilder
var builder = new StringBuilder();
for (int i = 0; i < 1000; i++)
{
    builder.Append("a"); // Appends to the existing character array
}
string result = builder.ToString(); // Converts to string once at the end
```

And if we check the performance, the performance improves by a stooping ~19X-20X both in terms of memory and ~40x-45X in terms or time. StringBuilder is essential for optimizing memory usage and improving performance in applications that perform extensive string manipulation.

### Use StringComparison for performance

.NET provides several ways to compare strings, including simple equality checks (==), string.Equals, string.Compare, and methods like string.StartsWith or string.Contains. Each of these methods can optionally take a **StringComparison** enumeration as a parameter, which specifies **how the comparison should be conducted**. The StringComparison options include:

- **Ordinal comparisons (Ordinal, OrdinalIgnoreCase):** These comparisons are based on the binary values of the characters in the strings and are the fastest type of comparison. They are culture-insensitive, making them ideal for comparing strings for internal processing, file paths, machine-readable strings (like XML tags), and when performance is crucial.
- **Culture-sensitive comparisons (CurrentCulture, CurrentCultureIgnoreCase, InvariantCulture, InvariantCultureIgnoreCase):** These comparisons consider the cultural context of the strings, which is essential when comparing strings that are displayed to the user or when the comparison results depend on specific cultural rules (like sorting in a user interface).
- Ordinal comparisons are faster than culture-sensitive comparisons because they directly compare the numeric Unicode value of each character in the strings.
- There's no need to apply cultural rules, which can vary widely and involve complex logic like handling special characters, accent marks, or case conversions based on specific cultures.

```c#
string string1 = "hello world";
string string2 = "Hello World";

bool areEqual = string.Equals(string1, string2, StringComparison.OrdinalIgnoreCase);
// areEqual is true because the comparison is case-insensitive.
```

### Leverage Span for memory efficiency

Span is a stack-allocated type that can point to continuous memory regions representing slices of arrays, strings, or unmanaged memory. It provides the ability to work with a slice of data without allocating new memory for that slice.
This is particularly useful for strings because, as previously mentioned, strings are immutable in .NET. Key Advantages of Span:

- **Reduced Allocations:** Since Span can reference a portion of an array or string, it eliminates the need for creating new substrings or array segments when you only need to work with part of the data. This can significantly reduce the number of allocations, thereby reducing the Garbage Collector (GC) pressure and improving application performance.
- **Memory Efficiency:** Span enables more efficient memory usage by allowing operations on slices of data without duplicating the underlying data structures. This is particularly beneficial in performance-critical applications, such as parsers or processing pipelines, where it's common to only need to read or manipulate small portions of a larger data set at any one time.
- **Versatility:** Span can be used with any type of contiguous memory, not just arrays or strings. This includes unmanaged memory, which opens up possibilities for high-performance scenarios that were previously more cumbersome or inefficient in .NET.

Let's compare it with a basic Substring mehod: This opens the JSON configuration where you can define your Rate Limiting Policy in detail.

```c#
public class SpanVsSubstring
{
    private const string testString = "This is a longer test string for demonstration.";

    [Benchmark]
    public string UseSubstring()
    {
        return testString.Substring(10, 5); // Extracts "longer"
    }

    [Benchmark]
    public ReadOnlySpan<char> UseSpan()
    {
        ReadOnlySpan<char> span = testString.AsSpan(10, 5);
        return span; // "longer"
    }
}
```

The performance for both the versions varies by far using substring takes ~6ns whereas with span it takes ~0.01ns and there is no memory usage at all from ~32bytes used in substring.

## Conclusion

Incorporating these techniques into your .NET applications can significantly improve string handling performance, both in terms of speed and memory efficiency. Always test these approaches in the context of your specific application to measure their impact.

## References

- [Stefan's Blog talking about the same](https://stefandjokic.tech/posts/3-things-you-should-know-about-strings)