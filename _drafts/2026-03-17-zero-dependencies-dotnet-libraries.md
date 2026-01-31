---
title: "Zero Dependencies: Building Lean .NET Libraries"
excerpt: >-
  "How I built WorkflowForge with zero core dependencies - and why it matters for your library consumers."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - C#
  - .NET
  - Library Design
  - NuGet
  - WorkflowForge
  - ILRepack
  - Dependencies
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Why Zero Dependencies?

When you add a NuGet package to your project, you're not just adding that package - you're adding its entire dependency tree. And dependency trees grow in ways that cause real pain.

**Version conflicts:** Package A needs Newtonsoft.Json 12.x. Package B needs Newtonsoft.Json 13.x. Now you're stuck with binding redirects, runtime failures, or choosing which package to abandon.

**Transitive dependency hell:** You install a "simple" logging package with 3 dependencies. Each of those has 4 dependencies. Suddenly your project references 50 packages you've never heard of. Any of them can break your build with a minor version bump.

**Security vulnerabilities:** Every dependency is a potential attack surface. When a CVE drops for a transitive dependency three levels deep, you're at the mercy of every maintainer in the chain to release updates.

**Upgrade friction:** The more dependencies your library has, the harder it is for consumers to upgrade. They need to resolve conflicts with their existing packages, test compatibility, and hope nothing breaks.

For library authors, this creates a simple truth: every dependency you add is a burden on your consumers. The question isn't "is this dependency useful?" but "is it useful enough to justify the cost?"

## The WorkflowForge Philosophy

