---
title: "Spectre.Console: Build Beautiful CLI Tools in C#"
excerpt: >-
  "11k GitHub stars and you've probably never heard of it. Spectre.Console makes terminal apps gorgeous—tables, progress bars, trees, and more."
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

`Console.WriteLine("Hello World")` is embarrassing. I've shipped CLI tools that looked like they were written in 1995—plain text, no colors, no structure. Users deserve better.

Spectre.Console has 11.1k stars on GitHub and most .NET devs I talk to have never heard of it. That's a shame. It turns your terminal output into something you'd actually want to look at: tables, trees, progress bars, spinners, charts. All with a few lines of code.

I built a "Project Health Checker" demo to showcase it. Simulated data, zero real analysis—just Spectre features in action. Here's how each piece works.

## Install

```bash
dotnet add package Spectre.Console
```

That's it. No CLI framework, no extra dependencies. Just Spectre.

## FigletText: ASCII Art Headers

First impression matters. A big ASCII banner beats "Project Health Checker v1.0" every time.

```csharp
AnsiConsole.Write(new FigletText("Project Health").Color(Color.Cyan1));
AnsiConsole.MarkupLine("[grey]Spectre.Console Demo — Project Health Checker[/]");
```

The `[grey]` and `[/]` are Spectre's markup—inline styling without escape codes. More on that later.

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

Tables are where Spectre shines. Rounded borders, aligned columns, colored cells—no manual string padding.

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

`AddItem(label, value, color)`. Spectre scales the bars to fit. Green/yellow/red by threshold—same logic as the table, different presentation.

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

The demo runs in one go: Figlet header, spinner, table, tree, chart, rule. No user input—just output. Run it and see the difference.

```bash
cd playground/SpectreConsole/AnimatLabs.SpectreConsole
dotnet run
```

I didn't touch `Console.WriteLine` once. Everything goes through `AnsiConsole.Write` or `AnsiConsole.MarkupLine`. Spectre handles ANSI escape codes, terminal width, and fallbacks for unsupported environments.

## What I Didn't Cover

Spectre.Console does more: prompts, selections, multi-select, progress bars, panels, live display. There's also Spectre.Console.Cli for argument parsing if you want a full CLI framework. I kept this focused on the visual output.

## The Bottom Line

`Console.WriteLine` is fine for quick scripts. For tools people actually use—build helpers, health checkers, migration runners—Spectre is worth the extra package. It's one dependency, it's well-maintained, and it makes your output look like it belongs in 2026.

What's your go-to for pretty CLI output in .NET—or are you still shipping plain text?

---

## LinkedIn Promo

**Console.WriteLine is embarrassing.**

I shipped a CLI tool last year that looked like it was written in 1995. Plain text. No colors. No structure. Users hated it.

Then I found Spectre.Console—11k GitHub stars, and most .NET devs I talk to have never heard of it. Tables, trees, charts, spinners, progress bars. All with a few lines of code. No more manual string padding or ANSI escape sequences.

I built a "Project Health Checker" demo to showcase it: Figlet header, status spinner, health report table, dependency tree with vulnerability annotations, test coverage bar chart. Simulated data. Full working code in the playground.

If you're still using `Console.WriteLine` for anything beyond a quick script, Spectre is worth a look. One NuGet package. Zero regrets.

What's your go-to for pretty CLI output in .NET?

[Link to blog post]
