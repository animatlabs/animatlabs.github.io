---
title: "Computational Geometry in C# with Math.NET Spatial and NetTopologySuite"
excerpt: >-
  Points, polygons, spatial queries, and SVG output. Two NuGet packages turn C# into a geometry workbench without leaving your IDE.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Math.NET
  - Geometry
  - Visualization
  - NetTopologySuite
  - Spatial
author: animat089
last_modified_at: 2026-05-05
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
faq:
  - q: "Can I do computational geometry in C# without paid libraries?"
    a: "Yes. Math.NET Spatial and NetTopologySuite are both MIT-licensed. Together they cover 2D/3D vector math, polygon booleans, spatial indexing, and convex hulls."
  - q: "What is the difference between Math.NET Spatial and NetTopologySuite?"
    a: "Math.NET Spatial handles point, vector, and coordinate system math. NetTopologySuite handles planar geometry operations: polygon union/intersection, buffering, spatial indexes, and convex hull computation."
  - q: "How do I render geometry output from C# without a UI framework?"
    a: "Write SVG. It is just XML strings with coordinates. No rendering library needed. Open the file in any browser."
---

I spent a week writing collision detection math from scratch for a side project. Dot products, cross products, polygon intersection tests. Everything worked, but the code was ugly and the edge cases ate me alive.

Then I found Math.NET Spatial. Two lines to compute the angle between vectors. One method call for point-to-line distance. I rewrote the whole thing in an afternoon.

Here is the geometry stack I actually use: Math.NET Spatial for the linear algebra, NetTopologySuite for the polygon ops, and a dead-simple SVG renderer to see what the code produces.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/ComputationalGeometry){: .btn .btn--primary}

## Two Libraries, Two Jobs

**Math.NET Spatial** gives you typed 2D/3D primitives: `Point2D`, `Vector2D`, `Point3D`, `Line3D`, `Plane`. Distances, angles, dot/cross products, rotations, coordinate transforms. The math layer.

**NetTopologySuite** (NTS) is the JTS port. Polygons, line strings, multi-geometries. Union, intersection, difference, buffering, convex hulls, spatial indexing. The shape layer.

Different problems. I use both in the same project without conflict.

```bash
dotnet add package MathNet.Spatial
dotnet add package NetTopologySuite
```

## Points, Vectors, and Angles

Math.NET Spatial's `Point2D` and `Vector2D` are immutable value types. Arithmetic works the way you expect:

```csharp
using MathNet.Spatial.Euclidean;

var origin = new Point2D(0, 0);
var p1 = new Point2D(3, 4);

double dist = origin.DistanceTo(p1); // 5.0

var v1 = new Vector2D(3, 4);
var v2 = new Vector2D(-2, 7);

double dot = v1.DotProduct(v2);        // 22.0
double cross = v1.CrossProduct(v2);     // 29.0

var angle = v1.SignedAngleTo(v2, clockWise: false);
Console.WriteLine($"{angle.Degrees:F1} degrees"); // 52.8 degrees

var normalized = v1.Normalize();
// (0.600, 0.800) - unit vector in same direction
```

The 3D API mirrors the 2D one. `Point3D`, `Vector3D`, `Line3D`, `Plane` all follow the same conventions:

```csharp
var v3d1 = new Vector3D(1, 0, 0);
var v3d2 = new Vector3D(0, 1, 0);
var cross3d = v3d1.CrossProduct(v3d2);
// (0, 0, 1) - perpendicular to both
```

No matrix libraries to import. No separate linear algebra package. The types carry the operations.

## Polygon Boolean Operations

NTS handles the shapes. Create a polygon from a coordinate ring, then call `.Intersection()`, `.Union()`, `.Difference()`, or `.SymmetricDifference()`:

