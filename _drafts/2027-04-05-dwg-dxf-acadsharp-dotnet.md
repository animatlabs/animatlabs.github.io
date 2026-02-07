---
title: "Reading AutoCAD Files in .NET: DWG and DXF with ACadSharp"
excerpt: >-
  "Parse real DWG and DXF files without AutoCAD installed -- extract layers, entities, text, and dimensions. All in C# with a 636-star MIT library."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - ACadSharp
  - DWG
  - DXF
  - CAD
  - Geometry
  - AutoCAD
author: animat089
last_modified_at: 2027-04-05
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- What are DWG/DXF files and where you'll encounter them
- ACadSharp library overview (MIT license, 636 stars, .NET Standard 2.1)
- Reading DWG files: DwgReader
- Reading DXF files: DxfReader
- Understanding the document structure: Header, Layers, Blocks, Entities
- Working with entities: Lines, Circles, Arcs, Polylines, Text, Dimensions
- Extracting layer information and filtering by layer
- Building a simple entity browser/report
- Spatial queries with NetTopologySuite on extracted geometry
- Writing DXF files: creating drawings programmatically
- Real-world use cases: automated drawing analysis, data extraction, format conversion
- Performance: large file handling

UNIQUE ANGLE: Parse AutoCAD files without AutoCAD. Build an entity browser. 
Part of Geometry & CAD in C# series.

LIBRARIES:
- ACadSharp (NuGet, MIT license, .NET Standard 2.1)
- NetTopologySuite (for spatial queries)

LOCAL DEV: No cloud services. Sample DXF files easily created or downloaded.
-->

## The Problem: AutoCAD Files Are Everywhere

DWG and DXF files are the lingua franca of engineering drawings. Architects, mechanical engineers, electrical designers -- they all produce DWG files. And sooner or later, a developer gets asked: "Can you extract data from these drawings?"

The traditional answer involves expensive AutoCAD licenses or proprietary SDKs. ACadSharp changes that -- it's a free, MIT-licensed .NET library that reads and writes DWG/DXF files with zero dependencies on Autodesk software.

## Setting Up ACadSharp

```csharp
// dotnet add package ACadSharp
// dotnet add package NetTopologySuite (optional, for spatial queries)

using ACadSharp;
using ACadSharp.IO;
using ACadSharp.Entities;
using ACadSharp.Tables;
```

## Reading DWG Files

```csharp
// DWG is AutoCAD's native binary format
using var reader = new DwgReader("FloorPlan.dwg");
var document = reader.Read();

Console.WriteLine($"Version: {document.Header.Version}");
Console.WriteLine($"Entities: {document.Entities.Count()}");
Console.WriteLine($"Layers: {document.Layers.Count()}");
Console.WriteLine($"Blocks: {document.BlockRecords.Count()}");
```

## Reading DXF Files

```csharp
// DXF is the text/binary interchange format
using var reader = new DxfReader("FloorPlan.dxf");
var document = reader.Read();

// Same API as DWG -- ACadSharp abstracts the format difference
Console.WriteLine($"Entities: {document.Entities.Count()}");
```

## Understanding the Document Structure

A CAD document has a well-defined structure:

```csharp
public static void InspectDocument(CadDocument document)
{
    // Header: drawing settings and variables
    Console.WriteLine($"=== Header ===");
    Console.WriteLine($"Version: {document.Header.Version}");
    Console.WriteLine($"Created by: {document.Header.VersionString}");

    // Layers: organizational groups (like Photoshop layers)
    Console.WriteLine($"\n=== Layers ({document.Layers.Count()}) ===");
    foreach (var layer in document.Layers)
    {
        Console.WriteLine($"  {layer.Name}");
        Console.WriteLine($"    Color: {layer.Color}");
        Console.WriteLine($"    Visible: {!layer.IsOff}");
        Console.WriteLine($"    Frozen: {layer.IsFrozen}");
    }

    // Entities: the actual geometry
    Console.WriteLine($"\n=== Entities ({document.Entities.Count()}) ===");
    var entityGroups = document.Entities
        .GroupBy(e => e.GetType().Name)
        .OrderByDescending(g => g.Count());

    foreach (var group in entityGroups)
    {
        Console.WriteLine($"  {group.Key}: {group.Count()}");
    }
}
```

## Working with Entities

### Lines

```csharp
var lines = document.Entities.OfType<Line>().ToList();
foreach (var line in lines)
{
    Console.WriteLine($"Line: ({line.StartPoint.X:F2}, {line.StartPoint.Y:F2}) " +
                      $"-> ({line.EndPoint.X:F2}, {line.EndPoint.Y:F2})");
    Console.WriteLine($"  Length: {line.StartPoint.DistanceFrom(line.EndPoint):F2}");
    Console.WriteLine($"  Layer: {line.Layer?.Name}");
}
```

