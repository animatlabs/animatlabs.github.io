---
title: "Platform Engineering: Build Your Internal Developer Platform"
excerpt: >-
  "DevOps promised freedom. Platform Engineering delivers it. Here's how to build an Internal Developer Platform that developers actually use."
categories:
  - Technical
  - DevOps
  - Platform Engineering
tags:
  - Platform Engineering
  - DevOps
  - Internal Developer Platform
  - Developer Experience
  - Golden Paths
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The DevOps Gap

"You build it, you run it" gave teams autonomy but created chaos. Every team reinvents deployment, observability, and infrastructure. Platform Engineering fills this gap.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. What is Platform Engineering (and why DevOps wasn't enough)
2. Internal Developer Platform (IDP) explained
3. Core components: Golden paths, self-service, templates
4. Building blocks: Backstage, Argo, Crossplane
5. Starting small: MVP approach
6. Measuring success (developer productivity metrics)

CONCEPTS:
- Golden paths (opinionated defaults)
- Self-service infrastructure
- Platform as a product
- Internal customers
-->

## What Is Platform Engineering?

<!-- TODO: Definition, relationship to DevOps, why it emerged -->

## The Internal Developer Platform

An IDP is not just a portal—it's the entire infrastructure layer that enables self-service development.

```
┌─────────────────────────────────────────┐
│             Developer Portal            │
│            (e.g., Backstage)            │
├─────────────────────────────────────────┤
│           Orchestration Layer           │
│     (Templates, Golden Paths, APIs)     │
├─────────────────────────────────────────┤
│          Infrastructure Layer           │
│   (Kubernetes, Cloud, CI/CD, Secrets)   │
└─────────────────────────────────────────┘
```

## Golden Paths

<!-- TODO: Opinionated defaults that work, not mandates -->

```yaml
# Example: Service template
apiVersion: scaffolder.backstage.io/v1beta3
kind: Template
metadata:
  name: dotnet-api-service
  title: .NET API Service
spec:
  # Creates repo, CI/CD, observability, deployment - all configured
```

## Core Building Blocks

### Backstage (Developer Portal)

<!-- TODO: Service catalog, templates, TechDocs -->

### GitOps (Argo CD)

<!-- TODO: Declarative deployments -->

### Infrastructure as Code (Crossplane/Terraform)

<!-- TODO: Self-service infrastructure -->

## Starting Small: The MVP Approach

<!-- TODO: 8-week proof of value, not 2-year waterfall -->

1. Week 1-2: Identify top 3 developer pain points
2. Week 3-4: Build golden path for most common use case
3. Week 5-6: Add self-service for one infrastructure component
4. Week 7-8: Measure, iterate, expand

## Measuring Success

<!-- TODO: DORA metrics, developer satisfaction, time to first deploy -->

## Conclusion

<!-- TODO: Platform as a product, not a project -->

---

*Building an internal platform? Share your approach in the comments!*
