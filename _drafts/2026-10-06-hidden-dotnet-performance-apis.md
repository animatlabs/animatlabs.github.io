---
title: "4 Hidden .NET Performance APIs You're Not Using"
excerpt: >-
  FrozenDictionary, SearchValues, CollectionsMarshal, and StringValues. They ship with the runtime and packages you already reference. Hardly anyone reaches for them first.
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

I used to squeeze microbenchmarks out of `Dictionary<TKey,TValue>` by caching delegates and avoiding LINQ on hot paths. The GC still annoyed me on read-heavy routes. Turns out half the fixes I wanted were already in the box. I had just never scrolled past `System.Collections.Generic` in the docs.

These four APIs are not exotic preview features. Frozen collections landed in modern .NET. `SearchValues` lives in core libraries. `CollectionsMarshal` is an unsafe-adjacent escape hatch sitting in plain sight. `StringValues` hides inside `Microsoft.Extensions.Primitives`. If you ship ASP.NET Core, you already depend on that package transitively.

Nobody labels them `HiddenPerformance`. You will not bump into them through beginner tutorials either. My rule now: stable read-mostly map, try frozen first. Repeated span scans with a fixed alphabet, hoist a `SearchValues`. Hot accumulation into a dictionary, check the marshal helper before I rewrite every call site around a custom trie.

I still profile before I ship this stuff. A frozen map that serves three requests per second is cosplay. The wins I trust showed up in middleware, serializers, and batch importers where the same lookup ran thousands of times per second on the same keys. The pattern is boring. Build once, read forever.

## FrozenDictionary and FrozenSet

A normal `Dictionary` optimizes for a mix of adds and lookups. Frozen collections flip the bargain: pay once when you build them, then reads get a tighter layout and less indirection than `ImmutableDictionary`. I reach for them when the map is filled at startup and never changes. Think feature flags, MIME tables, SKU maps.

`ReadOnlyDictionary` still sits on top of a mutable backing store unless you built it carefully. `ImmutableDictionary` gives you safe sharing, but I have paid its pointer-chasing tax in tight loops. Frozen types feel closer to a generated switch over known keys. The BCL does the layout work for me.

```csharp
using System.Collections.Frozen;

var raw = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase)
{
    ["gzip"] = 1,
    ["br"] = 2,
    ["zstd"] = 3,
};

FrozenDictionary<string, int> encodings = raw.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);

foreach (var name in (ReadOnlySpan<string>)["gzip", "br", "zstd"])
{
    if (encodings.TryGetValue(name, out int id))
        UseEncoding(id); // branch-free friendly hot path vs repeated dictionary probes in some workloads
}

FrozenSet<string> allowedHosts = raw.Keys.ToFrozenSet(StringComparer.OrdinalIgnoreCase);
Debug.Assert(allowedHosts.Contains("GZIP")); // comparison rules preserved from source construction
```

`FrozenSet` is the sibling for membership tests without caring about stored values. Build from any `IEnumerable<T>`, freeze once. The immutable snapshot survives after you clear the mutable source.

```csharp
// Same comparer discipline as dictionaries
string[] whitelist = LoadHostnamesOnce();
FrozenSet<string> trusted = whitelist.ToFrozenSet(StringComparer.OrdinalIgnoreCase);

bool Allow(string host)
    => trusted.Contains(host.Trim());
```

I still keep a normal `Dictionary` when inserts happen mid-request. Growth invalidates the whole frozen picture.

What burns you: freezing a tiny dictionary for two keys is pointless churn. Creation walks the inputs, hashes everything, allocates the compact representation. Skip it for ephemeral per-request caches. Win on read-heavy loops with stable data.

## SearchValues<char> and SearchValues<byte>

String searching with `IndexOfAny` eventually calls into vectorized primitives. `SearchValues<T>` in `System.Buffers` is the typed precompute step. `T` is either `byte` or `char`. You build the search set once, then every `IndexOfAny` shares the same tuned bitmap and SWAR path the runtime team cares about.

I stopped treating `IndexOfAny` like a free static helper. The overload that takes `SearchValues<char>` is the one I want in parsers I actually deploy. Random `char[]` literals reallocated per call still happen in my old PRs. I fix them when I touch the file.

```csharp
using System.Buffers;

// Any of these characters terminates a token.
SearchValues<char> separators = SearchValues.Create(stackalloc char[] { ',', ';', '\t', '|' });

ReadOnlySpan<char> line = "one,two;three\tfour";
int start = 0;
while (start < line.Length)
{
    int next = line[start..].IndexOfAny(separators);
    if (next < 0)
    {
        ProcessSegment(line[start..]);
        break;
    }

    int absolute = start + next;
    ProcessSegment(line[start..absolute]);
    start = absolute + 1;
}
```

For binary protocols, `SearchValues<byte>` works the same way over `ReadOnlySpan<byte>`. I keep a static readonly instance when the pattern is fixed for the process lifetime. For patterns that change per request, measure: construction is not free, but it beats rebuilding a `HashSet<char>` for every call when the set is small and hot.

