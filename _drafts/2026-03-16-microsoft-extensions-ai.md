---
title: "Microsoft.Extensions.AI: One Interface to Rule All LLMs"
excerpt: >-
  "Switch between OpenAI, Ollama, Azure, and Anthropic without changing a line of application code. Microsoft's unified AI abstraction is here."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - AI
  - Microsoft.Extensions.AI
  - LLM
  - Abstraction
  - IChatClient
author: animat089
last_modified_at: 2026-03-16
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- The problem: vendor lock-in with AI providers
- IChatClient interface explained
- IEmbeddingGenerator interface
- Middleware pipeline (caching, telemetry, function calling)
- Swap providers with zero code changes (demo)
- Integration with dependency injection
- OpenTelemetry observability out of the box
- Comparison: before vs after Extensions.AI
- Real-world pattern: local dev with Ollama, prod with Azure OpenAI

UNIQUE ANGLE: This is the HttpClient of AI - one interface, swap implementations.
-->

## The Problem: AI Provider Lock-In

*Content to be written*

## IChatClient: The Core Abstraction

```csharp
// Same interface, any provider
IChatClient client = new OllamaChatClient(new Uri("http://localhost:11434"), "phi3");
// OR
IChatClient client = new AzureOpenAIChatClient(endpoint, credential, "gpt-4o");

// Your code doesn't change
var response = await client.CompleteAsync("Explain dependency injection");
```

## Middleware Pipeline

*Content to be written*

## Conclusion

*Content to be written*

---

*Questions about Microsoft.Extensions.AI? Let me know in the comments!*
