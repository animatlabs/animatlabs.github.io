---
title: "Humanizer: The .NET Library That Should Be in Every Project"
excerpt: >-
  "Stop writing manual string formatting code. Humanizer turns enums, dates, numbers, and file sizes into human-readable text with a single method call."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Humanizer
  - Strings
  - Formatting
  - Utility
  - Developer Experience
author: animat089
last_modified_at: 2027-05-10
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- Why every project needs Humanizer (8.6k stars)
- Strings: casing, truncation, pluralization, titlization
- Dates and times: relative time, precision, fluent timespan
- Numbers: ordinals, words, Roman numerals, metric
- Byte sizes: human-readable file sizes
- Enums: display-friendly names from enums
- Collections: natural-language joining
- Localization: 40+ languages supported
- Real-world snippets: 20+ examples replacing manual code
- Performance considerations
- Comparison: what you'd write manually vs Humanizer one-liner

UNIQUE ANGLE: Sequel to the strings post (2024-02-08). 
Light, fun, practical. "20+ snippets" format makes it highly shareable.
Shows how a utility library reduces boilerplate across an entire codebase.

LIBRARIES:
- Humanizer (NuGet, 8.6k GitHub stars)

LOCAL DEV: No cloud services needed.
-->

## Why Humanizer Belongs in Every .NET Project

In [3 Things You Should Know About Strings](/technical/.net/.net-core/three-string-operations-should-know/), we covered string performance and optimization. This post is about the other side: making strings readable for humans.

Humanizer (8.6k GitHub stars) is a .NET library that turns computer-friendly data into human-friendly text. Dates become "3 hours ago." Enums become "Order Status." File sizes become "1.2 GB." And it does it all in one method call.

```bash
dotnet add package Humanizer
```

## String Manipulation

### Casing Conversions

```csharp
using Humanizer;

"some_database_column".Pascalize();      // "SomeDatabaseColumn"
"SomeDatabaseColumn".Underscore();       // "some_database_column"
"some-css-class".Pascalize();            // "SomeCssClass"
"SomeClassName".Kebaberize();            // "some-class-name"
"SomeClassName".Camelize();              // "someClassName"
"SomeClassName".Titleize();              // "Some Class Name"
"SomeClassName".Humanize();              // "Some class name"
```

### Before and After

```csharp
// Before Humanizer
public static string PascalToTitle(string input)
{
    return Regex.Replace(input, "([A-Z])", " $1").Trim();
}

// After Humanizer
"OrderStatusHistory".Humanize();  // "Order status history"
"OrderStatusHistory".Titleize();  // "Order Status History"
```

### Truncation

```csharp
"A very long string that needs to be cut short".Truncate(20);
// "A very long strin..."

"A very long string".Truncate(20, Truncator.FixedNumberOfWords);
// "A very long..."

"A very long string".Truncate(20, "---");
// "A very long stri---"
```

### Pluralization

```csharp
"person".Pluralize();           // "people"
"man".Pluralize();              // "men"
"child".Pluralize();            // "children"
"octopus".Pluralize();          // "octopi"

"people".Singularize();         // "person"
"mice".Singularize();           // "mouse"

// With count
"item".ToQuantity(0);           // "0 items"
"item".ToQuantity(1);           // "1 item"
"item".ToQuantity(42);          // "42 items"
"person".ToQuantity(5);         // "5 people"

// Without number
"item".ToQuantity(0, ShowQuantityAs.None);  // "items"
```

## Dates and Times

### Relative Time (Time Ago)

```csharp
DateTime.UtcNow.AddHours(-1).Humanize();           // "an hour ago"
DateTime.UtcNow.AddDays(-3).Humanize();             // "3 days ago"
DateTime.UtcNow.AddMonths(-2).Humanize();           // "2 months ago"
DateTime.UtcNow.AddMinutes(30).Humanize();          // "30 minutes from now"
DateTime.UtcNow.AddSeconds(-45).Humanize();         // "45 seconds ago"

// DateTimeOffset works too
DateTimeOffset.UtcNow.AddHours(-5).Humanize();      // "5 hours ago"
```

