---
title: "Spectre.Console: Build Beautiful CLI Tools in C#"
excerpt: >-
  "11k GitHub stars and you've probably never heard of it. Spectre.Console makes terminal apps gorgeous -- tables, progress bars, trees, and more."
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

`Console.WriteLine` is embarrassing. I shipped a CLI tool last year that looked like it was written in 1995. Plain text, no colors. Users hated it.

Spectre.Console (11.1k stars) turns terminal output into something you'd want to look at. Tables, trees, charts, spinners. I built a "Project Health Checker" demo to show what's possible.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/SpectreConsole){: .btn .btn--primary}

## Install

```bash
dotnet add package Spectre.Console
```

That's it. No CLI framework, no extra dependencies. One package.

## FigletText: ASCII Art Headers

First impression matters. A big ASCII banner beats "Project Health Checker v1.0" every time.

```csharp
AnsiConsole.Write(new FigletText("Project Health").Color(Color.Cyan1));
AnsiConsole.MarkupLine("[grey]Spectre.Console Demo — Project Health Checker[/]");
```

The `[grey]` and `[/]` are Spectre markup -- inline styling without raw ANSI escape codes. You wrap text in `[color]...[/]` or `[bold]...[/]`. Spectre converts it to the right escape sequences for your terminal.

If the terminal doesn't support ANSI, it strips the markup and falls back to plain text. No manual `\x1b[31m` nonsense.

## Status Spinner: Fake the Work

While your tool "analyzes" (or actually does work), show a spinner. Users hate staring at a frozen cursor.

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

## Table: The Health Report

Tables are where Spectre shines. Rounded borders, aligned columns, colored cells -- no manual string padding.

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

Markup in every cell. Red for bad, green for good, yellow for "fix this soon." The table handles column widths and alignment automatically.

## Tree: Dependency Graph with Annotations

Hierarchical data? Trees. In the demo, each project gets a node, dependencies nest underneath, and vulnerabilities get red badges.

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

`AddNode` returns a `TreeNode`, so you chain children. Mix text and markup freely. Outdated packages get `[yellow]`, CVEs get `[red bold]`.

## BarChart: Test Coverage at a Glance

Numbers in a table work. A bar chart works better when you're comparing across projects.

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

`AddItem(label, value, color)`. Spectre scales the bars to fit. Green/yellow/red by threshold -- same logic as the table, different presentation.

## Rule: Section Dividers with Content

Rules are horizontal lines. You can put text in them. In the demo, the final rule shows the summary.

```csharp
var healthy = projects.Count(p => p.Status == "Healthy");
var total = projects.Length;
var overallColor = healthy == total ? "green" : healthy >= total - 1 ? "yellow" : "red";
AnsiConsole.Write(new Rule($"[{overallColor} bold]{healthy}/{total} projects healthy[/]").RuleStyle(overallColor));
```

The rule color matches the status. Green line for "all good," red for "something's broken." Small touch, big impact.

## The Full Picture

The demo runs in one go: Figlet header, spinner, table, tree, chart, rule. No user input -- all output. Run it and see the difference.

```bash
cd playground/SpectreConsole/AnimatLabs.SpectreConsole
dotnet run
```

I didn't touch `Console.WriteLine` once. Everything goes through `AnsiConsole.Write` or `AnsiConsole.MarkupLine`. Spectre handles ANSI escape codes, terminal width, and fallbacks for unsupported environments.

## Tradeoffs and Gotchas

Spectre is great for output. It's not a CLI framework. That distinction matters.

**Spectre.Console vs System.CommandLine**

Spectre renders. System.CommandLine parses. They solve different problems. Use System.CommandLine (or Spectre.Console.Cli) for argument parsing, validation, and help generation. Use Spectre for everything that goes to stdout.

I've used both in the same tool -- System.CommandLine for `--verbose` and `--format json`, Spectre for the pretty table when format is default.

Spectre.Console.Cli bundles Spectre with its own command model. If you want prompts, confirmations, and type converters built in, go that route. If you only want Spectre for output, pair plain Spectre.Console with System.CommandLine.

**When not to use Spectre**

Don't use it for scripts that run headless in CI/CD and pipe output to logs. Jenkins, Azure DevOps, GitHub Actions -- many of these strip or mangle ANSI. Your beautiful table becomes `[31m` and `[0m` garbage in the build log.

Add a `--no-color` or `--plain` flag that bypasses Spectre for CI. I've seen teams branch on it: `if (plainOutput) Console.WriteLine(...) else AnsiConsole.Write(...)`. A bit of duplication, but it works.

Same for old Windows cmd.exe. Pre-Windows 10, ANSI support was spotty. Windows Terminal and modern PowerShell handle it fine -- legacy cmd does not.

If your users are on locked-down corporate desktops, test in cmd.exe before you ship.

**Terminal compatibility gotchas**

Spectre detects terminal capabilities and falls back to plain text. No colors, no box-drawing characters. The output still works -- it just looks flat.

If your layout depends on Unicode (box-drawing, emoji), it can break in minimal environments. Stick to ASCII for critical paths. Figlet uses ASCII art -- safe. Tables use box-drawing by default but can fall back to ASCII borders.

Don't assume every terminal is a 256-color TTY.

## Beyond Output

I only covered the output side. Spectre also does prompts, selections, multi-select, progress bars, and live display.

For quick scripts, `Console.WriteLine` is fine. For anything people actually use -- build helpers, health checkers, migration runners -- Spectre earns the extra package. One dependency.

**Playground:** [SpectreConsole](https://github.com/animat089/playground/tree/main/SpectreConsole)

What's your go-to for CLI output in .NET?

---

<!--
## LinkedIn Promo (150-250 words)

Console.WriteLine is embarrassing.

I shipped a CLI tool last year that looked like it was written in 1995. Plain text. No colors. No structure. Users hated it.

Then I found Spectre.Console -- 11k GitHub stars, and most .NET devs I talk to have never heard of it. Tables, trees, charts, spinners, progress bars. All with a few lines of code. No more manual string padding or ANSI escape sequences.

I built a "Project Health Checker" demo to showcase it: Figlet header, status spinner, health report table, dependency tree with vulnerability annotations, test coverage bar chart. Simulated data. Full working code in the playground.

One caveat: Spectre shines in interactive terminals. In CI/CD pipelines, ANSI often gets stripped -- your pretty table becomes escape-code garbage in the logs. Add a --plain flag for headless runs, or skip Spectre for that use case.

If you're still using Console.WriteLine for anything beyond a quick script, Spectre deserves a try. One NuGet package. Zero regrets.

What's your go-to for pretty CLI output in .NET?

[Link to blog post]
-->
