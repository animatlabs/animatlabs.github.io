---
title: "HTMX with .NET: SPAs Are Overrated"
excerpt: >-
  "What if you could have interactive UIs without the JavaScript framework complexity? HTMX brings the simplicity back—here's how to use it with ASP.NET Core."
categories:
  - Technical
  - .NET
  - Web Development
tags:
  - .NET
  - HTMX
  - ASP.NET Core
  - Web Development
  - Frontend
  - Hypermedia
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The SPA Fatigue

React, Vue, Angular—we've spent a decade building increasingly complex JavaScript applications. But what if the simplicity of server-rendered HTML never needed to leave?

HTMX is a library that lets you add modern interactivity to server-rendered pages using HTML attributes. No build step. No JavaScript framework. Just HTML that does more.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. What is HTMX (hypermedia-driven applications)
2. Why it's gaining momentum (counter-trend to SPA complexity)
3. HTMX + ASP.NET Core Razor Pages
4. Common patterns
   - Partial updates
   - Infinite scroll
   - Form validation
   - Modal dialogs
5. When to use HTMX vs when you still need a SPA
6. Performance comparison

CODE EXAMPLES:
- Basic HTMX attributes (hx-get, hx-post, hx-target, hx-swap)
- ASP.NET Core controller returning partial views
- Real-time search with HTMX
- Form submission with validation
-->

## What Is HTMX?

<!-- TODO: Hypermedia-driven applications, HTML attributes, no JS required -->

## The Philosophy

<!-- TODO: HTML as the engine of application state, HATEOAS principles -->

## Setting Up HTMX with ASP.NET Core

```html
<!-- Add HTMX via CDN -->
<script src="https://unpkg.com/htmx.org@2.0.0"></script>
```

## Core Patterns

### Partial Page Updates

```html
<!-- TODO: hx-get, hx-target, hx-swap examples -->
<button hx-get="/api/users" hx-target="#user-list" hx-swap="innerHTML">
    Load Users
</button>
<div id="user-list"></div>
```

```csharp
// TODO: ASP.NET Core controller returning partial view
```

### Real-Time Search

```html
<!-- TODO: Search with debounce -->
```

### Form Validation

```html
<!-- TODO: Server-side validation with HTMX -->
```

## When to Use HTMX vs SPA

| Use Case | HTMX | SPA (React/Vue) |
|----------|------|-----------------|
| Content sites | ✅ | Overkill |
| Admin dashboards | ✅ | Optional |
| Real-time collaboration | ❌ | ✅ |
| Offline-first apps | ❌ | ✅ |
| Complex state management | ❌ | ✅ |

## Performance Comparison

<!-- TODO: Bundle size, time to interactive, server load -->

## Conclusion

<!-- TODO: HTMX for simplicity, SPAs when truly needed -->

---

*Have you tried HTMX in your projects? Share your experience in the comments!*
