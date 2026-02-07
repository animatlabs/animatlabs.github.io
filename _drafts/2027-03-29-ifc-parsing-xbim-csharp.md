---
title: "Parsing Building Models in C#: IFC Files with xBIM Toolkit"
excerpt: >-
  "Open IFC files, traverse building hierarchies, extract geometry, and render floor plans -- all in C# without any CAD software installed."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - xBIM
  - IFC
  - BIM
  - Geometry
  - CAD
  - SkiaSharp
  - Visualization
author: animat089
last_modified_at: 2027-03-29
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- What is IFC and why should .NET developers care?
- xBIM Toolkit overview (Xbim.Essentials, Xbim.Ifc, Xbim.Geometry)
- Opening and reading IFC files
- Traversing the building model hierarchy (IfcProject -> IfcSite -> IfcBuilding -> IfcBuildingStorey -> IfcSpace)
- Extracting properties and metadata from building elements
- Querying specific element types (walls, doors, windows, slabs)
- Working with geometry: bounding boxes, coordinates, placement
- Rendering a simple 2D floor plan with SkiaSharp
- Practical use cases: quantity takeoff, clash detection, model validation
- Performance considerations for large IFC files (streaming vs in-memory)

UNIQUE ANGLE: Personal connection to Autodesk/AEC industry. Hands-on walkthrough with real IFC files. 
Part of the Geometry & CAD in C# mini-series alongside Math.NET Spatial, ACadSharp, and Blazor viewer posts.

LIBRARIES:
- Xbim.Essentials (NuGet, .NET 6+)
- Xbim.Ifc (NuGet, .NET 6+)
- SkiaSharp (NuGet, 2D rendering)

LOCAL DEV: No cloud services needed. Sample IFC files available free from buildingSMART.
-->

## What is IFC and Why Should You Care?

IFC (Industry Foundation Classes) is the open standard for BIM (Building Information Modeling) data. Think of it as the "JSON of the construction industry" -- a structured, vendor-neutral format that describes an entire building: its geometry, materials, spatial relationships, and metadata.

If you work in AEC (Architecture, Engineering, Construction) tech -- or you're just curious about what buildings look like as data -- IFC is the file format you'll encounter most. And xBIM is the best open-source .NET toolkit to work with it.

## Setting Up xBIM

```csharp
// Install packages
// dotnet add package Xbim.Essentials
// dotnet add package Xbim.Ifc
// dotnet add package SkiaSharp

using Xbim.Ifc;
using Xbim.Ifc4.Interfaces;
using Xbim.Common;
```

### Getting Sample IFC Files

