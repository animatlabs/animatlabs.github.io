---
title: "Testing Workflow Libraries: FakeWorkflowFoundry Design"
excerpt: >-
  "How to make workflow libraries testable - with WorkflowForge as the example."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - WorkflowForge
  - Testing
  - Unit Tests
  - Mocking
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

## Testing Challenges

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"Testing workflow operations was painful. IWorkflowFoundry had 15+ methods, 
creating mocks was tedious, and tests were brittle. So I built FakeWorkflowFoundry—a 
test double that makes workflow testing trivial."

Include:
- Real problem: Why testing workflows is hard
- The complexity of mocking IWorkflowFoundry
- What made tests brittle
- The pain points developers face when testing workflow operations
-->

### The Problem with Mocking IWorkflowFoundry

<!-- 
TODO: Explain why mocking IWorkflowFoundry is difficult
Include:
- IWorkflowFoundry has many methods (GetProperty, SetProperty, Logger, etc.)
- Tests become verbose with all the mock setup
- Brittle tests that break when interfaces change
- Hard to verify workflow state changes
- Examples of what bad tests look like
-->

```csharp
// TODO: Add example of verbose mock setup
[Fact]
public async Task Operation_WithMockFoundry_IsVerbose()
{
    // This is what we DON'T want
    var mockFoundry = new Mock<IWorkflowFoundry>();
    var mockLogger = new Mock<ILogger>();
    mockFoundry.Setup(f => f.Logger).Returns(mockLogger.Object);
    mockFoundry.Setup(f => f.GetProperty<string>("Key")).Returns("Value");
    mockFoundry.Setup(f => f.SetProperty("Key", It.IsAny<object>()));
    // ... 10 more setup calls
    
    var operation = new MyOperation();
    await operation.ForgeAsync(null, mockFoundry.Object, CancellationToken.None);
    
    // Verification is also verbose
    mockFoundry.Verify(f => f.SetProperty("Result", It.IsAny<object>()), Times.Once);
}
```

### What Makes Workflow Testing Hard

<!-- 
TODO: List specific challenges
Include:
- Workflow state management (properties, context)
- Dependency injection in workflow context
- Async execution patterns
- Error handling and compensation
- Verifying execution order
- Testing parallel operations
-->

## FakeWorkflowFoundry Design

<!-- 
TODO: Explain the design of FakeWorkflowFoundry
Include:
- What is a fake vs mock vs stub
- Why a fake was chosen over mocks
- Design principles (simplicity, in-memory state, no external dependencies)
- How it implements IWorkflowFoundry
-->

### Design Principles

<!-- 
TODO: Explain the core design principles
Include:
- In-memory state management (dictionary for properties)
- Real logger (or test logger) instead of mocks
- No external dependencies
- Thread-safe for parallel operation testing
- Easy to inspect and verify state
-->

### Core Implementation

<!-- 
TODO: Show the core implementation structure
Include:
- How properties are stored (Dictionary<string, object>)
- How logger is handled
- How execution tracking works
- Thread-safety considerations
-->

```csharp
// TODO: Add example showing FakeWorkflowFoundry structure
public class FakeWorkflowFoundry : IWorkflowFoundry
{
    private readonly Dictionary<string, object> _properties = new();
    private readonly List<string> _executedOperations = new();
    
    public ILogger Logger { get; }
    
    public T? GetProperty<T>(string key)
    {
        return _properties.TryGetValue(key, out var value) ? (T?)value : default;
    }
    
    public void SetProperty(string key, object? value)
    {
        if (value == null)
            _properties.Remove(key);
        else
            _properties[key] = value;
    }
    
    // Additional methods for testability
    public IReadOnlyDictionary<string, object> Properties => _properties;
    public IReadOnlyList<string> ExecutedOperations => _executedOperations;
}
```

## Usage Examples

<!-- 
TODO: Show practical examples of using FakeWorkflowFoundry
Include:
- Basic operation testing
- Testing with properties
- Testing error handling
- Testing parallel operations
- Testing workflow state changes
-->

### Basic Operation Test

<!-- 
TODO: Show a simple test example
Include:
- Creating FakeWorkflowFoundry
- Executing operation
- Verifying results
- How much simpler it is than mocking
-->