```csharp
using NetTopologySuite.Geometries;

var factory = new GeometryFactory();

var square = factory.CreatePolygon(new[]
{
    new Coordinate(0, 0), new Coordinate(100, 0),
    new Coordinate(100, 100), new Coordinate(0, 100),
    new Coordinate(0, 0)
});

// Approximate a circle with 64 segments
var circleCoords = Enumerable.Range(0, 65)
    .Select(i =>
    {
        double angle = 2 * Math.PI * i / 64;
        return new Coordinate(70 + 60 * Math.Cos(angle), 70 + 60 * Math.Sin(angle));
    }).ToArray();
var circle = factory.CreatePolygon(circleCoords);

var intersection = square.Intersection(circle);
var union = square.Union(circle);
var difference = square.Difference(circle);

Console.WriteLine($"Square area:        {square.Area:F0}");
Console.WriteLine($"Circle area:        {circle.Area:F0}");
Console.WriteLine($"Intersection area:  {intersection.Area:F0}");
Console.WriteLine($"Union area:         {union.Area:F0}");
Console.WriteLine($"Difference area:    {difference.Area:F0}");
```

Output:

```
Square area:        10000
Circle area:        11292
Intersection area:  7164
Union area:         14128
Difference area:    2836
```

Buffering is useful for creating corridors around lines or expanding polygons:

```csharp
var line = factory.CreateLineString(new[]
{
    new Coordinate(20, 150),
    new Coordinate(180, 150)
});

var buffered = line.Buffer(15);
// Creates a rounded rectangle around the line
```

Every operation returns a new `Geometry`. The originals stay untouched.

## Spatial Indexing with STRtree

Checking every point against every polygon is O(n*m). NTS ships an STRtree (Sort-Tile-Recursive tree) that narrows the search space with bounding-box queries:

```csharp
using NetTopologySuite.Index.Strtree;

var tree = new STRtree<Point>();
var rng = new Random(42);

// Insert 200 random points
for (int i = 0; i < 200; i++)
{
    var pt = factory.CreatePoint(new Coordinate(
        rng.NextDouble() * 400,
        rng.NextDouble() * 300));
    tree.Insert(pt.EnvelopeInternal, pt);
}
tree.Build();

// Range query: which points fall inside a rectangle?
var window = new Envelope(100, 200, 80, 180);
var hits = tree.Query(window);
Console.WriteLine($"Points in window: {hits.Count}");
// 16 out of 200
```

For nearest-neighbor, expand a search envelope until you find candidates, then pick the closest:

```csharp
var target = new Coordinate(250, 150);
double radius = 10;
var targetPoint = factory.CreatePoint(target);

while (radius < 1000)
{
    var env = new Envelope(
        target.X - radius, target.X + radius,
        target.Y - radius, target.Y + radius);

    var candidates = tree.Query(env);
    if (candidates.Count > 0)
    {
        var nearest = candidates
            .OrderBy(p => p.Distance(targetPoint))
            .First();

        Console.WriteLine($"Nearest: ({nearest.X:F1}, {nearest.Y:F1})");
        break;
    }
    radius *= 2;
}
```

With thousands of geometries, this is the difference between seconds and milliseconds. Build is O(n log n), queries are O(log n).

## Convex Hull

The convex hull is the smallest convex polygon that contains all points. Think shrink-wrap around a scatter of nails.

NTS computes it in one call:

```csharp
var coords = new Coordinate[50];
var rng = new Random(123);

for (int i = 0; i < coords.Length; i++)
{
    coords[i] = new Coordinate(
        rng.NextDouble() * 300 + 50,
        rng.NextDouble() * 200 + 50);
}

var multiPoint = factory.CreateMultiPointFromCoords(coords);
var hull = multiPoint.ConvexHull();

Console.WriteLine($"Hull vertices: {hull.Coordinates.Length - 1}");
Console.WriteLine($"Hull area: {hull.Area:F0}");
Console.WriteLine($"Hull perimeter: {hull.Length:F1}");

var centroid = hull.Centroid;
Console.WriteLine($"Centroid: ({centroid.X:F1}, {centroid.Y:F1})");
```

