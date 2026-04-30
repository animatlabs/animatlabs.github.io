---
title: "Spectre.Console: Terminal Output That Doesn't Look Like 1995"
excerpt: >-
  11k GitHub stars, and most .NET devs I talk to have never heard of it. Tables, trees, charts, spinners: all in the terminal. I built a Project Health Checker demo to show what Spectre.Console can do.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Spectre.Console
  - CLI
  - Terminal
  - Developer Tools
  - Open Source
author: animat089
last_modified_at: 2026-03-30
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I shipped a CLI tool last year that looked like it was written in 1995. `Console.WriteLine`, plain text, no colors. Users weren't fans. Fair.

Spectre.Console (11.1k stars on GitHub) turns terminal output into something you'd actually want to look at: tables, trees, charts, and spinners. I built a "Project Health Checker" demo to show what's possible with a single NuGet package. I still reach for plain `Console` on throwaway scripts. For anything someone else runs, Spectre wins.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/SpectreConsole){: .btn .btn--primary}

## Install

```bash
dotnet add package Spectre.Console
```

No CLI framework, no extra dependencies. One package.

## FigletText

First impression matters. A big ASCII banner beats `Project Health Checker v1.0` every time:

```csharp
AnsiConsole.Write(new FigletText("Project Health").Color(Color.Cyan1));
AnsiConsole.MarkupLine("[grey]Spectre.Console Demo — Project Health Checker[/]");
```

The `[grey]` and `[/]` are Spectre markup for inline styling without raw ANSI escape codes. You wrap text in `[color]...[/]` or `[bold]...[/]` and Spectre converts it to the right escape sequences for your terminal. If the terminal doesn't support ANSI, it strips the markup and falls back to plain text. No manual `\x1b[31m` nonsense.

## Status Spinner

Users hate staring at a frozen cursor while your tool "analyzes" (or actually does work):

```csharp
AnsiConsole.Status()
    .Spinner(Spinner.Known.Dots)
    .SpinnerStyle(Style.Parse("cyan"))
    .Start("Analyzing solution...", ctx =>
    {
        foreach (var project in projects)
        {
            ctx.Status($"Scanning [bold]{project.Name}[/]...");
            Thread.Sleep(600);
        }
    });
```

`ctx.Status()` updates the message as you go. In a real tool you'd replace `Thread.Sleep` with actual scanning logic. The spinner runs until the lambda completes.

## Tables

This is where Spectre really shines. No more manual string padding or trying to line up columns with tab characters:

```csharp
var table = new Table()
    .Border(TableBorder.Rounded)
    .Title("[bold cyan]Solution Health Report[/]")
    .AddColumn(new TableColumn("[bold]Project[/]").LeftAligned())
    .AddColumn(new TableColumn("[bold]Target[/]").Centered())
    .AddColumn(new TableColumn("[bold]Deps[/]").Centered())
    .AddColumn(new TableColumn("[bold]Vulns[/]").Centered())
    .AddColumn(new TableColumn("[bold]Coverage[/]").Centered())
    .AddColumn(new TableColumn("[bold]Status[/]").Centered());

foreach (var p in projects)
{
    var statusMarkup = p.Status switch
    {
        "Healthy" => "[green]Healthy[/]",
        "Warning" => "[yellow]Warning[/]",
        "Critical" => "[red]Critical[/]",
        _ => p.Status
    };

    var vulnMarkup = p.Vulnerabilities > 0
        ? $"[red]{p.Vulnerabilities}[/]"
        : $"[green]{p.Vulnerabilities}[/]";

    var coverageColor = p.Coverage >= 90 ? "green" : p.Coverage >= 70 ? "yellow" : "red";

    table.AddRow(
        $"[bold]{p.Name}[/]",
        p.TargetFramework,
        p.Dependencies.ToString(),
        vulnMarkup,
        $"[{coverageColor}]{p.Coverage:F1}%[/]",
        statusMarkup);
}

AnsiConsole.Write(table);
```

Markup in every cell. Red for bad, green for good, yellow for "fix this soon." Column widths and alignment are handled automatically.

## Dependency Tree

For hierarchical data, trees work better than tables. In the demo, each project gets a node, dependencies nest underneath, and vulnerabilities get red badges:

