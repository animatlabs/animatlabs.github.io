---
title: "Workflow Orchestration: Build vs Buy vs DIY"
excerpt: >-
  "When to use Elsa, when to use Workflow Core, and when to build your own."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - WorkflowForge
  - Elsa
  - Workflow Core
  - Architecture
  - Decision Making
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST:
Before publishing, verify this post provides unique value:
- [ ] Includes personal experience or lessons learned
- [ ] Uses original examples, not copied from docs
- [ ] Provides insights not easily found elsewhere
- [ ] Benchmarks are from your own testing (if applicable)
- [ ] Recommendations are based on real-world usage

TARGET: ~1,500 words
REQUIRES: Decision framework, comparison table, WorkflowForge mention
-->

## The Workflow Library Decision

<!-- 
TODO: Introduce the challenge of choosing a workflow library
- Many options exist: Elsa, Workflow Core, Temporal, custom solutions
- Each has different trade-offs
- Wrong choice can be costly
-->

When you need workflow orchestration in .NET, you face a fundamental question: should you use an established library, build something custom, or find a middle ground?

I've tried all three approaches across different projects. Here's the framework I use to decide.

## Options Overview

### Commercial/Full-Featured: Elsa Workflows

<!-- 
TODO: Describe Elsa's approach
- Visual designer, persistence, versioning
- Pros: Full-featured, active development
- Cons: Complexity, learning curve, potentially overkill
-->

```csharp
// TODO: Add Elsa workflow definition example
```

### Lightweight Library: Workflow Core

<!-- 
TODO: Describe Workflow Core
- Simpler than Elsa, code-first
- Pros: Lighter weight, easier to understand
- Cons: Less active maintenance, fewer features
-->

```csharp
// TODO: Add Workflow Core example
```

### Minimal Library: WorkflowForge

<!-- 
TODO: Describe WorkflowForge positioning
- Zero dependencies, extensible
- Pros: Minimal overhead, full control
- Cons: Fewer built-in features
-->

```csharp
// Example: WorkflowForge minimal workflow
var workflow = WorkflowForge.CreateWorkflow("ProcessOrder")
    .AddOperation(new ValidateOrderOperation())
    .AddOperation(new ChargePaymentOperation())
    .WithCompensation(new RefundPaymentOperation())
    .AddOperation(new CreateShipmentOperation())
    .Build();

using var smith = WorkflowForge.CreateSmith();
var result = await smith.ForgeAsync(workflow, order);
```

### DIY: Custom Implementation

<!-- 
TODO: When custom makes sense
- Very specific requirements
- When libraries don't fit
- When you need full control
-->

## Decision Framework

<!-- 
TODO: Create a decision tree or flowchart
- Questions to ask:
  1. Do you need a visual designer?
  2. Do you need long-running workflows?
  3. How complex is your workflow logic?
  4. What's your team's capacity to learn new tools?
  5. Do you need audit trails and versioning?
-->

### Question 1: Do You Need a Visual Designer?

<!-- 
TODO: Discuss when visual designers matter
- Business users defining workflows
- Complex branching that's hard to visualize in code
- If yes → Elsa or commercial
-->

### Question 2: Long-Running Workflows?

<!-- 
TODO: Discuss durability requirements
- Workflows that span hours/days/weeks
- Need to survive restarts
- If yes → Need persistence layer
-->

### Question 3: Complexity Level?

<!-- 
TODO: Discuss complexity spectrum
- Simple: Sequential steps → WorkflowForge or DIY
- Medium: Branching, retries → WorkflowForge with extensions
- Complex: Parallel execution, human tasks → Elsa/Temporal
-->

## When WorkflowForge Fits

<!-- 
TODO: Specific scenarios where WorkflowForge is the right choice
- Microservices needing saga patterns
- When you want zero dependencies in your core
- When you need testable workflows
- When commercial solutions are overkill
-->

**Best for:**
- Saga pattern implementation
- Simple-to-medium workflow complexity
- Projects prioritizing minimal dependencies
- Teams who want full code control

**Not ideal for:**
- Visual workflow designers
- Very long-running workflows (weeks+)
- Heavy parallel execution requirements

## Comparison Table

<!-- 
TODO: Complete comparison matrix
-->

| Criteria | Elsa | Workflow Core | WorkflowForge | DIY |
|----------|------|---------------|---------------|-----|
| Visual Designer | ✅ | ❌ | ❌ | ❌ |
| Persistence | ✅ | ✅ | Extension | Build |
| Compensation | ✅ | ❌ | ✅ | Build |
| Dependencies | Many | Some | Zero | Your choice |
| Learning Curve | High | Medium | Low | Low |
| Long-running | ✅ | ✅ | Extension | Build |
| Active Maintenance | ✅ | ⚠️ | ✅ | N/A |

## Real-World Scenarios

### Scenario 1: E-commerce Order Processing

<!-- 
TODO: Walk through a real decision process
- Requirements: Sequential steps, compensation, moderate complexity
- Decision: WorkflowForge fits well
-->

### Scenario 2: Document Approval System

<!-- 
TODO: Different scenario requiring different solution
- Requirements: Human tasks, visual status, long waits
- Decision: Elsa or commercial solution
-->

### Scenario 3: Data Pipeline

<!-- 
TODO: Another scenario
- Requirements: Simple sequential processing, high throughput
- Decision: Channels or simple custom solution
-->

## Migration Paths

<!-- 
TODO: How to migrate between solutions
- Starting simple and growing
- When to know you need to move up
- How WorkflowForge extensions help grow without replacing
-->

## Conclusion

<!-- 
TODO: Summarize the decision framework
- No universal answer
- Match tool to requirements
- Start simple, grow as needed
-->

The right workflow library depends on your specific needs. Start with the simplest solution that meets your requirements, and choose tools that allow you to grow without complete rewrites.

For many microservices scenarios, especially saga patterns, [WorkflowForge](https://github.com/animatlabs/workflow-forge) offers the right balance: minimal overhead, extensibility, and testability.

---

*Need help choosing? Share your requirements in the comments!*