You can download free sample IFC files from [buildingSMART](https://www.buildingsmart.org/) or the [IFC Wiki](https://www.ifcwiki.org/). For this post, we'll use a simple office building model.

## Opening an IFC File

```csharp
// Open an IFC file -- xBIM handles IFC2x3 and IFC4 transparently
using var model = IfcStore.Open("OfficeBuilding.ifc");

Console.WriteLine($"Schema: {model.SchemaVersion}");
Console.WriteLine($"Description: {model.Header.FileDescription.Description.FirstOrDefault()}");

// Get the project -- the root of every IFC model
var project = model.Instances.FirstOrDefault<IIfcProject>();
Console.WriteLine($"Project: {project?.Name}");
```

## Traversing the Building Hierarchy

IFC models have a strict hierarchy: Project > Site > Building > Storey > Space. Here's how to walk it:

```csharp
public static void TraverseBuildingHierarchy(IModel model)
{
    var project = model.Instances.FirstOrDefault<IIfcProject>();
    if (project == null) return;

    Console.WriteLine($"Project: {project.Name}");

    // IfcProject -> IfcSite (via IfcRelAggregates)
    foreach (var site in project.Sites)
    {
        Console.WriteLine($"  Site: {site.Name}");

        foreach (var building in site.Buildings)
        {
            Console.WriteLine($"    Building: {building.Name}");

            // Get building storeys sorted by elevation
            var storeys = building.BuildingStoreys
                .OrderBy(s => s.Elevation)
                .ToList();

            foreach (var storey in storeys)
            {
                Console.WriteLine($"      Storey: {storey.Name} (Elevation: {storey.Elevation}m)");

                // Count elements on this storey
                var elements = storey.ContainsElements
                    .SelectMany(rel => rel.RelatedElements)
                    .ToList();

                Console.WriteLine($"        Elements: {elements.Count}");
            }
        }
    }
}
```

## Querying Building Elements

One of the most powerful aspects of xBIM is querying specific element types:

```csharp
public static void QueryElements(IModel model)
{
    // Get all walls
    var walls = model.Instances.OfType<IIfcWall>().ToList();
    Console.WriteLine($"Walls: {walls.Count}");

    // Get all doors with their dimensions
    var doors = model.Instances.OfType<IIfcDoor>().ToList();
    foreach (var door in doors)
    {
        Console.WriteLine($"Door: {door.Name}");
        Console.WriteLine($"  Width: {door.OverallWidth}mm");
        Console.WriteLine($"  Height: {door.OverallHeight}mm");
    }

    // Get all windows
    var windows = model.Instances.OfType<IIfcWindow>().ToList();
    Console.WriteLine($"Windows: {windows.Count}");

    // Get all spaces (rooms) with their areas
    var spaces = model.Instances.OfType<IIfcSpace>().ToList();
    foreach (var space in spaces)
    {
        Console.WriteLine($"Space: {space.LongName ?? space.Name}");
        
        // Extract area from property sets
        var area = GetPropertyValue(space, "Qto_SpaceBaseQuantities", "NetFloorArea");
        if (area != null)
            Console.WriteLine($"  Area: {area} m²");
    }
}
```

## Extracting Properties and Metadata

IFC elements carry rich metadata through Property Sets (Psets):

```csharp
public static object? GetPropertyValue(
    IIfcObject element, string psetName, string propertyName)
{
    // Navigate: Element -> IfcRelDefinesByProperties -> IfcPropertySet -> IfcProperty
    var psets = element.IsDefinedBy
        .Where(r => r.RelatingPropertyDefinition is IIfcPropertySet)
        .Select(r => r.RelatingPropertyDefinition as IIfcPropertySet);

    var targetPset = psets.FirstOrDefault(p => p?.Name == psetName);
    if (targetPset == null) return null;

    var property = targetPset.HasProperties
        .OfType<IIfcPropertySingleValue>()
        .FirstOrDefault(p => p.Name == propertyName);

    return property?.NominalValue?.Value;
}

// Example: Extract material information
public static void ExtractMaterials(IIfcWall wall)
{
    var materialAssocs = wall.HasAssociations
        .OfType<IIfcRelAssociatesMaterial>();

    foreach (var assoc in materialAssocs)
    {
        if (assoc.RelatingMaterial is IIfcMaterial material)
        {
            Console.WriteLine($"Material: {material.Name}");
        }
        else if (assoc.RelatingMaterial is IIfcMaterialLayerSetUsage layerUsage)
        {
            foreach (var layer in layerUsage.ForLayerSet.MaterialLayers)
            {
                Console.WriteLine($"Layer: {layer.Material?.Name}, " +
                                  $"Thickness: {layer.LayerThickness}mm");
            }
        }
    }
}
```

## Rendering a Simple Floor Plan with SkiaSharp

Here's where it gets visual -- let's extract wall outlines and render a 2D floor plan:

```csharp
using SkiaSharp;

public static void RenderFloorPlan(
    IModel model, string storeyName, string outputPath)
{
    var storey = model.Instances.OfType<IIfcBuildingStorey>()
        .FirstOrDefault(s => s.Name == storeyName);
    if (storey == null) return;

    // Collect wall bounding boxes on this storey
    var walls = storey.ContainsElements
        .SelectMany(r => r.RelatedElements)
        .OfType<IIfcWall>()
        .ToList();

    // Extract placement coordinates for each wall
    var wallRects = new List<SKRect>();
    foreach (var wall in walls)
    {
        if (wall.ObjectPlacement is IIfcLocalPlacement placement)
        {
            var coords = ExtractPlacementCoordinates(placement);
            // Simplified -- real implementation would use geometry engine
            wallRects.Add(new SKRect(
                (float)coords.X, (float)coords.Y,
                (float)(coords.X + 5), (float)(coords.Y + 0.3)));
        }
    }

    // Render to PNG
    const int width = 1200, height = 800;
    using var surface = SKSurface.Create(new SKImageInfo(width, height));
    var canvas = surface.Canvas;
    canvas.Clear(SKColors.White);

    var wallPaint = new SKPaint
    {
        Color = SKColors.DarkSlateGray,
        Style = SKPaintStyle.Fill,
        IsAntialias = true
    };

    // Scale and center the drawing
    var bounds = CalculateBounds(wallRects);
    var scale = Math.Min(
        (width - 40) / bounds.Width,
        (height - 40) / bounds.Height);

    canvas.Translate(20, 20);
    canvas.Scale(scale, scale);
    canvas.Translate(-bounds.Left, -bounds.Top);

    foreach (var rect in wallRects)
    {
        canvas.DrawRect(rect, wallPaint);
    }

    // Save as PNG
    using var image = surface.Snapshot();
    using var data = image.Encode(SKEncodedImageFormat.Png, 90);
    using var stream = File.OpenWrite(outputPath);
    data.SaveTo(stream);

    Console.WriteLine($"Floor plan saved to {outputPath}");
}
```

## Practical Use Cases

### Quantity Takeoff

```csharp
// Calculate total wall area for cost estimation
public static void QuantityTakeoff(IModel model)
{
    var walls = model.Instances.OfType<IIfcWall>();
    double totalArea = 0;

    foreach (var wall in walls)
    {
        var area = GetPropertyValue(wall, "Qto_WallBaseQuantities", "NetSideArea");
        if (area is double a)
            totalArea += a;
    }

    Console.WriteLine($"Total wall area: {totalArea:F2} m²");

    // Count elements by type
    var elementCounts = model.Instances.OfType<IIfcBuildingElement>()
        .GroupBy(e => e.GetType().Name)
        .Select(g => new { Type = g.Key, Count = g.Count() })
        .OrderByDescending(x => x.Count);

    foreach (var item in elementCounts)
    {
        Console.WriteLine($"  {item.Type}: {item.Count}");
    }
}
```

### Model Validation

```csharp
// Validate model for common issues
public static void ValidateModel(IModel model)
{
    var issues = new List<string>();

    // Check for unnamed spaces
    var unnamedSpaces = model.Instances.OfType<IIfcSpace>()
        .Where(s => string.IsNullOrEmpty(s.Name?.ToString()));
    foreach (var space in unnamedSpaces)
    {
        issues.Add($"Space #{space.EntityLabel} has no name");
    }

    // Check for walls without material
    var wallsNoMaterial = model.Instances.OfType<IIfcWall>()
        .Where(w => !w.HasAssociations.OfType<IIfcRelAssociatesMaterial>().Any());
    foreach (var wall in wallsNoMaterial)
    {
        issues.Add($"Wall '{wall.Name}' has no material assigned");
    }

    // Check for duplicate GUIDs
    var duplicateGuids = model.Instances.OfType<IIfcRoot>()
        .GroupBy(e => e.GlobalId.ToString())
        .Where(g => g.Count() > 1);
    foreach (var group in duplicateGuids)
    {
        issues.Add($"Duplicate GUID: {group.Key} ({group.Count()} elements)");
    }

    Console.WriteLine($"Validation complete: {issues.Count} issues found");
    issues.ForEach(i => Console.WriteLine($"  - {i}"));
}
```

## Performance Tips for Large IFC Files

```csharp
// For large files (100MB+), use IfcStore options
var editorDetails = new XbimEditorCredentials
{
    ApplicationDevelopersName = "AnimatLabs",
    ApplicationFullName = "IFC Reader",
    ApplicationVersion = "1.0",
    EditorsFamilyName = "Agarwal"
};

// Use Esent storage for very large files (reduces memory usage)
using var model = IfcStore.Open(
    "LargeBuilding.ifc",
    editorDetails,
    accessMode: XbimDBAccess.Read);

// Query with LINQ -- xBIM optimizes these
var wallCount = model.Instances.CountOf<IIfcWall>();

// Use parallel processing for element extraction
var results = model.Instances.OfType<IIfcBuildingElement>()
    .AsParallel()
    .Select(e => new
    {
        e.Name,
        Type = e.GetType().Name,
        HasMaterial = e.HasAssociations
            .OfType<IIfcRelAssociatesMaterial>().Any()
    })
    .ToList();
```

## What's Next

This is part 1 of the **Geometry & CAD in C#** series:
1. **IFC Files with xBIM** (this post)
2. [DWG/DXF Files with ACadSharp](/technical/.net/.net-core/dwg-dxf-acadsharp-dotnet/) -- reading AutoCAD files
3. [Interactive Geometry Viewer with Blazor WASM](/technical/.net/.net-core/blazor-wasm-geometry-viewer/) -- browser-based visualization
4. [Computational Geometry with Math.NET Spatial](/technical/.net/.net-core/computational-geometry-mathnet/) -- geometric algorithms

## Conclusion

xBIM makes IFC files accessible to any .NET developer -- no AutoCAD, no Revit, no expensive licenses. Whether you're building a model viewer, automating quantity takeoffs, or validating BIM data, xBIM gives you the full power of IFC in idiomatic C#.

The AEC industry is massive and underserved by modern developer tooling. If you're looking for a niche where .NET skills translate directly into real-world impact, BIM technology is it.

---

*Working with IFC files in .NET? Have questions about xBIM? Drop a comment below!*