### Before and After

```csharp
// Before Humanizer
public static string TimeAgo(DateTime date)
{
    var span = DateTime.UtcNow - date;
    if (span.TotalMinutes < 1) return "just now";
    if (span.TotalMinutes < 60) return $"{(int)span.TotalMinutes} minutes ago";
    if (span.TotalHours < 24) return $"{(int)span.TotalHours} hours ago";
    if (span.TotalDays < 30) return $"{(int)span.TotalDays} days ago";
    // ... more cases
    return date.ToString("d");
}

// After Humanizer
date.Humanize(); // That's it. Handles all edge cases.
```

### Precision Control

```csharp
var ts = new TimeSpan(days: 3, hours: 5, minutes: 30, seconds: 15);

ts.Humanize();                     // "3 days"
ts.Humanize(precision: 2);        // "3 days, 5 hours"
ts.Humanize(precision: 3);        // "3 days, 5 hours, 30 minutes"

ts.Humanize(maxUnit: TimeUnit.Hour);    // "77 hours"
ts.Humanize(minUnit: TimeUnit.Minute);  // "3 days, 5 hours, 30 minutes"
```

### Fluent TimeSpan

```csharp
// Readable time constants
var cacheDuration = 2.Hours();
var timeout = 30.Seconds();
var retryDelay = 500.Milliseconds();
var expiry = 7.Days();

// Combine them
var total = 1.Hours() + 30.Minutes();
```

## Numbers

### Ordinals

```csharp
1.Ordinalize();    // "1st"
2.Ordinalize();    // "2nd"
3.Ordinalize();    // "3rd"
11.Ordinalize();   // "11th"
21.Ordinalize();   // "21st"
103.Ordinalize();  // "103rd"
```

### Number to Words

```csharp
1.ToWords();        // "one"
42.ToWords();       // "forty-two"
1000.ToWords();     // "one thousand"
123456.ToWords();   // "one hundred and twenty-three thousand four hundred and fifty-six"

// Ordinal words
1.ToOrdinalWords();   // "first"
2.ToOrdinalWords();   // "second"
21.ToOrdinalWords();  // "twenty-first"
```

### Roman Numerals

```csharp
1.ToRoman();     // "I"
4.ToRoman();     // "IV"
42.ToRoman();    // "XLII"
2026.ToRoman();  // "MMXXVI"

// And back
"XLII".FromRoman();  // 42
```

### Metric Notation

```csharp
1_000.ToMetric();        // "1k"
1_000_000.ToMetric();    // "1M"
1_500.ToMetric();        // "1.5k"
0.001.ToMetric();        // "1m"
```

## Byte Sizes

```csharp
// From number to human-readable
long fileSizeBytes = 1_573_741_824;
fileSizeBytes.Bytes().Humanize();           // "1.47 GB"
fileSizeBytes.Bytes().Humanize("MB");       // "1500.75 MB"

// Fluent construction
var size = 1.5.Gigabytes();
size.Humanize();                             // "1.5 GB"
size.Megabytes;                              // 1536.0
size.Bytes;                                  // 1610612736.0

// From parts
var total = 500.Megabytes() + 250.Megabytes();
total.Humanize();                            // "750 MB"
```

### Before and After

```csharp
// Before Humanizer
public static string FormatFileSize(long bytes)
{
    string[] sizes = { "B", "KB", "MB", "GB", "TB" };
    int order = 0;
    double size = bytes;
    while (size >= 1024 && order < sizes.Length - 1)
    {
        order++;
        size /= 1024;
    }
    return $"{size:0.##} {sizes[order]}";
}

// After Humanizer
bytes.Bytes().Humanize(); // Done.
```

## Enums

