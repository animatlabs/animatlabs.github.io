---
title: "Feature Flags: The Key to Fearless Deployments"
excerpt: >-
  "Deploy incomplete features to production. Roll out to 1% of users. Kill problematic code without redeploying. Feature flags make it possible."
categories:
  - Technical
  - .NET
  - DevOps
tags:
  - .NET
  - Feature Flags
  - Trunk-Based Development
  - CI/CD
  - DevOps
  - Microsoft.FeatureManagement
author: animat089
last_modified_at: 2026-01-26
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## The Long-Lived Branch Problem

Feature branches that live for weeks create merge conflicts, integration bugs, and deployment anxiety. The solution? Merge incomplete code to main—but hide it behind feature flags.

<!--
TARGET: 2,000-2,500 words

OUTLINE:
1. Trunk-based development explained
2. Feature flags enable trunk-based development
3. Microsoft.FeatureManagement library
4. Flag types (release, ops, experiment, permission)
5. Rollout strategies (percentage, user targeting)
6. Managing flag lifecycle
7. Local development with flags

CODE EXAMPLES:
- Basic feature flag setup
- Percentage-based rollout
- User targeting
- ASP.NET Core integration
- Testing with flags
-->

## Trunk-Based Development

<!-- TODO: Small commits to main, short-lived branches (1-2 days max) -->

## Feature Flags Make It Possible

```csharp
if (await _featureManager.IsEnabledAsync("NewCheckoutFlow"))
{
    return await NewCheckout(cart);
}
return await LegacyCheckout(cart);
```

## Microsoft.FeatureManagement

```bash
dotnet add package Microsoft.FeatureManagement.AspNetCore
```

```csharp
builder.Services.AddFeatureManagement();
```

```json
// appsettings.json - no cloud required!
{
  "FeatureManagement": {
    "NewCheckoutFlow": false,
    "BetaFeatures": {
      "EnabledFor": [
        {
          "Name": "Percentage",
          "Parameters": { "Value": 10 }
        }
      ]
    }
  }
}
```

## Flag Types

| Type | Purpose | Example |
|------|---------|---------|
| Release | Hide incomplete features | `NewCheckoutFlow` |
| Ops | Operational toggles | `EnableDetailedLogging` |
| Experiment | A/B testing | `CheckoutButtonColor` |
| Permission | User-specific access | `PremiumFeatures` |

## Rollout Strategies

### Percentage Rollout

```csharp
// TODO: Gradual rollout from 1% to 100%
```

### User Targeting

```csharp
// TODO: Enable for specific users or groups
```

## Controller/Action Level

```csharp
[FeatureGate("NewDashboard")]
public IActionResult Dashboard()
{
    return View();
}
```

## Managing Flag Lifecycle

<!-- TODO: Short-lived flags, cleanup automation, flag ownership -->

## Testing with Flags

```csharp
// TODO: Test both paths, override flags in tests
```

## Conclusion

<!-- TODO: Deploy anytime, release when ready -->

---

*Using feature flags in your deployment strategy? Share your experience in the comments!*