```csharp
// TODO: Add complete test example
[Fact]
public async Task Operation_ProcessesData_Successfully()
{
    // Arrange
    var foundry = new FakeWorkflowFoundry();
    var operation = new ProcessDataOperation();
    
    // Act
    var result = await operation.ForgeAsync("input", foundry, CancellationToken.None);
    
    // Assert
    Assert.Equal("processed", result);
    Assert.True(foundry.Properties.ContainsKey("ProcessedAt"));
}
```

### Testing Property Management

<!-- 
TODO: Show how to test property get/set
Include:
- Setting properties before execution
- Verifying properties after execution
- Testing property updates
-->

```csharp
// TODO: Add example testing properties
[Fact]
public async Task Operation_UsesExistingProperty()
{
    var foundry = new FakeWorkflowFoundry();
    foundry.SetProperty("UserId", 12345);
    
    var operation = new UserOperation();
    await operation.ForgeAsync(null, foundry, CancellationToken.None);
    
    var userId = foundry.GetProperty<int>("UserId");
    Assert.Equal(12345, userId);
}
```

### Testing Error Handling

<!-- 
TODO: Show how to test error scenarios
Include:
- Testing OnErrorAsync hook
- Verifying error state
- Testing compensation logic
-->

```csharp
// TODO: Add example testing error handling
[Fact]
public async Task Operation_HandlesError_LogsAndSetsProperty()
{
    var foundry = new FakeWorkflowFoundry();
    var operation = new FailingOperation();
    
    await Assert.ThrowsAsync<InvalidOperationException>(
        () => operation.ForgeAsync(null, foundry, CancellationToken.None));
    
    Assert.True(foundry.Properties.ContainsKey("ErrorOccurred"));
    Assert.True(foundry.Logger.LogEntries.Any(e => e.Level == LogLevel.Error));
}
```

### Testing Parallel Operations

<!-- 
TODO: Show how to test parallel execution
Include:
- Testing concurrent operations
- Verifying thread-safety
- Testing race conditions
-->

```csharp
// TODO: Add example testing parallel operations
[Fact]
public async Task ParallelOperations_ExecuteConcurrently()
{
    var foundry = new FakeWorkflowFoundry();
    var operations = new[] 
    { 
        new OperationA(), 
        new OperationB(), 
        new OperationC() 
    };
    
    await Task.WhenAll(operations.Select(op => 
        op.ForgeAsync(null, foundry, CancellationToken.None)));
    
    Assert.Equal(3, foundry.ExecutedOperations.Count);
}
```

## Best Practices

<!-- 
TODO: Share best practices for testing workflows
Include:
- When to use FakeWorkflowFoundry vs real foundry
- How to structure workflow tests
- What to verify in tests
- Common pitfalls to avoid
- Integration vs unit testing strategies
-->

### Test Structure

<!-- 
TODO: Explain how to structure workflow tests
Include:
- Arrange-Act-Assert pattern
- Setting up initial state
- Verifying outcomes
- Testing edge cases
-->

### What to Verify

<!-- 
TODO: List what should be verified in workflow tests
Include:
- Operation output
- Property changes
- Logger calls
- Execution order (if relevant)
- Error handling
-->

### Common Pitfalls

<!-- 
TODO: List common mistakes when testing workflows
Include:
- Not resetting state between tests
- Testing implementation details instead of behavior
- Over-mocking
- Not testing error paths
- Ignoring async/await patterns
-->

### Integration vs Unit Testing

<!-- 
TODO: Explain when to use FakeWorkflowFoundry vs integration tests
Include:
- Unit tests with FakeWorkflowFoundry for operation logic
- Integration tests with real foundry for workflow orchestration
- When each approach is appropriate
-->

## Conclusion

<!-- 
TODO: Summarize with your personal takeaway
What's your takeaway? What should readers learn from this?
Include:
- Key points to remember
- Benefits of FakeWorkflowFoundry approach
- When to use fakes vs mocks
- Resources for further learning
-->

**You can access the example code from my** [GitHub Repo](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

---

*How do you test your workflow operations? Share your approach in the comments!*
