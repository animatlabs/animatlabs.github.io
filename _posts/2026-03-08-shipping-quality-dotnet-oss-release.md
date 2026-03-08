---
title: "What It Actually Takes to Ship a Quality .NET OSS Release"
excerpt: >-
  "SonarCloud, Sigstore attestation, CycloneDX SBOM, multi-TFM testing, environment-gated NuGet publish -- here is every piece of infrastructure that went into taking a .NET OSS project from local dotnet pack to a production-grade release pipeline. Including the parts that broke."
categories:
  - Technical
  - .NET
  - Open Source
tags:
  - .NET
  - Open Source
  - CI/CD
  - NuGet
  - WorkflowForge
author: animat089
last_modified_at: 2026-03-08
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## From Laptop to Pipeline

WorkflowForge 2.0 shipped from my laptop. `dotnet pack`, `dotnet nuget push`, done. Thirteen packages on NuGet.org, no CI to speak of.

For the 2.1 release -- sixty issues on a feature branch, thirteen packages targeting .NET Framework 4.8, .NET 8.0, and .NET 10.0 -- I wanted to do it properly. Static analysis. Automated testing across all three frameworks. Supply chain attestation. A software bill of materials. Gated publish with human approval.

This post covers every piece of infrastructure that went into that transition. Not a changelog, not a feature announcement -- just the tooling, the configuration, and the places where things broke in ways I did not expect.

If you maintain a .NET open-source project and ship to NuGet, this is the checklist I wish I had before I started.

---

## Static Analysis: Free for Public Repos

SonarCloud is free for any public GitHub repository. There is no reason not to use it.

Setting it up requires a Java runtime for the scanner, a project token stored as a GitHub Actions secret, and three commands wrapping the build:

```yaml
- name: Install SonarScanner for .NET
  run: dotnet tool install --global dotnet-sonarscanner

- name: Build and Test with SonarCloud
  run: |
    dotnet sonarscanner begin \
      /k:"animatlabs_workflow-forge" \
      /o:"animatlabs" \
      /d:sonar.token="$SONAR_TOKEN" \
      /d:sonar.host.url="https://sonarcloud.io" \
      /d:sonar.cs.opencover.reportsPaths="**/TestResults/**/coverage.opencover.xml"
    dotnet build WorkflowForge.sln --configuration Release
    dotnet test WorkflowForge.sln --configuration Release \
      --collect:"XPlat Code Coverage" \
      -- DataCollectionRunSettings.DataCollectors.DataCollector.Configuration.Format=opencover
    dotnet sonarscanner end /d:sonar.token="$SONAR_TOKEN"
```

The scanner wraps the build, collects coverage data, and uploads results. First run on the WorkflowForge codebase: quality gate passed, 88.9% coverage on new code, 2.2% duplication. But it also flagged dozens of issues I had not noticed.

### What It Found

The most common finding was structured logging violations:

```csharp
// Before -- string interpolation defeats structured logging
_logger.LogInformation($"Processing order {orderId}");

// After -- orderId becomes a queryable property
_logger.LogInformation("Processing order {OrderId}", orderId);
```

The interpolated version compiles and runs. The log output looks identical. But `orderId` gets baked into the message string instead of being a separate structured field. In production, you cannot filter or aggregate by order ID. SonarCloud flagged every instance across the codebase.

It also caught missing `sealed` modifiers on classes that were not designed for inheritance, inconsistent visibility on internal constants, and unused event declarations in test doubles. Legitimate code smells that manual review had missed.

### What It Did Not Find

The hardest bugs in this release required reasoning about concurrency, shared state, and disposal patterns. No static analyzer handles those well today.

**Thread safety in conditional operations:**

```csharp
// Before -- plain field, visible to concurrent workflows
private bool _lastConditionResult;

// After -- volatile ensures cross-thread visibility
private volatile bool _lastConditionResult;
```

`ConditionalWorkflowOperation` evaluates a condition during execution and reads the result during compensation. Without `volatile`, one workflow's compensation could read another workflow's stale condition result. The fix is one keyword, but finding the bug requires understanding the concurrent execution model.

**O(n^2) indexing in persistence middleware:**

```csharp
// Before -- scanned the full operation list on every middleware call
var index = workflow.Operations.ToList().IndexOf(currentOperation);

// After -- O(1) lookup from foundry properties
private static int GetCurrentOperationIndex(IWorkflowFoundry foundry)
{
    if (foundry.Properties.TryGetValue(
        FoundryPropertyKeys.CurrentOperationIndex, out var obj) && obj is int idx)
        return idx;
    // ...fallback counter logic
}
```

