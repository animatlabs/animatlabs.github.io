---
title: "How I Built Lifecycle Hooks in WorkflowForge"
excerpt: >-
  "Behind-the-scenes technical decisions for workflow lifecycle management."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - WorkflowForge
  - Workflow
  - Design
  - Open Source
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST (from your plan):
- [ ] Does this include a real problem I faced?
- [ ] Did I run the examples myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,200-1,500 words
-->

## Why Lifecycle Hooks?

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After building WorkflowForge 1.0, users kept asking for setup and teardown logic. 
Middleware wasn't enough—they needed hooks that ran before and after each operation. 
Here's how I solved it."

Include:
- Real scenario: What problem did lifecycle hooks solve?
- Why middleware wasn't sufficient
- User feedback/requests that led to this feature
- The pain points users were experiencing
-->

## Design Decisions

<!-- 
TODO: Explain the key design decisions made when implementing lifecycle hooks
Include:
- Why hooks instead of middleware for operation-level logic
- The decision to use virtual methods vs interfaces
- Why OnBeforeExecuteAsync, OnAfterExecuteAsync, and OnErrorAsync
- How hooks integrate with the existing workflow execution model
- Trade-offs considered (performance, flexibility, complexity)
-->

### Virtual Methods vs Interface Segregation

<!-- 
TODO: Explain why virtual methods were chosen
Include:
- Comparison with interface-based approach
- Benefits of virtual methods (optional implementation, base class convenience)
- How it maintains backward compatibility
- Code example showing the base class structure
-->

```csharp
// TODO: Add example showing WorkflowOperationBase with lifecycle hooks
public abstract class WorkflowOperationBase : IWorkflowOperation
{
    protected virtual Task OnBeforeExecuteAsync(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        return Task.CompletedTask;
    }

    protected abstract Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct);

    protected virtual Task OnAfterExecuteAsync(
        object? inputData, object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        return Task.CompletedTask;
    }

    protected virtual Task OnErrorAsync(
        Exception exception, object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        return Task.CompletedTask;
    }
}
```

### Execution Order and Context

<!-- 
TODO: Explain how hooks are executed and what context is available
Include:
- Execution order: OnBeforeExecuteAsync -> ForgeAsyncCore -> OnAfterExecuteAsync
- What happens if OnBeforeExecuteAsync throws
- How OnErrorAsync fits into the flow
- What data is available in each hook (inputData, outputData, foundry)
- How cancellation tokens propagate through hooks
-->

## Implementation

<!-- 
TODO: Show the actual implementation details
Include:
- How the base class orchestrates hook execution
- Error handling strategy
- Performance considerations (async/await patterns)
- How hooks interact with workflow state
- Real code examples from WorkflowForge
-->

### Base Class Orchestration

<!-- 
TODO: Show how WorkflowOperationBase orchestrates hook execution
Include:
- The ForgeAsync method that calls hooks in order
- Exception handling and OnErrorAsync invocation
- How outputData flows from ForgeAsyncCore to OnAfterExecuteAsync
- Cancellation token propagation
-->

```csharp
// TODO: Add example showing the orchestration logic
public async Task<object?> ForgeAsync(
    object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
{
    try
    {
        await OnBeforeExecuteAsync(inputData, foundry, ct);
        var outputData = await ForgeAsyncCore(inputData, foundry, ct);
        await OnAfterExecuteAsync(inputData, outputData, foundry, ct);
        return outputData;
    }
    catch (Exception ex)
    {
        await OnErrorAsync(ex, inputData, foundry, ct);
        throw;
    }
}
```

### Real-World Example: Auditing Operation

<!-- 
TODO: Show a concrete example of using lifecycle hooks
Include:
- An operation that uses OnBeforeExecuteAsync to record start time
- OnAfterExecuteAsync to log duration
- OnErrorAsync to log failures
- How this compares to doing it with middleware
-->

```csharp
// TODO: Add complete example of AuditedOperation
public class AuditedOperation : WorkflowOperationBase
{
    protected override async Task OnBeforeExecuteAsync(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        foundry.SetProperty("StartTime", DateTime.UtcNow);
        foundry.Logger.LogInformation("Starting operation: {OperationName}", GetType().Name);
    }

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        // Actual operation logic here
        return await ProcessAsync(inputData, ct);
    }

    protected override async Task OnAfterExecuteAsync(
        object? inputData, object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var startTime = foundry.GetProperty<DateTime>("StartTime");
        var duration = DateTime.UtcNow - startTime;
        foundry.Logger.LogInformation(
            "Completed operation: {OperationName} in {Duration}ms", 
            GetType().Name, 
            duration.TotalMilliseconds);
    }

    protected override async Task OnErrorAsync(
        Exception exception, object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        foundry.Logger.LogError(
            exception, 
            "Operation failed: {OperationName}", 
            GetType().Name);
    }
}
```

## Lessons Learned

<!-- 
TODO: Share insights and lessons from implementing lifecycle hooks
Include:
- What worked well
- What didn't work as expected
- Performance impact (if any)
- User feedback after release
- Things you'd do differently
- Gotchas to watch out for
-->

### What Worked Well

<!-- 
TODO: List what worked well
Include:
- Virtual methods providing flexibility
- Backward compatibility maintained
- Clean separation of concerns
- Easy to test
-->

### Challenges and Solutions

<!-- 
TODO: Discuss challenges faced
Include:
- Breaking change concerns (ForgeAsync -> ForgeAsyncCore)
- Ensuring hooks don't break workflow execution
- Performance overhead considerations
- How you addressed these challenges
-->

### User Feedback

<!-- 
TODO: Share feedback from users
Include:
- How users are using lifecycle hooks
- Common patterns that emerged
- Unexpected use cases
- Feature requests that came from this
-->

## Conclusion

<!-- 
TODO: Summarize with your personal takeaway
What's your takeaway? What should readers learn from this?
Include:
- Key points to remember
- When to use lifecycle hooks vs middleware
- Best practices
- Resources for further learning
-->

**You can access the example code from my** [GitHub Repo](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

---

*Have you implemented lifecycle hooks in your workflow library? Share your approach in the comments!*