When I designed [WorkflowForge](https://github.com/animatlabs/workflow-forge), I adopted a simple principle: **the core library should have zero dependencies**. None. Not even the popular, "everyone uses them" packages.

This might sound extreme, but consider what workflow orchestration actually needs at its core:
- Define a sequence of operations
- Execute them in order
- Handle failures and compensation
- Track state

None of these require third-party packages. The .NET Base Class Library provides everything needed: collections, async/await, cancellation tokens, exception handling. Why add dependencies for functionality you can build with what's already there?

The philosophy extends further: **Start with zero, add capabilities as separate packages.** Need Polly integration? Add `WorkflowForge.Extensions.Resilience.Polly`. Need OpenTelemetry? Add `WorkflowForge.Extensions.Observability.OpenTelemetry`. The core stays lean.

## How I Achieved Zero Dependencies

### Step 1: Question Every Dependency

For each potential dependency, I asked three questions:

1. **What specific functionality do I need?** Usually, it's a small subset of what the package offers.
2. **Can I implement this functionality myself?** Often, yes - and in fewer lines than you'd think.
3. **Is the maintenance burden of implementing it myself greater than the dependency burden?** Sometimes the answer is yes, and that's okay.

**Examples of dependencies I considered but rejected:**

| Package | Why I Considered It | Why I Rejected It |
|---------|---------------------|-------------------|
| Newtonsoft.Json | State serialization | System.Text.Json in BCL |
| Polly | Resilience patterns | Core doesn't need resilience - extensions can add it |
| Serilog | Logging | Abstractions exist; extensions can add implementations |
| FluentValidation | Input validation | Simple validation doesn't need a framework |

The key insight: libraries often do too much. You don't need Newtonsoft.Json's full feature set just to serialize a simple state object.

### Step 2: Inline What You Need

Sometimes you need functionality that exists in a package, but only a tiny piece of it. In these cases, consider inlining the code.

For example, I needed a simple object pool for reusing operation contexts. Instead of adding `Microsoft.Extensions.ObjectPool`:

```csharp
// Simple object pool - ~30 lines instead of a dependency
internal sealed class SimplePool<T> where T : class, new()
{
    private readonly ConcurrentBag<T> _pool = new();
    private readonly int _maxSize;
    
    public SimplePool(int maxSize = 100)
    {
        _maxSize = maxSize;
    }
    
    public T Rent()
    {
        return _pool.TryTake(out var item) ? item : new T();
    }
    
    public void Return(T item)
    {
        if (_pool.Count < _maxSize)
        {
            _pool.Add(item);
        }
    }
}
```

This isn't as feature-complete as the official package, but it's exactly what I needed - nothing more, nothing less.

**Guidelines for inlining:**
- Only for stable, well-understood code
- Keep it internal (implementation detail, not public API)
- Document the source if derived from elsewhere
- Consider maintenance burden vs. dependency burden

### Step 3: ILRepack for Extensions

For extension packages that genuinely need third-party dependencies (Polly, Serilog, OpenTelemetry), I use [ILRepack](https://github.com/gluck/il-repack) to internalize the dependencies.

ILRepack merges assemblies, making the dependency internal to your package. Consumers don't see it, can't conflict with it, and don't need to manage it.

```xml
<!-- In .csproj -->
<PackageReference Include="ILRepack.Lib.MSBuild.Task" Version="2.0.18.2" PrivateAssets="all" />
<PackageReference Include="Polly.Core" Version="8.0.0" PrivateAssets="all" />

<Target Name="ILRepack" AfterTargets="Build" Condition="'$(Configuration)' == 'Release'">
  <ItemGroup>
    <InputAssemblies Include="$(TargetDir)Polly.Core.dll" />
  </ItemGroup>
  
  <ILRepack 
    OutputType="$(OutputType)"
    MainAssembly="$(TargetPath)"
    OutputAssembly="$(TargetPath)"
    InputAssemblies="@(InputAssemblies)"
    Internalize="true"
    InternalizeExcludeAssemblies="Microsoft.*;System.*" />
</Target>
```

After ILRepack runs, `WorkflowForge.Extensions.Resilience.Polly.dll` contains Polly's code, but with internal visibility. The consumer's project can use any version of Polly they want - there's no conflict because our internalized version is invisible.

## The Extension Pattern

The result is a clean architecture where the core is dependency-free and extensions add capabilities:

```
WorkflowForge (core)          → 0 dependencies
├── WorkflowForge.Testing     → 0 dependencies
├── WorkflowForge.Extensions.Logging.Serilog → Serilog internalized
├── WorkflowForge.Extensions.Resilience.Polly → Polly internalized
└── WorkflowForge.Extensions.Observability.OpenTelemetry → OTel internalized
```

Consumers get exactly what they need:
- Just orchestration? Install the core package.
- Need resilience? Add the Polly extension.
- Need observability? Add the OpenTelemetry extension.

Each addition is explicit and opt-in. No surprise dependencies, no version conflicts.

## Trade-offs and Lessons Learned

Zero dependencies isn't free. Here are the trade-offs I've accepted:

**More maintenance:** When I inline code, I own it. Bug fixes and security patches are my responsibility. I can't just bump a package version.

**No automatic updates:** When Polly v9 ships with amazing new features, my internalized v8 doesn't magically upgrade. I need to explicitly update, retest, and release.

**Build complexity:** ILRepack adds build steps and can occasionally cause issues with certain assembly patterns. Debugging internalized code is harder.

**Feature gaps:** My inlined implementations are deliberately minimal. They don't have every feature of the full packages. This is usually fine, but occasionally limiting.

**Lessons I've learned:**

1. **Test internalized assemblies thoroughly.** ILRepack can subtly break things, especially with reflection-heavy code.

2. **Version your extensions independently.** When you update internalized Polly from v8 to v9, the extension version should reflect that.

3. **Document the internalized versions.** Consumers should know what version of Polly is inside the extension, even if they can't see it.

4. **Keep the core truly minimal.** Every time I'm tempted to add "just one" dependency to the core, I remind myself of the philosophy.

## When Zero Dependencies Makes Sense

This approach isn't for everyone or everything. Here's my framework:

| Scenario | Zero Deps? | Why |
|----------|------------|-----|
| Core library | Yes | Maximum consumer flexibility |
| Application code | No | You control the whole stack anyway |
| Framework integration | Extensions | Keep core lean, add capabilities separately |
| Utility libraries | Maybe | Depends on how fundamental they are |
| Internal team packages | Usually no | Version conflicts are manageable within one team |

**Zero dependencies makes the most sense when:**
- You're building a library for public consumption
- You expect diverse consumers with different dependency stacks
- You want to minimize upgrade friction
- You value long-term stability over feature velocity

**Zero dependencies is overkill when:**
- You're building an application
- You control all the consuming code
- The dependency is truly foundational (e.g., Microsoft.Extensions.Logging.Abstractions)
- The implementation complexity far exceeds the dependency cost

## Conclusion

Building zero-dependency libraries is harder than just adding packages. It requires discipline, careful API design, and willingness to implement functionality yourself.

But for library authors, the benefits compound over time. Consumers can upgrade confidently. Version conflicts disappear. The package footprint stays small. Your library becomes the reliable foundation that other packages can build on without worry.

Start with zero. Add dependencies only when the cost of not adding them exceeds the cost of adding them. And when you must depend on something, consider the extension pattern to keep the core clean.

**WorkflowForge source code:** [GitHub](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

---

*Building your own library? I'd love to hear about your dependency strategy in the comments!*