50 input points, 9 hull vertices, area of 53,665. The centroid gives you the geometric center.

## Rendering to SVG

I wanted to see what the code produces without pulling in SkiaSharp or a WPF dependency. SVG is just XML with coordinates. A minimal renderer writes polygons, circles, lines, and text:

```csharp
public sealed class SvgRenderer
{
    private readonly StringBuilder _body = new();
    private double _minX = double.MaxValue, _minY = double.MaxValue;
    private double _maxX = double.MinValue, _maxY = double.MinValue;

    public void AddPolygon(Geometry geometry, string fill, string stroke, double opacity)
    {
        ExpandBounds(geometry.EnvelopeInternal);

        foreach (var ring in ExtractRings(geometry))
        {
            var points = string.Join(" ",
                ring.Select(c => $"{c.X:F2},{c.Y:F2}"));
            _body.AppendLine(
                $"  <polygon points=\"{points}\" fill=\"{fill}\" " +
                $"stroke=\"{stroke}\" opacity=\"{opacity:F2}\" />");
        }
    }

    public void AddPoints(IEnumerable<Coordinate> coords, string fill, double radius)
    {
        foreach (var c in coords)
        {
            ExpandBounds(c);
            _body.AppendLine(
                $"  <circle cx=\"{c.X:F2}\" cy=\"{c.Y:F2}\" " +
                $"r=\"{radius:F2}\" fill=\"{fill}\" />");
        }
    }

    public string Render()
    {
        double pad = 20;
        double w = _maxX - _minX + pad * 2;
        double h = _maxY - _minY + pad * 2;

        var sb = new StringBuilder();
        sb.AppendLine($"<svg xmlns=\"http://www.w3.org/2000/svg\" " +
            $"viewBox=\"{_minX - pad:F2} {_minY - pad:F2} {w:F2} {h:F2}\">");
        sb.AppendLine("  <rect width=\"100%\" height=\"100%\" fill=\"#fafafa\" />");
        sb.Append(_body);
        sb.AppendLine("</svg>");
        return sb.ToString();
    }

    // ... bounds tracking and ring extraction
}
```

Each demo writes its own SVG. Eight files total: point vectors, four boolean operations, a buffer, the spatial index query, and the convex hull. Open any of them in a browser.

## Running the Project

```bash
git clone https://github.com/animat089/playground.git
cd playground/ComputationalGeometry/AnimatLabs.ComputationalGeometry
dotnet run
```

No Docker. No database. Just .NET 10 and two NuGet packages.

The output goes to the `output/` folder:

```
output/
├── 01-points-vectors.svg
├── 02a-intersection.svg
├── 02b-union.svg
├── 02c-difference.svg
├── 02d-symmetric-diff.svg
├── 02e-buffer.svg
├── 03-spatial-index.svg
└── 04-convex-hull.svg
```

## Where This Gets Practical

I used Math.NET Spatial for a floor-plan overlap checker at work. Two polygons from different CAD layers, quick intersection test, flag conflicts. Took 30 minutes to wire up once the geometry stack was in place.

NTS also backs Entity Framework Core's spatial types through `NetTopologySuite.IO.SqlServerBytes` and the PostGIS provider. If you store geography data in SQL Server or PostgreSQL, NTS is already in your dependency tree whether you know it or not.

Other places these fit:

- Collision detection in 2D game prototypes
- GIS pipelines (shapefiles, GeoJSON)
- CAD file processing (more on xBIM and ACadSharp in future posts)

## What I Skipped

I skipped coordinate system transforms, ray-line intersections, Voronoi diagrams, and Delaunay triangulation. Each of those could be its own post.

The playground covers the four patterns I reach for most. Fork it, swap in your coordinates, see what the SVGs look like.

What geometry problems are you solving in .NET?
