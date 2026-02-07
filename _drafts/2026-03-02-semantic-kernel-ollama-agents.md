---
title: "Build AI Agents with Semantic Kernel + Ollama (100% Local)"
excerpt: >-
  "AI agents without cloud costs or API keys. Run Semantic Kernel with Ollama on your machine - here's the complete guide."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - AI
  - Semantic Kernel
  - Ollama
  - LLM
  - AI Agents
author: animat089
last_modified_at: 2026-03-02
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- Why local AI matters (privacy, cost, offline)
- Install Ollama + pull a model (phi3, mistral, llama3.2)
- Semantic Kernel basics: Kernel, Plugins, KernelFunction
- Build a simple agent: Task Manager Bot
- Add plugins: email, file system, web search
- Multi-agent orchestration patterns
- Performance tips for local models
- When to go cloud vs stay local
- Docker setup for team development (add Ollama to docker-compose)

UNIQUE ANGLE: Everything runs locally. No OpenAI key. No Azure. Just Docker + Ollama.
WORKFLOWFORGE TIE-IN: Show a WF workflow that uses an AI agent as a step.
-->

## Why Local AI?

*Content to be written - covers privacy, cost, offline capability, and the .NET AI ecosystem*

## Prerequisites

```bash
# Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull a model
ollama pull phi3:mini
```

## Setting Up Semantic Kernel

```csharp
// Install packages
// dotnet add package Microsoft.SemanticKernel
// dotnet add package Microsoft.SemanticKernel.Connectors.Ollama

var builder = Kernel.CreateBuilder();
builder.AddOllamaChatCompletion("phi3:mini", new Uri("http://localhost:11434"));
var kernel = builder.Build();
```

## Building Your First Agent

*Content to be written*

## Adding Plugins

*Content to be written*

## Conclusion

*Content to be written*

---

*Questions about local AI development with .NET? Let me know in the comments!*
