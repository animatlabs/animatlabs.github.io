---
title: "TimeProvider in .NET 8: Testable Time-Based Code"
excerpt: >-
  "Finally, a built-in abstraction for time. Here's how to use TimeProvider."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - TimeProvider
  - Testing
  - Time
  - .NET 8
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
- [ ] Clear explanation of why TimeProvider is needed
- [ ] Usage patterns: dependency injection, direct usage
- [ ] Testing with FakeTimeProvider: examples and scenarios
- [ ] Refactoring guide: migrating from DateTime.Now/UtcNow
- [ ] Performance considerations and best practices
- [ ] Real-world examples showing before/after
-->

## Why TimeProvider

<!-- TODO: Explain the problem with DateTime.Now/UtcNow -->
<!-- TODO: Testing challenges: flaky tests, time-dependent logic -->
<!-- TODO: Previous workarounds: wrapper interfaces, static time providers -->

```csharp
// TODO: Add example showing the problem
// TODO: Code that uses DateTime.UtcNow directly
// TODO: Show why it's hard to test
```

## Usage Patterns

<!-- TODO: Dependency injection approach -->
<!-- TODO: Direct TimeProvider usage -->
<!-- TODO: TimeProvider.System for production, FakeTimeProvider for tests -->

```csharp
// TODO: Add DI registration example
// TODO: Add service using TimeProvider
// TODO: Show TimeProvider.System usage
```

## Testing with FakeTimeProvider

<!-- TODO: How to use FakeTimeProvider in tests -->
<!-- TODO: Setting time, advancing time, time zones -->
<!-- TODO: Common testing scenarios -->

```csharp
// TODO: Add test examples with FakeTimeProvider
// TODO: Show setting initial time, advancing time
// TODO: Show testing time-dependent logic
```

## Refactoring Existing Code

<!-- TODO: Step-by-step migration guide -->
<!-- TODO: Finding DateTime.Now/UtcNow usage -->
<!-- TODO: Replacing with TimeProvider, updating tests -->

```csharp
// TODO: Add before/after examples
// TODO: Show refactoring process
// TODO: Show test updates
```

## Conclusion

---

*Migrated to TimeProvider? Share your experience!*