### Circles and Arcs

```csharp
var circles = document.Entities.OfType<Circle>().ToList();
foreach (var circle in circles)
{
    Console.WriteLine($"Circle: Center=({circle.Center.X:F2}, {circle.Center.Y:F2}), " +
                      $"Radius={circle.Radius:F2}");
}

var arcs = document.Entities.OfType<Arc>().ToList();
foreach (var arc in arcs)
{
    Console.WriteLine($"Arc: Center=({arc.Center.X:F2}, {arc.Center.Y:F2}), " +
                      $"Radius={arc.Radius:F2}, " +
                      $"Start={arc.StartAngle:F1}° End={arc.EndAngle:F1}°");
}
```

### Polylines (Complex Shapes)

```csharp
// LwPolyline: 2D lightweight polylines (most common)
var polylines = document.Entities.OfType<LwPolyline>().ToList();
foreach (var pline in polylines)
{
    Console.WriteLine($"Polyline: {pline.Vertices.Count} vertices, " +
                      $"Closed={pline.IsClosed}");

    foreach (var vertex in pline.Vertices)
    {
        Console.WriteLine($"  ({vertex.Location.X:F2}, {vertex.Location.Y:F2})" +
                          $"{(vertex.Bulge != 0 ? $" bulge={vertex.Bulge:F3}" : "")}");
    }
}
```

### Text and Dimensions

```csharp
// Single-line text
var texts = document.Entities.OfType<TextEntity>().ToList();
foreach (var text in texts)
{
    Console.WriteLine($"Text: \"{text.Value}\" at ({text.InsertPoint.X:F2}, {text.InsertPoint.Y:F2})");
    Console.WriteLine($"  Height: {text.Height:F2}, Rotation: {text.Rotation:F1}°");
}

// Multi-line text (MText)
var mtexts = document.Entities.OfType<MText>().ToList();
foreach (var mtext in mtexts)
{
    Console.WriteLine($"MText: \"{mtext.Value}\"");
    Console.WriteLine($"  Width: {mtext.RectangleWidth:F2}");
}

// Dimensions
var dimensions = document.Entities.OfType<DimensionBase>().ToList();
Console.WriteLine($"Total dimensions: {dimensions.Count}");
```

## Filtering by Layer

```csharp
// Extract only entities from specific layers
public static List<Entity> GetEntitiesByLayer(
    CadDocument document, params string[] layerNames)
{
    var targetLayers = new HashSet<string>(
        layerNames, StringComparer.OrdinalIgnoreCase);

    return document.Entities
        .Where(e => e.Layer != null && targetLayers.Contains(e.Layer.Name))
        .ToList();
}

// Example: Get only wall outlines and door swings
var walls = GetEntitiesByLayer(document, "A-WALL", "A-WALL-FULL");
var doors = GetEntitiesByLayer(document, "A-DOOR");
var furniture = GetEntitiesByLayer(document, "A-FURN");

Console.WriteLine($"Walls: {walls.Count}, Doors: {doors.Count}, Furniture: {furniture.Count}");
```

## Building an Entity Report

```csharp
public static void GenerateDrawingReport(CadDocument document, string outputPath)
{
    using var writer = new StreamWriter(outputPath);
    writer.WriteLine($"# Drawing Report");
    writer.WriteLine($"Generated: {DateTime.UtcNow:yyyy-MM-dd HH:mm}");
    writer.WriteLine();

    // Summary
    writer.WriteLine("## Summary");
    writer.WriteLine($"| Metric | Value |");
    writer.WriteLine($"|--------|-------|");
    writer.WriteLine($"| Total Entities | {document.Entities.Count()} |");
    writer.WriteLine($"| Layers | {document.Layers.Count()} |");
    writer.WriteLine($"| Lines | {document.Entities.OfType<Line>().Count()} |");
    writer.WriteLine($"| Circles | {document.Entities.OfType<Circle>().Count()} |");
    writer.WriteLine($"| Polylines | {document.Entities.OfType<LwPolyline>().Count()} |");
    writer.WriteLine($"| Text | {document.Entities.OfType<TextEntity>().Count()} |");
    writer.WriteLine();

    // Layer breakdown
    writer.WriteLine("## By Layer");
    var byLayer = document.Entities
        .GroupBy(e => e.Layer?.Name ?? "(no layer)")
        .OrderByDescending(g => g.Count());

    writer.WriteLine("| Layer | Entities | Types |");
    writer.WriteLine("|-------|----------|-------|");
    foreach (var group in byLayer)
    {
        var types = string.Join(", ", group
            .GroupBy(e => e.GetType().Name)
            .Select(t => $"{t.Key}({t.Count()})"));
        writer.WriteLine($"| {group.Key} | {group.Count()} | {types} |");
    }

    Console.WriteLine($"Report saved to {outputPath}");
}
```

