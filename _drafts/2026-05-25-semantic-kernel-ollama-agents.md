---
title: "AI Agent Pipeline with Rollback: Semantic Kernel + WorkflowForge"
excerpt: >-
  "I built an AI agent that researches, drafts, and publishes content. Then I made it fail on purpose. Semantic Kernel handles the thinking. WorkflowForge handles the undo."
categories:
  - Technical
  - .NET
  - AI
tags:
  - .NET
  - Semantic Kernel
  - WorkflowForge
  - Ollama
  - AI Agents
  - LLM
  - Compensation
author: animat089
last_modified_at: 2026-03-02
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

My AI agent had just drafted 400 words, researched the topic, and classified it. Then the quality check rejected the output. I had a half-finished pipeline, orphaned artifacts, and no clean way to undo.

That's the problem I set out to fix. Semantic Kernel (Microsoft's AI framework, ~22k stars) does the reasoning. WorkflowForge 2.1.1 does the orchestration and the rollback. When something fails, everything unwinds in reverse order. No manual cleanup. No leftover files.

## The Pipeline

Five steps. Each one uses the LLM. Each one can compensate if a later step fails.

```
ClassifyTopic → ResearchTopic → DraftContent → QualityCheck → Publish
                                                    ↓ (rejected)
                                              QualityCheck.Compensate
                                                → DraftContent.Compensate
                                                → ResearchTopic.Compensate
                                                → ClassifyTopic.Compensate
```

ClassifyTopic assigns a category. ResearchTopic gathers facts. DraftContent writes the blog paragraph. QualityCheck scores it 1–10 and rejects if below 5. Publish writes to disk. If QualityCheck throws, WorkflowForge runs `RestoreAsync` on every completed step, in reverse order.

Why split reasoning and orchestration? Semantic Kernel excels at prompts, plugins, and model calls. It doesn't care about multi-step rollback. WorkflowForge doesn't care about LLMs—it just needs each operation to implement `RestoreAsync`. That separation keeps the pipeline testable: you can mock the kernel, or run steps without the LLM, and the compensation logic stays the same.

## Setup: Ollama + Semantic Kernel

I run everything locally with Ollama. No API keys. No cloud. Zero cost.

```bash
docker run -d -p 11434:11434 --name ollama ollama/ollama
docker exec ollama ollama pull phi3
```

The project uses Semantic Kernel's Ollama connector (prerelease). Add these packages:

```xml
<PackageReference Include="Microsoft.SemanticKernel" Version="1.73.0" />
<PackageReference Include="Microsoft.SemanticKernel.Connectors.Ollama" Version="1.73.0-alpha" />
<PackageReference Include="WorkflowForge" Version="2.1.1" />
```

Kernel setup is one line:

```csharp
#pragma warning disable SKEXP0070
var kernelBuilder = Kernel.CreateBuilder()
    .AddOllamaChatCompletion("phi3", new Uri("http://localhost:11434"));
#pragma warning restore SKEXP0070

var kernel = kernelBuilder.Build();
```

## Building the Workflow

Each step extends `WorkflowOperationBase`. You implement `ForgeAsyncCore` (do the work) and `RestoreAsync` (undo it). WorkflowForge wires the compensation automatically.

```csharp
public static IWorkflow Build(Kernel kernel, bool failQualityCheck = false)
{
    return WF
        .CreateWorkflow("AIContentPipeline")
        .AddOperation(new ClassifyTopicStep(kernel))
        .AddOperation(new ResearchTopicStep(kernel))
        .AddOperation(new DraftContentStep(kernel))
        .AddOperation(new QualityCheckStep(kernel, failQualityCheck))
        .AddOperation(new PublishStep())
        .Build();
}
```

The `failQualityCheck` flag forces rejection for demos. Real runs use the LLM to score the draft.

## Each Step: Forge + Restore

ClassifyTopic uses `InvokePromptAsync` to categorize the topic. It stores the result in the foundry. On compensate, it clears that property.

```csharp
public sealed class ClassifyTopicStep(Kernel kernel) : WorkflowOperationBase
{
    public override string Name => "ClassifyTopic";

    protected override async Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var topic = foundry.GetPropertyOrDefault<string>(PipelineKeys.Topic) ?? "general";
        foundry.Logger.LogInformation("[ClassifyTopic] Classifying: {Topic}", topic);

        var result = await kernel.InvokePromptAsync(
            $"Classify this topic into one category (technology, science, business, lifestyle). Topic: {topic}. Reply with just the category name.",
            cancellationToken: ct).ConfigureAwait(false);

        var classification = result?.ToString()?.Trim() ?? "technology";
        foundry.SetProperty(PipelineKeys.Classification, classification);
        return inputData;
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        foundry.Logger.LogWarning("[ClassifyTopic] COMPENSATING: Clearing classification");
        foundry.Properties.TryRemove(PipelineKeys.Classification, out _);
        return Task.CompletedTask;
    }
}
```

ResearchTopic and DraftContent follow the same pattern: call the LLM, store output, remove it in `RestoreAsync`. ResearchTopic takes the topic and classification from the foundry, asks the LLM for bullet-point facts, and stores them. On compensate, it discards the research notes.