```csharp
var tree = new Tree("[bold cyan]Dependency Tree[/]")
    .Style(Style.Parse("dim"));

var coreNode = tree.AddNode("[bold]AnimatLabs.Core[/] [grey](0 vulnerabilities)[/]");
coreNode.AddNode("Microsoft.Extensions.Logging [green]8.0.0[/]");
coreNode.AddNode("System.Text.Json [green]8.0.0[/]");

var apiNode = tree.AddNode("[bold]AnimatLabs.Api[/] [yellow](2 vulnerabilities)[/]");
apiNode.AddNode("[bold]AnimatLabs.Core[/]");
var aspNode = apiNode.AddNode("Microsoft.AspNetCore.Mvc [green]8.0.0[/]");
aspNode.AddNode("[red]Newtonsoft.Json 12.0.3[/] [red bold]CVE-2024-XXXX[/]");
aspNode.AddNode("[red]System.Data.SqlClient 4.8.5[/] [red bold]CVE-2024-YYYY[/]");
```

`AddNode` returns a `TreeNode` so you chain children. Outdated packages get `[yellow]`, CVEs get `[red bold]`.

## Coverage Chart

Same data as the table, different presentation. Bar charts make comparisons obvious at a glance:

```csharp
var chart = new BarChart()
    .Label("[bold cyan]Test Coverage by Project[/]")
    .CenterLabel()
    .Width(60);

foreach (var p in projects)
{
    var color = p.Coverage >= 90 ? Color.Green : p.Coverage >= 70 ? Color.Yellow : Color.Red;
    chart.AddItem(p.Name.Replace("AnimatLabs.", ""), p.Coverage, color);
}

AnsiConsole.Write(chart);
```

`AddItem(label, value, color)`. Spectre scales the bars to fit. Green/yellow/red by threshold.

## Summary Rule

Rules are horizontal lines with embedded text. The final rule shows overall health:

```csharp
var healthy = projects.Count(p => p.Status == "Healthy");
var total = projects.Length;
var overallColor = healthy == total ? "green" : healthy >= total - 1 ? "yellow" : "red";
AnsiConsole.Write(new Rule($"[{overallColor} bold]{healthy}/{total} projects healthy[/]").RuleStyle(overallColor));
```

Green line for "all good," red for "something's broken."

## Running the Demo

The demo runs in one go: Figlet header, spinner, table, tree, chart, and rule. I didn't touch `Console.WriteLine` once; everything goes through `AnsiConsole.Write` or `AnsiConsole.MarkupLine`.

```bash
cd playground/SpectreConsole/AnimatLabs.SpectreConsole
dotnet run
```

## When To Use It (and When Not To)

Spectre is for output, not a CLI framework. That distinction matters, and I have watched people bolt a full argument parser onto a tool that only needed a pretty table because they grabbed the wrong package first.

**Spectre.Console vs System.CommandLine**: Spectre renders, System.CommandLine parses. Different problems. I've used both in the same tool: System.CommandLine for `--verbose` and `--format json`, Spectre for the pretty table when format is default. If you want argument parsing built into Spectre, there's Spectre.Console.Cli which bundles both.

**CI/CD gotcha**: Don't use Spectre for scripts that run headless. Jenkins, Azure DevOps, and GitHub Actions often strip or mangle ANSI sequences. Your table becomes escape-code garbage in the build log. Add a `--no-color` or `--plain` flag for CI runs. I've seen teams branch on it: `if (plainOutput) Console.WriteLine(...) else AnsiConsole.Write(...)`. A bit of duplication but it works.

**Terminal compatibility**: Spectre detects terminal capabilities and falls back to plain text. But if your layout depends on Unicode box-drawing or emoji, it can break in minimal environments. Windows Terminal and modern PowerShell handle it fine; legacy cmd.exe does not. If your users are on locked-down corporate desktops, test in cmd.exe before shipping.

## Beyond Output

I only covered the rendering side. Spectre also does prompts, selections, multi-select, progress bars, and live display. For quick scripts, `Console.WriteLine` is fine. For anything people actually use (build helpers, health checkers, migration runners), Spectre is worth the single package dependency.

**Playground:** [SpectreConsole](https://github.com/animat089/playground/tree/main/SpectreConsole)

---

<!-- LINKEDIN PROMO

Shipped a CLI tool last year. Console.WriteLine. Plain text. No colors. Users hated it.

Spectre.Console (11k stars) turns terminal output into something presentable. Built a Project Health Checker demo: Figlet header, status spinner, health report table with colored cells, dependency tree with vulnerability badges, test coverage bar chart.

One NuGet package. No CLI framework. Works alongside System.CommandLine if you need argument parsing.

Caveat: don't use it headless in CI/CD. ANSI gets mangled. Add a --plain flag. Also test in cmd.exe if your users are on corporate desktops.

Full code in the playground: [link]

#dotnet #cli #spectreconsole #terminal
-->
