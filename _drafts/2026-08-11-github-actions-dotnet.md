---
title: "GitHub Actions for .NET: CI/CD Pipeline Setup"
excerpt: >-
  "Build, test, and deploy your .NET apps with GitHub Actions - complete workflow examples."
categories:
  - Technical
  - .NET
  - Infra
tags:
  - .NET
  - GitHub Actions
  - CI/CD
  - DevOps
  - Automation
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
- [ ] Did I implement these workflows myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,200-1,500 words
-->

## Basic Workflow

<!-- 
TODO: Explain GitHub Actions YAML structure
Include:
- Workflow file location (.github/workflows/)
- Basic syntax and structure
- Triggers (push, pull_request, schedule)
- Jobs and steps
- Runner selection
-->

```yaml
# TODO: Add basic workflow example
name: .NET CI/CD

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      # TODO: Add steps
```

## Build and Test

<!-- 
TODO: Restore, build, test steps
Include:
- Using actions/setup-dotnet
- Restore dependencies
- Build solution
- Run tests
- Code coverage
- Test results publishing
-->

```yaml
# TODO: Add build and test workflow steps
- uses: actions/checkout@v4
- name: Setup .NET
  uses: actions/setup-dotnet@v4
  with:
    dotnet-version: '8.0.x'
- name: Restore dependencies
  run: dotnet restore
- name: Build
  run: dotnet build --no-restore
- name: Test
  run: dotnet test --no-build --verbosity normal
```

## NuGet Publishing

<!-- 
TODO: Pack and push to NuGet
Include:
- Creating NuGet packages
- Versioning strategies
- Publishing to NuGet.org or GitHub Packages
- Using secrets for API keys
- Conditional publishing (only on tags/releases)
-->

```yaml
# TODO: Add NuGet publishing workflow
- name: Pack
  run: dotnet pack --configuration Release --no-build
- name: Publish to NuGet
  run: dotnet nuget push **/*.nupkg --api-key ${{ secrets.NUGET_API_KEY }} --source https://api.nuget.org/v3/index.json
```

## Docker Deployment

<!-- 
TODO: Container registry publishing
Include:
- Building Docker images
- Pushing to Docker Hub, GitHub Container Registry, or Azure Container Registry
- Multi-platform builds
- Image tagging strategies
- Deployment to container platforms
-->

```yaml
# TODO: Add Docker build and push workflow
- name: Build Docker image
  run: docker build -t myapp:${{ github.sha }} .
- name: Push to registry
  run: docker push myapp:${{ github.sha }}
```

## Conclusion

<!-- 
TODO: Summarize key points
Include:
- Best practices
- Common pitfalls
- When to use GitHub Actions vs alternatives
- Call to action for readers
-->

---

*What's in your GitHub Actions workflow? Share your setup!*