```csharp
protected override async Task<object?> ForgeAsyncCore(...)
{
    var topic = foundry.GetPropertyOrDefault<string>(PipelineKeys.Topic) ?? "general";
    var classification = foundry.GetPropertyOrDefault<string>(PipelineKeys.Classification) ?? "general";

    var result = await kernel.InvokePromptAsync(
        $"Provide 3 key facts about '{topic}' in the context of {classification}. Keep it under 100 words. Use bullet points.",
        cancellationToken: ct).ConfigureAwait(false);

    var research = result?.ToString() ?? "No research found.";
    foundry.SetProperty(PipelineKeys.Research, research);
    return inputData;
}

public override Task RestoreAsync(...)
{
    foundry.Logger.LogWarning("[ResearchTopic] COMPENSATING: Discarding research notes");
    foundry.Properties.TryRemove(PipelineKeys.Research, out _);
    return Task.CompletedTask;
}
```

DraftContent does the same: reads topic and research, invokes the prompt for a 150-word paragraph, stores the draft. Its `RestoreAsync` removes the draft and logs that it's flagged for human review.

QualityCheck is where failure happens. If the score is below 5 (or `forceFailure` is true), it throws. That triggers the compensation chain.

```csharp
protected override async Task<object?> ForgeAsyncCore(
    object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
{
    var draft = foundry.GetPropertyOrDefault<string>(PipelineKeys.Draft) ?? "";

    if (forceFailure)
    {
        foundry.SetProperty(PipelineKeys.QualityScore, 2);
        foundry.Logger.LogError("[QualityCheck] Quality score: 2/10 -- REJECTED. Triggering compensation.");
        throw new InvalidOperationException("Draft quality too low (2/10). Needs human review.");
    }

    var result = await kernel.InvokePromptAsync(
        $"Rate this text quality from 1-10 (10 being best). Reply with ONLY a number.\n\n{draft}",
        cancellationToken: ct).ConfigureAwait(false);

    var scoreText = result?.ToString()?.Trim() ?? "7";
    _ = int.TryParse(scoreText.AsSpan(0, Math.Min(2, scoreText.Length)), out var score);
    if (score < 1) score = 7;

    foundry.SetProperty(PipelineKeys.QualityScore, score);

    if (score < 5)
    {
        throw new InvalidOperationException($"Draft quality too low ({score}/10). Needs human review.");
    }

    return inputData;
}
```

Publish writes the draft to a temp file. Its `RestoreAsync` deletes that file if compensation runs. That's the key: Publish never executes when QualityCheck fails, so there's no file to delete in that case. But if we added a step after Publish that could fail (e.g., upload to a CMS), Publish's compensate would remove the local file. The pattern scales.

## Running It

Success path:

```bash
cd AnimatLabs.SemanticKernelWorkflowForge
dotnet run
```

Failure path (forces quality rejection, runs compensation):

```bash
dotnet run -- --fail
```

Custom endpoint and model:

```bash
dotnet run -- http://localhost:11434 llama3
```

When you run with `--fail`, you'll see the pipeline execute, QualityCheck throw, then each step compensate in reverse. Draft cleared. Research discarded. Classification removed. Content flagged for human review. No orphaned files.

## Program Entry Point

The main program wires the kernel, topic, and workflow, then hands control to WorkflowForge's Smith.

```csharp
var topic = "How .NET developers can use AI agents locally with Ollama";
var workflow = ContentPipelineWorkflow.Build(kernel, shouldFail);

using var foundry = WF.CreateFoundry(
    workflowName: workflow.Name,
    initialProperties: new Dictionary<string, object?>
    {
        [PipelineKeys.Topic] = topic
    });

using var smith = WF.CreateSmith(new ConsoleLogger("WF-AI"));

try
{
    await smith.ForgeAsync(workflow, foundry).ConfigureAwait(false);
    Console.WriteLine("Pipeline completed successfully!");
    // ... print draft and output path
}
catch (Exception ex)
{
    Console.WriteLine($"Pipeline FAILED: {ex.Message}");
    Console.WriteLine("Compensation has been executed -- all intermediate artifacts cleaned up.");
    Console.WriteLine("Content flagged for human review.");
}
```

## What I Learned

Semantic Kernel's `InvokePromptAsync` with Ollama works well for local pipelines. The prerelease connector is stable enough for playground use. WorkflowForge's compensation model maps cleanly onto AI pipelines: each step knows how to undo itself, and the framework handles the ordering.

The `--fail` flag was the key for demos. Without it, you'd have to hope the LLM returns a low score. With it, you can reliably show the compensation path.

One gotcha: the Ollama connector triggers `SKEXP0070` (experimental API). I wrapped the kernel builder in `#pragma warning disable/restore` to keep the build clean. That warning will go away once the connector graduates from prerelease.

## Where to Find It

Working code lives at `playground/SemanticKernelWorkflowForge/` in the animatlabs repo. Clone, run Ollama, and try both `dotnet run` and `dotnet run -- --fail`.

What's your approach when an AI pipeline fails mid-run—manual cleanup, retries, or something else?

---

## LinkedIn Promo Post

I built an AI content pipeline that classifies topics, researches them, drafts paragraphs, runs a quality check, and publishes. Then I made it fail on purpose.

Semantic Kernel does the reasoning. WorkflowForge handles the orchestration and the rollback. When the quality check rejects the draft, every step compensates in reverse: draft deleted, research discarded, classification cleared, content flagged for human review. No orphaned files. No manual cleanup.

Runs 100% locally with Ollama—no API keys, no cloud, zero cost. The `--fail` flag forces rejection so you can see the compensation path in action. Five steps, each with a `RestoreAsync` that knows how to undo itself.

Working code in the animatlabs playground. What do you use when your AI agent fails halfway through—retries, manual cleanup, or something else?