The foundry now sets `CurrentOperationIndex` before each operation executes. The middleware reads it directly instead of scanning.

**Allocation on every property access:**

```csharp
// Before -- new wrapper allocated on every call
internal IReadOnlyList<IWorkflowOperation> Operations =>
    new ReadOnlyCollection<IWorkflowOperation>(_operations);

// After -- cached, invalidated on mutation
private ReadOnlyCollection<IWorkflowOperation>? _cachedOperations;

internal IReadOnlyList<IWorkflowOperation> Operations =>
    _cachedOperations ??= new ReadOnlyCollection<IWorkflowOperation>(_operations);
```

In hot paths that inspect the operation list, the old version created a new `ReadOnlyCollection` wrapper on every access. The fix caches it and clears the cache when operations are added.

**Event handler memory leak:**

```csharp
// Before -- events kept references to disposed subscribers
public void Dispose()
{
    if (_disposed) return;
    _disposed = true;
    _concurrencyLimiter?.Dispose();
}

// After -- null out all event delegates
public void Dispose()
{
    if (_disposed) return;
    _disposed = true;

    _concurrencyLimiter?.Dispose();

    WorkflowStarted = null;
    WorkflowCompleted = null;
    WorkflowFailed = null;
    CompensationTriggered = null;
    CompensationCompleted = null;
    // ...all event fields set to null
}
```

`WorkflowSmith` and `WorkflowFoundry` subscribed to each other's events but never unsubscribed on dispose. In long-running applications, disposed objects stayed alive through event handler references.

**Silent recovery failures:**

The recovery extension caught exceptions during resume and returned successfully -- silently swallowing errors. The persistence middleware overwrote restored operation outputs with input data during the resume path, undoing the point of checkpointing. Both required reading the code paths carefully and writing tests for the failure scenarios.

SonarCloud earned its keep. It is also not enough. The badge is not a substitute for reading your own code.

---

## Multi-Target Testing

WorkflowForge targets .NET Framework 4.8, .NET 8.0, and .NET 10.0. Each framework has different runtime behavior, and the differences can be subtle.

The CI pipeline runs the full test suite against all three:

```yaml
dotnet test WorkflowForge.sln --framework net8.0 \
  --collect:"XPlat Code Coverage"
dotnet test WorkflowForge.sln --framework net10.0 \
  --collect:"XPlat Code Coverage"
dotnet test WorkflowForge.sln --framework net48
```

Coverage is collected on .NET 8.0 and 10.0 (OpenCover format for SonarCloud ingestion). .NET Framework 4.8 runs the tests but without coverage instrumentation, since the XPlat collector does not support it.

This caught real issues. .NET Framework 4.8 enforces strong-name validation strictly -- if assembly A is signed and references unsigned assembly B, the runtime throws a `FileLoadException`. .NET Core and later ignore strong names entirely. Without multi-TFM testing, the benchmark suite worked on .NET 8.0 and 10.0 but failed on 4.8 due to a `SignAssembly` inheritance issue in `Directory.Build.props`.

Coverage reports are uploaded as separate artifacts for independent auditing, alongside the `.trx` test result files.

---

## The Pipeline

This is the full CI/CD workflow that runs on every push, every PR, and on-demand for publish:

```
┌──────────────────────────────────────────────────────────────────┐
│  Build Job                                                       │
│                                                                  │
│  Checkout ─► Setup SDKs ─► Restore ─► SonarScanner Begin        │
│  ─► Build ─► Test (net8.0) ─► Test (net10.0) ─► Test (net48)   │
│  ─► SonarScanner End ─► Upload Results                          │
│  ─► Pack ─► Generate SBOM ─► Upload Packages                   │
└──────────────────────┬───────────────────────────────────────────┘
                       │ (requires manual approval)
┌──────────────────────▼───────────────────────────────────────────┐
│  Publish Job  (nuget-publish environment)                        │
│                                                                  │
│  Download Packages ─► Sign (optional) ─► Attest Provenance      │
│  ─► Attest SBOM ─► Push to NuGet.org                            │
└──────────────────────────────────────────────────────────────────┘
```

A few design decisions worth explaining.

**Two separate jobs.** The build job produces packages as artifacts. The publish job downloads them and pushes to NuGet. This means the publish job never needs to build anything -- it only handles signing, attestation, and push. If the publish fails, the build artifacts are still available for retry without re-running tests.

**Environment gate.** The publish job runs in a `nuget-publish` GitHub Environment that requires manual approval. No accidental publishes. The concurrency group prevents parallel publish attempts to the same branch:

```yaml
publish:
  needs: build
  environment: nuget-publish
  concurrency:
    group: publish-${{ github.ref }}
    cancel-in-progress: false
```