## Spatial Queries with NetTopologySuite

Combine ACadSharp with NetTopologySuite for powerful spatial analysis:

```csharp
using NetTopologySuite.Geometries;
using NetTopologySuite.Index.Strtree;

public static void SpatialQueries(CadDocument document)
{
    var factory = new GeometryFactory();

    // Convert CAD lines to NTS geometries
    var ntsLines = document.Entities.OfType<Line>()
        .Select(line => factory.CreateLineString(new[]
        {
            new Coordinate(line.StartPoint.X, line.StartPoint.Y),
            new Coordinate(line.EndPoint.X, line.EndPoint.Y)
        }))
        .ToList();

    // Build spatial index for fast queries
    var index = new STRtree<Geometry>();
    foreach (var line in ntsLines)
    {
        index.Insert(line.EnvelopeInternal, line);
    }
    index.Build();

    // Query: find all entities within a bounding box
    var searchArea = new Envelope(0, 100, 0, 100);
    var results = index.Query(searchArea);
    Console.WriteLine($"Entities in search area: {results.Count}");

    // Query: find intersecting elements
    var testLine = factory.CreateLineString(new[]
    {
        new Coordinate(50, 0),
        new Coordinate(50, 200)
    });

    var intersecting = ntsLines
        .Where(l => l.Intersects(testLine))
        .ToList();
    Console.WriteLine($"Lines crossing x=50: {intersecting.Count}");
}
```

## Writing DXF Files

Create drawings programmatically:

```csharp
public static void CreateSimpleDrawing(string outputPath)
{
    var document = new CadDocument();

    // Create a custom layer
    var wallLayer = new Layer("WALLS");
    wallLayer.Color = new Color(1); // Red
    document.Layers.Add(wallLayer);

    // Draw a room (4 walls)
    var walls = new[]
    {
        new Line { StartPoint = new CSMath.XYZ(0, 0, 0), EndPoint = new CSMath.XYZ(10, 0, 0) },
        new Line { StartPoint = new CSMath.XYZ(10, 0, 0), EndPoint = new CSMath.XYZ(10, 8, 0) },
        new Line { StartPoint = new CSMath.XYZ(10, 8, 0), EndPoint = new CSMath.XYZ(0, 8, 0) },
        new Line { StartPoint = new CSMath.XYZ(0, 8, 0), EndPoint = new CSMath.XYZ(0, 0, 0) }
    };

    foreach (var wall in walls)
    {
        wall.Layer = wallLayer;
        document.Entities.Add(wall);
    }

    // Add a label
    var label = new TextEntity
    {
        Value = "Office Room",
        InsertPoint = new CSMath.XYZ(5, 4, 0),
        Height = 0.5
    };
    document.Entities.Add(label);

    // Save as DXF
    using var writer = new DxfWriter(outputPath, document, false);
    writer.Write();

    Console.WriteLine($"Drawing saved to {outputPath}");
}
```

## Performance Considerations

```csharp
// For large DWG files (50MB+):

// 1. Use the reader directly for streaming access
using var reader = new DwgReader("Massive.dwg");
var document = reader.Read();

// 2. Filter early -- don't materialize all entities
var wallLines = document.Entities
    .OfType<Line>()
    .Where(l => l.Layer?.Name == "WALLS")
    .Take(1000) // Limit if you just need a sample
    .ToList();

// 3. For spatial queries, build an index first (O(log n) vs O(n))
// See the NetTopologySuite STRtree example above

// 4. Dispose properly -- CadDocument can hold significant memory
```

## What's Next

This is part 2 of the **Geometry & CAD in C#** series:
1. [IFC Files with xBIM](/technical/.net/.net-core/ifc-parsing-xbim-csharp/) -- parsing building information models
2. **DWG/DXF Files with ACadSharp** (this post)
3. [Interactive Geometry Viewer with Blazor WASM](/technical/.net/.net-core/blazor-wasm-geometry-viewer/) -- browser-based visualization
4. [Computational Geometry with Math.NET Spatial](/technical/.net/.net-core/computational-geometry-mathnet/) -- geometric algorithms

## Conclusion

ACadSharp proves you don't need AutoCAD to work with CAD files. For data extraction, automated reporting, format conversion, or building custom viewers, it's a capable, free, and actively maintained library.

Combined with NetTopologySuite for spatial queries and SkiaSharp for rendering, you have a complete CAD processing pipeline in pure .NET.

---

*Working with DWG/DXF files in .NET? Have a use case to share? Drop a comment below!*