```csharp
SearchValues<byte> crlf = SearchValues.Create("\r\n"u8);

ReadOnlySpan<byte> buf = GetBuffer();
int idx = buf.IndexOfAny(crlf);
```

Need Turkish `I` rules or case folding from Unicode? Use `StringComparison` APIs and pay for it. `SearchValues` is for raw bytes and characters with ordinal intent. I use it in network text, config tokens, and base64-ish alphabets where culture is irrelevant.

```csharp
// Hoist construction: static readonly beats per-call SearchValues.Create in a tight loop
static class HttpDelimiters
{
    public static readonly SearchValues<char> HeaderSeparators =
        SearchValues.Create(stackalloc char[] { ':', ',' });
}
```

## CollectionsMarshal.GetValueRefOrAddDefault

The compiler cannot merge your `TryGetValue` followed by indexer assign into one lookup when you spell them as two statements. `CollectionsMarshal.GetValueRefOrAddDefault` returns a `ref` to the slot, and an `out bool` tells you if the key existed. Namespace is `System.Runtime.InteropServices`. Name is a mouthful. Behavior is simple.

Some teams wrap the same idea in extension methods. I keep the call visible on purpose. The footguns matter.

```csharp
using System.Runtime.InteropServices;

var counts = new Dictionary<string, int>();

void Bump(string key)
{
    ref int slot = ref CollectionsMarshal.GetValueRefOrAddDefault(counts, key, out bool exists);
    if (exists)
        slot++;
    else
        slot = 1;
}
```

Micro-benchmark junkies argue about nanoseconds here. Where I felt it was word-counting pipelines and histograms on huge streams. Fewer hashing passes per key adds up.

The scary part lives in the doc comments: keys that participate in equality via mutable state can corrupt the table if you change them while holding the ref. I only use this with immutable keys (`string`, `int`, `Guid`). If equality is unstable, pretend this API does not exist.

Struct values are fine until you widen the span of the reference across awaits. Lifetime rules still apply like any ref into a dictionary.

```csharp
var aggregates = new Dictionary<(int Tenant, DayOfWeek Dow), decimal>();

void AddSale(int tenant, DayOfWeek dow, decimal amount)
{
    var key = (tenant, dow);
    ref decimal total = ref CollectionsMarshal.GetValueRefOrAddDefault(aggregates, key, out bool existed);
    total = existed ? total + amount : amount;
}
```

## StringValues

`StringValues` is a struct pretending to be either zero strings, one string, or many without allocating an array wrapper for common cases. Parsing headers exposed me to it. It behaves like `IReadOnlyList<string>` with indexer and `Count`, but stays stack-friendly when ASP.NET populated it.

Console apps can reference `Microsoft.Extensions.Primitives` on their own. It is a tiny package. I pull it in when I want the same shape as Kestrel without hosting the whole stack.

```csharp
using Microsoft.Extensions.Primitives;

static void Inspect(StringValues sv)
{
    if (sv.Count == 0)
        return;

    if (sv.Count == 1)
    {
        string single = sv[0]!;
        ProcessSingle(single);
        return;
    }

    foreach (string? s in sv)
        ProcessMany(s!);
}

// Building without extra array when you only have one value
StringValues one = new("application/json");
StringValues many = new(new[] { "gzip", "deflate" });
StringValues empty = StringValues.Empty;
```

Converting out when an API wants `string?` is boring but explicit:

```csharp
static string? FirstOrNull(StringValues sv) => sv.Count == 0 ? null : sv[0];
```

I like it for my own mini DTOs when a field might be singular or repeated and I do not want `string?` plus `string[]?` duplication. YAGNI if you never hit the multi-value path. If you do, this type stops the silly `new[] { single }` allocations.

```csharp
// MVC / minimal APIs already model headers and some query keys as StringValues
void Handle(StringValues accept, StringValues etag)
{
    if (etag.Count != 0)
        CompareIfNoneMatch(etag[0]!);

    if (accept.Count == 0)
        return;

    string joined = string.Join(',', accept);
    NegotiateFormat(joined);
}
```

Equality is structural. Two instances with the same sequence compare equal. That beats reference equality on wrapped arrays until I forget and mutate a shared backing array anyway. I treat slices as immutable after creation.

## What I actually changed

I stopped hand-rolling `HashSet<char>` for delimiter scans in parsers. I froze lookup tables loaded from config on startup instead of wrapping `Dictionary` in locks I did not need. I use `GetValueRefOrAddDefault` in tight loops only when profiling showed lookup overhead, not everywhere. Readability still wins most reviews.

None of this replaces measuring. It replaces guilt when the profiler already told me the truth. I keep a normal `Dictionary` where the shape changes. I freeze when the shape is static. I hoist `SearchValues` when the alphabet is static. I treat `StringValues` as the honest type for "one or many strings" at API boundaries. Small choices, but they add up on paths that never sleep.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/HiddenPerfApis){: .btn .btn--primary}

Which of these four would you wire in first on a codebase you maintain today?