```csharp
public enum OrderStatus
{
    PendingApproval,
    InProgress,
    ReadyForShipment,
    OutForDelivery,
    DeliveredSuccessfully
}

OrderStatus.PendingApproval.Humanize();       // "Pending approval"
OrderStatus.ReadyForShipment.Humanize();      // "Ready for shipment"
OrderStatus.DeliveredSuccessfully.Humanize(); // "Delivered successfully"

// With Description attribute
public enum Priority
{
    [Description("Low Priority")]
    Low,
    [Description("Medium Priority")]
    Medium,
    [Description("High Priority - Urgent")]
    High
}

Priority.High.Humanize(); // "High Priority - Urgent" (uses Description)
```

### Dehumanize (String to Enum)

```csharp
"Pending approval".DehumanizeTo<OrderStatus>();  // OrderStatus.PendingApproval
```

## Collections

```csharp
var items = new[] { "Alice", "Bob", "Charlie" };

items.Humanize();                    // "Alice, Bob, and Charlie"
items.Humanize("or");               // "Alice, Bob, or Charlie"

new[] { "Alice" }.Humanize();       // "Alice"
new[] { "Alice", "Bob" }.Humanize(); // "Alice and Bob"
```

## Localization

Humanizer supports 40+ languages:

```csharp
using Humanizer;
using System.Globalization;

// German
Thread.CurrentThread.CurrentUICulture = new CultureInfo("de");
DateTime.UtcNow.AddHours(-3).Humanize();  // "vor 3 Stunden"
1.ToOrdinalWords();                        // "erste"

// Spanish
Thread.CurrentThread.CurrentUICulture = new CultureInfo("es");
DateTime.UtcNow.AddDays(-2).Humanize();   // "hace 2 días"

// Japanese
Thread.CurrentThread.CurrentUICulture = new CultureInfo("ja");
DateTime.UtcNow.AddHours(-5).Humanize();  // "5 時間前"
```

## Real-World Examples

### API Response Formatting

```csharp
public class OrderResponse
{
    public string OrderId { get; set; }
    public string Status { get; set; }
    public string LastUpdated { get; set; }
    public string TotalSize { get; set; }

    public static OrderResponse FromOrder(Order order)
    {
        return new OrderResponse
        {
            OrderId = order.Id.ToString(),
            Status = order.Status.Humanize(),
            LastUpdated = order.UpdatedAt.Humanize(),
            TotalSize = order.DataSizeBytes.Bytes().Humanize()
        };
    }
}
// Output: { Status: "Ready for shipment", LastUpdated: "2 hours ago", TotalSize: "1.5 GB" }
```

### CLI Output

```csharp
Console.WriteLine($"Processing {fileCount} {"file".ToQuantity(fileCount)}...");
Console.WriteLine($"Estimated time: {estimatedTime.Humanize(precision: 2)}");
Console.WriteLine($"Total size: {totalBytes.Bytes().Humanize()}");
// Output:
// Processing 42 files...
// Estimated time: 3 minutes, 15 seconds
// Total size: 2.3 GB
```

### Log Messages

```csharp
logger.LogInformation(
    "Processed {Position} batch ({Size}) in {Duration}",
    batchNumber.Ordinalize(),                  // "3rd"
    processedBytes.Bytes().Humanize(),         // "45.2 MB"
    elapsed.Humanize(precision: 2));           // "1 minute, 23 seconds"
```

## Performance

Humanizer is designed for display formatting, not hot paths. For most use cases, performance is not a concern:

```csharp
// Humanizer operations are typically < 1μs
// Fine for: API responses, logging, CLI output, UI display
// Avoid in: tight loops processing millions of items

// If you need high-performance formatting in a hot path,
// use string interpolation or Span<char> directly
```

## Conclusion

Humanizer eliminates dozens of small utility methods that every project ends up writing. Instead of `FormatFileSize()`, `TimeAgo()`, `PascalToWords()`, and `Pluralize()` scattered across your codebase, you get a single, well-tested, localized library.

Install it. Use it everywhere. Your users (and your code reviewers) will thank you.

---

*What's your favorite Humanizer feature? Any use cases I missed? Share below!*