**Concurrency controls.** The build job uses `cancel-in-progress: true` -- if a new push arrives while a build is running, the old one is cancelled. The publish job uses `cancel-in-progress: false` -- once a publish starts, it must complete.

**Minimal permissions.** The top-level `permissions: {}` drops all default GitHub token permissions. Each job requests only what it needs: `contents: read` for the build, `id-token: write` and `attestations: write` for the publish.

The full workflow is [on GitHub](https://github.com/animatlabs/workflow-forge/blob/main/.github/workflows/build-test.yml).

---

## Supply Chain Hardening

Four things happen before any package reaches NuGet.org.

### SHA-Pinned Actions

Every GitHub Action in the workflow is pinned to a full commit SHA instead of a mutable version tag:

```yaml
- uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
- uses: actions/setup-dotnet@c2fa09f4bde5ebb9d1777cf28262a3eb3db3ced7  # v5
- uses: actions/attest-build-provenance@a2bbfa25375fe432b6a289bc6b6cd05ecd0c4c32  # v4.1.0
```

Tags like `v6` can be moved to point to a different commit at any time. A compromised action author could push malicious code under the same tag. SHAs are immutable -- if the hash does not match, the step fails.

The tradeoff is maintenance: when actions release new versions, you need to update the hash. Dependabot handles this automatically with weekly update PRs for both GitHub Actions and NuGet dependencies.

One gotcha: precision matters. During the 2.1 publish, the `attest-build-provenance` step failed because the SHA had a single-character typo -- `ecc` instead of `ecd`. The entire pipeline stopped. There is no "close enough" with SHA-pinning.

### Sigstore Build Attestation

Every `.nupkg`, `.snupkg`, and SBOM file gets a cryptographic attestation before reaching NuGet.org:

```yaml
- name: Attest NuGet Package Provenance
  uses: actions/attest-build-provenance@a2bbfa...ecd0c4c32  # v4.1.0
  with:
    subject-path: './packages/*.nupkg'

- name: Attest Symbol Package Provenance
  uses: actions/attest-build-provenance@a2bbfa...ecd0c4c32  # v4.1.0
  with:
    subject-path: './packages/*.snupkg'

- name: Attest SBOM
  uses: actions/attest-build-provenance@a2bbfa...ecd0c4c32  # v4.1.0
  with:
    subject-path: './packages/bom.json'
```

This proves, cryptographically, that each artifact was built by a specific GitHub Actions workflow, from a specific commit, in a specific repository. Consumers can verify with `gh attestation verify`. No long-lived signing keys to manage -- GitHub's Sigstore integration uses short-lived OIDC tokens.

### CycloneDX SBOM

One command generates a complete dependency manifest in CycloneDX JSON format:

```yaml
- name: Generate CycloneDX SBOM
  run: |
    dotnet tool install --global CycloneDX
    dotnet cyclonedx WorkflowForge.sln -o ./packages --json
```

The resulting `bom.json` lists every dependency, its version, and its license. Increasingly required by enterprise consumers doing compliance reviews. The SBOM is uploaded alongside the packages and gets its own build attestation.

### NuGet Vulnerability Auditing

In `Directory.Build.props`, three properties make every `dotnet restore` an audit:

```xml
<NuGetAudit>true</NuGetAudit>
<NuGetAuditMode>all</NuGetAuditMode>
<NuGetAuditLevel>low</NuGetAuditLevel>
```

`all` checks both direct and transitive dependencies. `low` means any known vulnerability at any severity level fails the build. No silent CVEs in the dependency tree.

---

## NuGet Packaging: The DebugType Trap

This is the part that broke.

`Directory.Build.props` centralizes build settings for the entire solution. Two of those settings handle debug symbols and NuGet symbol packages:

```xml
<DebugType>portable</DebugType>
<IncludeSymbols>true</IncludeSymbols>
<SymbolPackageFormat>snupkg</SymbolPackageFormat>
```

`portable` produces a separate `.pdb` file alongside the DLL. `snupkg` packages that `.pdb` for NuGet.org's symbol server, enabling step-through debugging for consumers.

The problem: nine of thirteen project `.csproj` files also had this line:

```xml
<DebugType>embedded</DebugType>
```

`embedded` bakes the PDB directly into the DLL. No separate `.pdb` file. The `.csproj` setting overrides `Directory.Build.props`, so `dotnet pack` generated `.snupkg` files containing nothing. NuGet.org rejected them:

```
BadRequest https://www.nuget.org/api/v2/symbolpackage/ 77ms
error: Response status code does not indicate success:
  400 (The package does not contain any symbol (.pdb) files.)
```

Nine of thirteen packages failed. The four that succeeded happened not to have the `DebugType=embedded` override.

The fix was straightforward: remove `DebugType=embedded` from every individual `.csproj` and let all projects inherit `portable` from `Directory.Build.props`. One property, nine projects, fourteen files.

The consequence was not. NuGet.org does not allow re-pushing the same package version. The thirteen `.nupkg` files had already been accepted. So we had to bump every project to 2.1.1, update version references across documentation and CI, add a CHANGELOG entry, and deprecate the thirteen partially-published 2.1.0 packages individually.

If you are setting up NuGet packaging for a multi-project solution: **check your DebugType before your first publish.**

---

## SourceLink and Symbol Packages

Getting debug symbols right required centralizing several properties in `Directory.Build.props`:

```xml
<DebugType>portable</DebugType>
<EmbedUntrackedSources>true</EmbedUntrackedSources>
<PublishRepositoryUrl>true</PublishRepositoryUrl>
<IncludeSymbols>true</IncludeSymbols>
<SymbolPackageFormat>snupkg</SymbolPackageFormat>
```

Plus a SourceLink package reference:

```xml
<PackageReference Include="Microsoft.SourceLink.GitHub" Version="8.0.0" PrivateAssets="All"/>
```

Together, these give consumers of the NuGet package the ability to step into the source code directly from their debugger. `EmbedUntrackedSources` ensures generated files are included. `PublishRepositoryUrl` embeds the repository URL in the package metadata.

The key lesson: these properties must live in one place. The moment individual `.csproj` files start overriding `DebugType`, the symbol package pipeline breaks silently -- `dotnet pack` does not warn you that the `.snupkg` is empty.

---

## What Actually Shipped

Beyond the infrastructure, three user-facing changes made it into 2.1.

**Inline compensation** -- attach a restore delegate directly to `AddOperation` instead of writing a separate class:

```csharp
var workflow = WorkflowForge.CreateWorkflow("OrderProcessing")
    .AddOperation("ProcessPayment", async (foundry, ct) =>
    {
        foundry.Properties["payment_id"] = "PAY-123";
    },
    restoreAction: async (foundry, ct) =>
    {
        var paymentId = foundry.Properties["payment_id"];
        // Issue refund...
    })
    .Build();
```

For workflows where the compensation logic is simple, this eliminates an entire class per operation.

**`GetOperationOutput`** -- inspect what any completed operation returned, by name or index, from the orchestrator level.

**Multi-target test validation** -- all tests run across .NET Framework 4.8, .NET 8.0, and .NET 10.0 on every CI build. API compatibility issues get caught before they ship.

---

## The Checklist

If I were setting up a new .NET OSS project today, this is what I would add before the first NuGet publish:

- [ ] **Static analysis** -- SonarCloud or equivalent, free for public repos
- [ ] **Code coverage** with quality gate (coverage on new code, not just overall)
- [ ] **Multi-target testing** across every framework you ship
- [ ] **CI/CD pipeline** with environment-gated publish and manual approval
- [ ] **SHA-pinned GitHub Actions** with Dependabot for automated updates
- [ ] **Build provenance attestation** via Sigstore
- [ ] **SBOM generation** (CycloneDX or SPDX)
- [ ] **NuGet vulnerability auditing** (`NuGetAudit=true` with `all` mode)
- [ ] **SourceLink + symbol packages** (check DebugType before first publish)
- [ ] **SDK version pinning** via `global.json`
- [ ] **Strong-name signing** with key in `Directory.Build.props`

None of this is individually complex. The complexity is in getting all of it working together without one setting silently breaking another. That is what took sixty issues to sort out.

---

## Resources

| What | Where |
|------|-------|
| GitHub | [github.com/animatlabs/workflow-forge](https://github.com/animatlabs/workflow-forge) |
| NuGet | [nuget.org/packages/WorkflowForge](https://www.nuget.org/packages/WorkflowForge) |
| Documentation | [animatlabs.com/workflow-forge](https://animatlabs.com/workflow-forge) |
| CI/CD Workflow | [build-test.yml](https://github.com/animatlabs/workflow-forge/blob/main/.github/workflows/build-test.yml) |
| CHANGELOG | [CHANGELOG.md](https://github.com/animatlabs/workflow-forge/blob/main/CHANGELOG.md) |
| Release PR | [PR #5 -- 60 issues resolved](https://github.com/animatlabs/workflow-forge/pull/5) |

---

*What does your .NET OSS release checklist look like? Anything I missed? Let me know in the comments.*

{% include cta-workflowforge.html %}