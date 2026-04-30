---
title: "WorkflowForge + Geometry Pipeline: Orchestrated CAD Processing in C#"
excerpt: >-
  Chain xBIM model parsing, ACadSharp layer extraction, and Math.NET spatial transforms into a single WorkflowForge pipeline. Each step checkpoints, compensates on failure, and produces SVG output.
categories:
  - Technical
  - .NET
  - Workflow
  - Geometry
tags:
  - WorkflowForge
  - CAD
  - Pipeline
  - xBIM
  - ACadSharp
  - Math.NET Spatial
  - C#
  - Geometry
author: animat089
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I've already written most of this pipeline in scattered posts. Math.NET for vectors and planes, Helix for meshes when I'm in WPF, xBIM for IFC, ACadSharp for DWG/DXF.

What was missing wasn't another parser; it was a spine that keeps the messy stuff honest. Temporary files don't get left behind because I forgot an exception handler. Failed exports rewind the pieces that already ran. That's WorkflowForge talking: **MIT OSS, v2.1.1** on NuGet right now.

**Fork or star the core engine:** [WorkflowForge on GitHub](https://github.com/animatlabs/workflow-forge){: .btn .btn--primary}

**Runnable samples in my lab repo:** [Playground (WorkflowForge folder)](https://github.com/animat089/playground/tree/main/WorkflowForge){: .btn .btn--primary}

## What I'm wiring together

The flow I care about is boring in a good way:

1. Open a source file (IFC or DWG).
2. Pull out linework or mesh-ish geometry into a neutral DTO.
3. Transform and validate (units, bounds, right-handedness, whatever your domain punishes you for).
4. Emit something you can open without a CAD seat: SVG for 2D sections, or a mesh file for a viewer.

WorkflowForge runs those as **operations** on a **foundry** (shared state bag) with a **smith** executing `ForgeAsync`. If step three throws, whatever completed before that point runs `RestoreAsync` backwards. Step four never compensated if step three blew up before it started. Same rules I'd write for a payment saga, except the side effects are files and handles instead of auth captures.

I keep `WorkflowOperationBase` subclasses small. One file open, one mesh build, one validation pass, one writer. The engine already knows how to walk the stack.

## Packages

```bash
dotnet add package WorkflowForge --version 2.1.1
# Pick the CAD side you need (both is fine in one app)
dotnet add package Xbim.Essentials
dotnet add package Xbim.Ifc
dotnet add package ACadSharp
# Math layer (from the first geometry post in this series)
dotnet add package MathNet.Spatial
```

I'm not pasting full xBIM or ACadSharp reads here. You already have those walkthroughs. This post is about where they sit once you stop treating each script as a one-off.

The series so far was building blocks. Math first, then a 3D toolkit, then IFC, then DWG. This one is glue. I'm not selling WorkflowForge as a geometry library. It's the thing that says "do these four things in order, and if the last one fails, don't pretend the first three never happened."

## Shared context on the foundry

I keep everything the steps need in named keys on the foundry. Path in, path out, intermediate models, and "what to delete if we abort."

Prefixing keys with `geom.` is a cheap namespace so I never collide with saga fields if I later compose this pipeline inside a larger workflow. You can promote the strings to a constants class shared with your tests.

```csharp
public static class GeometryPipelineKeys
{
    public const string SourcePath = "geom.sourcePath";
    public const string WorkDir = "geom.workDir";
    public const string Scene = "geom.scene";           // your neutral DTO
    public const string OutputPath = "geom.outputPath";
    public const string TempFiles = "geom.tempFiles";   // List<string>
    public const string ParserHandle = "geom.parser";   // IDisposable, optional
}
```

```csharp
public sealed record CadScene(
    IReadOnlyList<CadPath2D> Paths2D,
    IReadOnlyList<CadTriangleMesh> Meshes3D);

public sealed record CadPath2D(string Layer, IReadOnlyList<(double X, double Y)> Points);
public sealed record CadTriangleMesh(
    IReadOnlyList<(double X, double Y, double Z)> Vertices,
    IReadOnlyList<(int A, int B, int C)> Triangles);
```

`CadScene` is the handoff between "CAD world" and "math world." You can slim it down to polylines only if you're SVG-only.

I pass paths as tuples on purpose. Records with `with` keep the sample short. In a real repo I'd probably use `Point2D` / `Point3D` from Math.NET end to end so I'm not double-tracking coordinate types.

## The workflow definition

Four operations, one job each. Order matters. Compensation order is automatic.

```csharp
public static class GeometryExportWorkflow
{
    public static IWorkflow Build() =>
        WorkflowForge
            .CreateWorkflow("GeometryExport")
            .AddOperation(new OpenCadSourceOperation())
            .AddOperation(new ExtractGeometryOperation())
            .AddOperation(new NormalizeAndValidateOperation())
            .AddOperation(new RenderOutputOperation())
            .Build();
}
```

Nothing parallel here. CAD reads are finicky enough without racing two formats. If I ever split "mesh pass" and "annotation pass" across workers, that's a second workflow with an explicit join, not a hidden thread pool inside one step.

## Step 1: open the source (parse / memory map)

`ForgeAsyncCore` picks IFC vs DWG from the extension, creates a scratch directory, and stashes anything I'll need to dispose later. `RestoreAsync` tears it down.

If you only target one format in a service, split this into two workflows. I keep a single entry point when my API accepts "any supported upload" and branches internally. The branching cost is one `if` block, not two deployables.

```csharp
public sealed class OpenCadSourceOperation : WorkflowOperationBase
{
    public override string Name => "OpenCadSource";

    protected override Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var sourcePath = foundry.GetPropertyOrDefault<string>(GeometryPipelineKeys.SourcePath)
            ?? throw new InvalidOperationException("SourcePath not set on foundry.");

        var work = Directory.CreateTempSubdirectory("wf-geom-");
        foundry.SetProperty(GeometryPipelineKeys.WorkDir, work.FullName);
        foundry.SetProperty(GeometryPipelineKeys.TempFiles, new List<string>());

        var ext = Path.GetExtension(sourcePath).ToLowerInvariant();
        if (ext is ".ifc")
        {
            // Pseudocode: your xBIM IfcStore open from the IFC post
            // var model = IfcStore.Open(sourcePath);
            // foundry.SetProperty(GeometryPipelineKeys.ParserHandle, model);
            foundry.Logger.LogInformation("Opened IFC {Path}", sourcePath);
        }
        else if (ext is ".dwg" or ".dxf")
        {
            // Pseudocode: ACadSharp CadDocument from the DWG post
            foundry.Logger.LogInformation("Opened CAD {Path}", sourcePath);
        }
        else
        {
            throw new NotSupportedException($"Unsupported source extension: {ext}");
        }

        return Task.FromResult(inputData);
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        if (foundry.GetPropertyOrDefault<IDisposable>(GeometryPipelineKeys.ParserHandle)
            is { } handle)
        {
            handle.Dispose();
            foundry.Logger.LogWarning("[{Name}] Disposed parser handle", Name);
        }

        if (foundry.GetPropertyOrDefault<string>(GeometryPipelineKeys.WorkDir) is { } dir
            && Directory.Exists(dir))
        {
            try
            {
                Directory.Delete(dir, recursive: true);
                foundry.Logger.LogWarning("[{Name}] Removed work dir {Dir}", Name, dir);
            }
            catch (Exception ex)
            {
                foundry.Logger.LogError(ex, "[{Name}] Failed to delete work dir", Name);
            }
        }

        return Task.CompletedTask;
    }
}
```

If you don't have a disposable model object, skip that branch. The temp directory delete is usually the part that saves disk on a bad run.

I log inside `RestoreAsync` at warning level on purpose. When I'm debugging a bad IFC, I want the compensate path to show up in the same trace as the forward path.

## Step 2: extract geometry into `CadScene`

This is where xBIM product shapes or ACadSharp entities become `CadPath2D` / `CadTriangleMesh`. I only store the result on the foundry; I don't write files yet.

I'll often push a layer filter or storey ID in through the foundry too. Same pattern as the MassTransit demo: configuration lives in `initialProperties`, not static singletons. That makes it easier to run ten files in a loop without mutating global state between passes.

```csharp
public sealed class ExtractGeometryOperation : WorkflowOperationBase
{
    public override string Name => "ExtractGeometry";

    protected override Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        // Snapshot for compensation (optional but nice when transforms later mutate in place)
        CadScene? previous = foundry.GetPropertyOrDefault<CadScene>(GeometryPipelineKeys.Scene);

        foundry.SetProperty("__geom.scene.before", previous);

        // Build scene from IFC or DWG using your existing helpers
        var scene = BuildSceneFromOpenModel(foundry, ct);
        foundry.SetProperty(GeometryPipelineKeys.Scene, scene);

        foundry.Logger.LogInformation(
            "[{Name}] Extracted {PathCount} paths, {MeshCount} meshes",
            Name, scene.Paths2D.Count, scene.Meshes3D.Count);

        return Task.FromResult(inputData);
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        if (foundry.GetPropertyOrDefault<CadScene>("__geom.scene.before") is { } prior)
        {
            foundry.SetProperty(GeometryPipelineKeys.Scene, prior);
            foundry.Logger.LogWarning("[{Name}] Restored previous scene snapshot", Name);
        }
        else
        {
            foundry.SetProperty(GeometryPipelineKeys.Scene, null);
            foundry.Logger.LogWarning("[{Name}] Cleared scene", Name);
        }

        return Task.CompletedTask;
    }

    private static CadScene BuildSceneFromOpenModel(IWorkflowFoundry foundry, CancellationToken ct)
    {
        // Wire in your real xBIM / ACadSharp extraction here.
        return new CadScene(
            Paths2D: Array.Empty<CadPath2D>(),
            Meshes3D: Array.Empty<CadTriangleMesh>());
    }
}
```

## Step 3: normalize and validate (Math.NET)

I treat this as a pure-ish step: read `CadScene`, apply scale/rotation/translation with `MathNet.Spatial.Euclidean`, check bounding boxes, drop degenerate segments, optionally project 3D to 2D for SVG.

The sample uses uniform scale only so the post stays readable. When I need a full rig, I build a `Matrix3D` (or stack `Vector3D` offsets and `UnitVector3D` axes) and multiply each vertex once. Same foundry snapshot pattern: stash the pre-transform scene, replace, restore on failure.

```csharp
// Add: using MathNet.Spatial.Euclidean when you rotate/translate with Matrix3D, Point3D, etc.

public sealed class NormalizeAndValidateOperation : WorkflowOperationBase
{
    public override string Name => "NormalizeAndValidate";

    protected override Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var scene = foundry.GetPropertyOrDefault<CadScene>(GeometryPipelineKeys.Scene)
            ?? throw new InvalidOperationException("Scene missing before normalize.");

        foundry.SetProperty("__geom.scene.unnormalized", scene);

        var scale = foundry.GetPropertyOrDefault<double>("geom.scale", 1.0);
        var scaled = ScaleScene(scene, scale);

        if (!HasFiniteBounds(scaled))
            throw new InvalidOperationException("Scene has non-finite coordinates after transform.");

        foundry.SetProperty(GeometryPipelineKeys.Scene, scaled);
        foundry.Logger.LogInformation("[{Name}] Normalize complete (scale={Scale})", Name, scale);

        return Task.FromResult(inputData);
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        if (foundry.GetPropertyOrDefault<CadScene>("__geom.scene.unnormalized") is { } prior)
        {
            foundry.SetProperty(GeometryPipelineKeys.Scene, prior);
            foundry.Logger.LogWarning("[{Name}] Reverted normalize", Name);
        }

        return Task.CompletedTask;
    }

    private static CadScene ScaleScene(CadScene scene, double s)
    {
        static (double X, double Y) Scale2((double X, double Y) p) => (p.X * s, p.Y * s);
        static (double X, double Y, double Z) Scale3((double X, double Y, double Z) p) =>
            (p.X * s, p.Y * s, p.Z * s);

        var paths = scene.Paths2D.Select(p => p with
        {
            Points = p.Points.Select(Scale2).ToArray()
        }).ToArray();

        var meshes = scene.Meshes3D.Select(m => m with
        {
            Vertices = m.Vertices.Select(Scale3).ToArray()
        }).ToArray();

        return new CadScene(paths, meshes);
    }

    private static bool HasFiniteBounds(CadScene scene)
    {
        foreach (var p in scene.Paths2D.SelectMany(x => x.Points))
            if (!double.IsFinite(p.X) || !double.IsFinite(p.Y)) return false;
        foreach (var v in scene.Meshes3D.SelectMany(m => m.Vertices))
            if (!double.IsFinite(v.X) || !double.IsFinite(v.Y) || !double.IsFinite(v.Z))
                return false;
        return true;
    }
}
```

If validation fails here, `RenderOutput` never ran, so its `RestoreAsync` does nothing. `NormalizeAndValidate` rolls back the scene, then `ExtractGeometry`, then `OpenCadSource` unwind in that order. That's the payoff.

## Step 4: render SVG or mesh

Last step owns the filesystem artifact. Compensation deletes a partial output if `ForgeAsyncCore` blew up mid-write, or removes the committed file if your policy is "all or nothing."

Writing to a temp file and atomically moving into place is another move I use in production so `RestoreAsync` deletes the `.tmp` sibling and the user never sees half an SVG. I'm not showing that rename dance here because the WorkflowForge bit is the same either way.

```csharp
public sealed class RenderOutputOperation : WorkflowOperationBase
{
    public override string Name => "RenderOutput";

    protected override Task<object?> ForgeAsyncCore(
        object? inputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        var scene = foundry.GetPropertyOrDefault<CadScene>(GeometryPipelineKeys.Scene)
            ?? throw new InvalidOperationException("Scene missing before render.");

        var outPath = foundry.GetPropertyOrDefault<string>(GeometryPipelineKeys.OutputPath)
            ?? throw new InvalidOperationException("OutputPath not set.");

        var fmt = Path.GetExtension(outPath).ToLowerInvariant();
        if (fmt is ".svg")
        {
            var svg = SvgSerializer.ToSvg(scene, foundry, ct); // your string builder
            File.WriteAllText(outPath, svg);
            foundry.SetProperty("geom.output.written", true);
        }
        else if (fmt is ".obj" or ".stl" or ".gltf")
        {
            MeshExport.Write(fmt, scene, outPath, foundry.Logger, ct);
            foundry.SetProperty("geom.output.written", true);
        }
        else
        {
            throw new NotSupportedException($"Output format '{fmt}' not supported.");
        }

        foundry.Logger.LogInformation("[{Name}] Wrote {OutPath}", Name, outPath);
        return Task.FromResult(inputData);
    }

    public override Task RestoreAsync(
        object? outputData, IWorkflowFoundry foundry, CancellationToken ct)
    {
        if (!foundry.GetPropertyOrDefault<bool>("geom.output.written", false))
            return Task.CompletedTask;

        if (foundry.GetPropertyOrDefault<string>(GeometryPipelineKeys.OutputPath) is { } path
            && File.Exists(path))
        {
            try
            {
                File.Delete(path);
                foundry.Logger.LogWarning("[{Name}] Deleted output file {Path}", Name, path);
            }
            catch (Exception ex)
            {
                foundry.Logger.LogError(ex, "[{Name}] Failed to delete output file", Name);
            }
        }

        return Task.CompletedTask;
    }
}

internal static class SvgSerializer
{
    internal static string ToSvg(CadScene scene, IWorkflowFoundry _, CancellationToken __)
        => "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>"; // fill with path data
}

internal static class MeshExport
{
    internal static void Write(
        string format, CadScene scene, string path, ILogger log, CancellationToken ct)
    {
        // STL/OBJ/glTF writers go here (Helix or a tiny OBJ writer fits).
    }
}
```

`geom.output.written` prevents `RestoreAsync` from deleting someone's old file when this run never succeeded far enough to own the artifact.

I only flip that flag after a flush finishes. If you're streaming a giant mesh, swap `File.WriteAllText` for chunked writes and keep the flag false until the final block lands.

## Running it

Same pattern I've used beside MassTransit: build workflow, hydrate foundry, run `ForgeAsync`.

```csharp
using var foundry = WorkflowForge.CreateFoundry(
    workflowName: "GeometryExport",
    initialProperties: new Dictionary<string, object?>
    {
        [GeometryPipelineKeys.SourcePath] = @"C:\data\walls.ifc",
        [GeometryPipelineKeys.OutputPath] = @"C:\out\walls.svg",
        ["geom.scale"] = 0.001 // mm to meters, etc.
    });

using var smith = WorkflowForge.CreateSmith(consoleLoggerOrYourAdapter);

var workflow = GeometryExportWorkflow.Build();
await smith.ForgeAsync(workflow, foundry, CancellationToken.None);
```

On failure you'll see `RestoreAsync` logs in reverse order. On success scratch dirs still get cleaned when you dispose whatever handle you opened, or you tack a fifth "JanitorOperation" at the end if you prefer explicit cleanup outside compensation.

I usually wrap the `ForgeAsync` call in the same try/catch pattern I used in the MassTransit order demo: log the exception once at the boundary, let compensation do the heavy lifting.

Versioning matters when you blog about a moving target. I pinned **2.1.1** because that's what shipped when I wrote the MassTransit saga post. Newer minors should keep this API shape, but if something renames, grep the repo tags and match your package to the sample you copied.

## Why I don't skip the engine anymore

Standalone scripts felt faster until half of them leaked temp folders under `%TEMP%` or overwrote SVGs with zero-byte files when validation failed late. Putting the saga rules in WorkflowForge means I write `ForgeAsyncCore`/`RestoreAsync` once per concern and stop reinventing unwind stacks in every CLI.

There's real geometry work under the hood, same as earlier posts in this thread. WorkflowForge just keeps the choreography from becoming the bug.

If you're choosing between SVG and a mesh, SVG is great for plans and sections where you already projected to 2D. Meshes are what I hand to Helix, three.js viewers, or glTF pipelines. The workflow shape doesn't change, only `RenderOutputOperation` and the serializer behind it.

`WorkflowForge.Testing` ships a fake foundry if you want to unit-test a single operation without spinning disks. I've used that pattern on payment workflows; geometry steps test the same way once you inject a parser behind an interface.

Compensation won't fix bad domain logic. If you scale twice and forget you're in feet instead of meters, `RestoreAsync` still puts files back where they were. It just keeps the collateral damage bounded while you fix the math.

## See also

- [Math.NET Spatial and NetTopologySuite](/technical/.net/.net-core/computational-geometry-mathnet/)
- [Helix Toolkit 3D](/technical/.net/.net-core/helix-toolkit-3d-wpf/)
- [IFC parsing with xBIM](/technical/.net/.net-core/ifc-parsing-xbim-csharp/)
- [DWG/DXF with ACadSharp](/technical/.net/.net-core/dwg-dxf-acadsharp-dotnet/)
- [WorkflowForge introduction](/technical/.net/workflow/workflow-forge-introduction/)
- [MassTransit saga + WorkflowForge compensation](/technical/.net/workflow/masstransit-workflowforge-saga/)

{% include cta-workflowforge.html %}

---

*That's the geometry series capstone: same parsers from earlier posts, with orchestration I'd actually ship. If you'd wire IFC and DWG into the stubs differently, say how in the comments.*
