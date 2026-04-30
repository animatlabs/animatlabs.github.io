---
title: "Zero Dependencies: Building Lean .NET Libraries"
excerpt: >-
  How I built WorkflowForge with zero core dependencies, and what that buys the people pulling your package.
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

NuGet pulls the whole dependency tree, not just the top package. Trees grow fast, and that's where the pain lands.

**Version conflicts:** Package A wants Newtonsoft.Json 12.x; Package B wants 13.x. Binding redirects, runtime failures, or you drop one package.

**Transitives:** That "simple" logging package hides three dependencies each with four more. Fifty packages you've never audited, any of which can break your build on a minor bump.

**Supply chain noise:** CVEs hit transients deep in the chain. You're waiting on maintainers upstream of upstream.

Library authors owe their consumers honesty: each dependency adds weight. I'd rather ask "is this worth the cost?" than "is it useful?" Useful is cheap on paper.

## The WorkflowForge Philosophy

I designed [WorkflowForge](https://github.com/animatlabs/workflow-forge) with one bar: **the core ships with zero NuGet deps.** Not even the usual suspects everybody argues are "fine."

Orchestration at the center is boring in a good way: ordered steps, failure handling, state. The BCL covers collections, async, cancellation, exceptions. I wasn't going to bolt on packages for that.

**Zero first; capabilities as separate packages.** Want Polly? `WorkflowForge.Extensions.Resilience.Polly`. OpenTelemetry? `WorkflowForge.Extensions.Observability.OpenTelemetry`. The core stays skinny.

## How I Achieved Zero Dependencies

### Step 1: Question Every Dependency

For each candidate package I stuck to three questions:

1. **What slice of behavior do I actually need?** Often it's thin.
2. **Can I ship that slice myself without inventing science?**
3. **Will maintaining my copy hurt more than the dependency would?**

Sometimes the dependency wins. That's allowed.

**Dependencies I weighed and skipped:**

| Package | Why it tempted me | Why I passed |
|---------|-------------------|---------------|
| Newtonsoft.Json | State on disk | `System.Text.Json` is in the box |
| Polly | Retry / circuit-breaker stories | Core doesn't need resilience; extension does |
| Serilog | Structured logs | Interfaces in core; Serilog hangs off an extension |

Full Json.NET wasn't buying me anything if all I serialize is state blobs.

### Step 2: Inline What You Need

Tiny surface area from a big package sometimes deserves a small internal type instead of another reference.

I wanted a tiny pool for operation contexts rather than referencing `Microsoft.Extensions.ObjectPool`:

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

Trade-off is obvious: not feature parity with Microsoft's pool, good enough for my call sites.

**Inlining:** I only copy patterns I understand cold, and I keep them `internal`.

If I borrow, the comment says where it came from. When the duplication tax beats the transitive tax, I rip it out and take the dependency.

### Step 3: ILRepack for Extensions

Extension packages that really need Polly, Serilog, or OpenTelemetry go through [ILRepack](https://github.com/gluck/il-repack). Dependencies get merged-in and marked internal so callers don't collide with versions on their side.

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

After Repack, `WorkflowForge.Extensions.Resilience.Polly.dll` carries Polly internally. Consumers can keep whatever Polly they already use.

## The Extension Pattern

What ships today:

```
WorkflowForge (core)          → 0 dependencies
├── WorkflowForge.Testing     → 0 dependencies
├── WorkflowForge.Extensions.Logging.Serilog → Serilog internalized
├── WorkflowForge.Extensions.Resilience.Polly → Polly internalized
└── WorkflowForge.Extensions.Observability.OpenTelemetry → OTel internalized
```

Core-only stays possible. Need resilience or traces? Pull the matching extension deliberately. Surprise references stay out of default installs.

## Trade-offs and Lessons Learned

Zero deps isn't free.

**Inlining means I nurse the code.** Security and bug fixes land on my release notes, not a bot PR.

**Pinned internals don't auto-upgrade.** Polly jumps to v9? I rebuild, rerun tests, ship a rev.

**ILRepack is another moving part.** Odd reflection behaviors show up sometimes; stepping through merged IL is fiddly.

**What stuck after shipping:** I torture-test merged assemblies before I tag anything.

I'll bump extension semver when the bundled dependency jumps, and paste the pinned versions into the README.

That last bit matters so nobody mentally treats you as floating on "whatever NuGet resolves."

## When Zero Dependencies Makes Sense

Rough map from my notebook:

| Scenario | Zero deps? |
|----------|------------|
| Public library core where stacks vary wildly | Yeah |
| App you own top to bottom | Nah, grab packages |
| Cross-cutting infra (logging, telemetry) | Extension packages |

It pays when strangers install you beside their pile of packages and dread binding hell. Inside one repo with one dotnet version story, obsess less.

Built-in primitives like `Microsoft.Extensions.Logging.Abstractions` can still punch above my hand-rolled stubs. I pick that fight deliberately.

## Why I'm Still Glad I Did It

Zero-dependency cores cost time up front; they repay you when consumers stop opening issues about phantom version wars.

I'll keep shipping lean cores and pushing optional extensions for the heavy friends. Dependency cost has to exceed build-the-small-thing cost or I'm kidding myself.

**WorkflowForge source code:** [GitHub](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

---

*Building your own library? I'd love to hear about your dependency strategy in the comments!*
