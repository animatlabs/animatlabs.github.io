---
title: "Modular Monolith: Why I'm Not Using Microservices"
excerpt: >-
  "Amazon cut costs by 90% by abandoning microservices. Here's when a modular monolith is the smarter choice—and how to build one in .NET."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - .NET
  - Architecture
  - Modular Monolith
  - Microservices
  - Domain-Driven Design
  - System Design
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Microservices Reality Check

Amazon Prime Video's 2023 revelation shocked the industry: they cut infrastructure costs by 90% and simplified operations by moving from microservices to a monolith. This wasn't a failure—it was architectural wisdom.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. The microservices hangover (distributed complexity, network overhead, operational burden)
2. What is a modular monolith (DDD subdomains as modules, single deployable)
3. When microservices actually make sense (team scale, different scaling needs)
4. Building a modular monolith in .NET 10
   - Project structure
   - Module boundaries with interfaces
   - Internal vs public APIs
   - Database schema per module
5. Migration path: Monolith -> Modular -> Microservices (if needed)
6. Real examples: GitHub, Shopify, Basecamp at scale

CODE EXAMPLES:
- Project structure with separate modules
- Module interface/facade pattern
- Cross-module communication via events
- EF Core with separate DbContexts per module
-->

## What Is a Modular Monolith?

<!-- TODO: Definition, DDD subdomains, single deployment but strong boundaries -->

## The Microservices Tax

<!-- TODO: Network latency, distributed transactions, observability complexity, team coordination -->

## When to Choose Each

<!-- TODO: Decision matrix based on team size, scaling needs, domain complexity -->

## Building a Modular Monolith in .NET 10

### Project Structure

```
src/
├── MyApp.Api/                    # Single entry point
├── MyApp.Shared/                 # Shared kernel (value objects, events)
├── Modules/
│   ├── Orders/
│   │   ├── Orders.Contracts/     # Public interfaces and DTOs
│   │   └── Orders.Core/          # Implementation (internal)
│   ├── Inventory/
│   │   ├── Inventory.Contracts/
│   │   └── Inventory.Core/
│   └── Shipping/
│       ├── Shipping.Contracts/
│       └── Shipping.Core/
```

### Module Boundaries

```csharp
// TODO: Add module facade pattern
// TODO: Add internal implementations
// TODO: Add cross-module event communication
```

### Database Strategy

```csharp
// TODO: Separate DbContext per module
// TODO: Schema separation
// TODO: Cross-module queries via APIs, not direct DB access
```

## Migration Path

<!-- TODO: Start monolith -> Extract modules -> Split to microservices only if needed -->

## Conclusion

<!-- TODO: Summary, when to use this pattern -->

---

*Building a modular monolith or considering the switch from microservices? Share your experience in the comments!*
