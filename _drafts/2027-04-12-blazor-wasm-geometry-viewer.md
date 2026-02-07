---
title: "Build an Interactive Geometry Viewer with Blazor WebAssembly"
excerpt: >-
  "A browser-based CAD viewer built entirely in C# -- upload DXF files, render geometry, pan/zoom/click. No server, no plugins, pure WebAssembly."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - Blazor
  - WebAssembly
  - SkiaSharp
  - CAD
  - Geometry
  - Visualization
  - Interactive
author: animat089
last_modified_at: 2027-04-12
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
POST PLAN:
- Why build a geometry viewer in Blazor WASM?
- Project setup: Blazor WASM + SkiaSharp.Views.Blazor
- Reading DXF files client-side (ACadSharp in the browser)
- Rendering entities with SkiaSharp canvas
- Implementing pan and zoom with mouse/touch events
- Click-to-select: entity highlighting and info panel
- Color mapping by layer
- Entity filtering (toggle layers on/off)
- Performance: handling large drawings in WebAssembly
- Deploying as a static GitHub Pages site
- Complete source code walkthrough

UNIQUE ANGLE: Ties the entire Geometry & CAD series together into a working, deployable app.
Shows Blazor WASM for something beyond CRUD forms. Fun, visual, interactive.

LIBRARIES:
- Blazor WebAssembly (.NET 10)
- SkiaSharp.Views.Blazor (2D rendering in browser)
- ACadSharp (DXF parsing)
- Math.NET Spatial (coordinate transforms)

LOCAL DEV: Fully client-side. No server, no Docker needed. Deploys to GitHub Pages.
-->

## Why Blazor WASM for a Geometry Viewer?

Most geometry viewers are either desktop-only (WPF, WinForms) or built with JavaScript. Blazor WebAssembly lets us write the entire thing in C# -- file parsing, coordinate math, rendering -- and deploy it as a static site. No server, no plugins, runs in any modern browser.

This post ties together everything from the Geometry & CAD series into a single, deployable application.

## Project Setup

```bash
# Create a new Blazor WASM project
dotnet new blazorwasm -o GeometryViewer --framework net10.0
cd GeometryViewer

# Add packages
dotnet add package SkiaSharp.Views.Blazor
dotnet add package ACadSharp
dotnet add package MathNet.Spatial
```

### Project Structure

```
GeometryViewer/
  wwwroot/
    sample-drawings/      # Sample DXF files
  Components/
    DrawingCanvas.razor    # Main rendering component
    LayerPanel.razor       # Layer toggle sidebar
    EntityInfo.razor       # Click-to-select info panel
    FileUploader.razor     # File upload component
  Services/
    DrawingService.cs      # DXF parsing and entity management
    RenderService.cs       # SkiaSharp rendering logic
    ViewportService.cs     # Pan/zoom state management
  Program.cs
```

## The Drawing Service: Parsing DXF in the Browser

```csharp
public class DrawingService
{
    public CadDocument? CurrentDocument { get; private set; }
    public List<LayerInfo> Layers { get; } = new();
    public event Action? OnDocumentLoaded;

    public async Task LoadFromStreamAsync(Stream stream, string fileName)
    {
        // ACadSharp works in Blazor WASM -- it's pure .NET
        using var reader = new DxfReader(stream);
        CurrentDocument = reader.Read();

        // Build layer list with visibility toggles
        Layers.Clear();
        foreach (var layer in CurrentDocument.Layers)
        {
            Layers.Add(new LayerInfo
            {
                Name = layer.Name,
                Color = ConvertColor(layer.Color),
                IsVisible = !layer.IsOff,
                EntityCount = CurrentDocument.Entities
                    .Count(e => e.Layer?.Name == layer.Name)
            });
        }

        OnDocumentLoaded?.Invoke();
    }

    public IEnumerable<Entity> GetVisibleEntities()
    {
        if (CurrentDocument == null) yield break;

        var visibleLayers = Layers
            .Where(l => l.IsVisible)
            .Select(l => l.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var entity in CurrentDocument.Entities)
        {
            if (entity.Layer == null || visibleLayers.Contains(entity.Layer.Name))
                yield return entity;
        }
    }

    private static SKColor ConvertColor(ACadSharp.Color cadColor)
    {
        // Map AutoCAD Color Index (ACI) to RGB
        // ACI 1=Red, 2=Yellow, 3=Green, 4=Cyan, 5=Blue, 6=Magenta, 7=White
        return cadColor.Index switch
        {
            1 => SKColors.Red,
            2 => SKColors.Yellow,
            3 => SKColors.Green,
            4 => SKColors.Cyan,
            5 => SKColors.Blue,
            6 => SKColors.Magenta,
            7 => SKColors.White,
            _ => SKColors.Gray
        };
    }
}

public class LayerInfo
{
    public string Name { get; set; } = "";
    public SKColor Color { get; set; }
    public bool IsVisible { get; set; } = true;
    public int EntityCount { get; set; }
}
```

## The Viewport Service: Pan and Zoom

```csharp
public class ViewportService
{
    public float OffsetX { get; private set; }
    public float OffsetY { get; private set; }
    public float Scale { get; private set; } = 1.0f;

    private float _lastMouseX, _lastMouseY;
    private bool _isPanning;

    public event Action? OnViewportChanged;

    public void ZoomToFit(SKRect bounds, float canvasWidth, float canvasHeight)
    {
        if (bounds.IsEmpty) return;

        var scaleX = (canvasWidth - 40) / bounds.Width;
        var scaleY = (canvasHeight - 40) / bounds.Height;
        Scale = Math.Min(scaleX, scaleY);

        OffsetX = (canvasWidth / 2) - (bounds.MidX * Scale);
        OffsetY = (canvasHeight / 2) - (bounds.MidY * Scale);

        OnViewportChanged?.Invoke();
    }

    public void OnMouseWheel(float delta, float mouseX, float mouseY)
    {
        var zoomFactor = delta > 0 ? 1.1f : 0.9f;
        var oldScale = Scale;
        Scale *= zoomFactor;
        Scale = Math.Clamp(Scale, 0.01f, 1000f);

        // Zoom toward mouse position
        OffsetX = mouseX - (mouseX - OffsetX) * (Scale / oldScale);
        OffsetY = mouseY - (mouseY - OffsetY) * (Scale / oldScale);

        OnViewportChanged?.Invoke();
    }

    public void OnMouseDown(float x, float y)
    {
        _isPanning = true;
        _lastMouseX = x;
        _lastMouseY = y;
    }

    public void OnMouseMove(float x, float y)
    {
        if (!_isPanning) return;

        OffsetX += x - _lastMouseX;
        OffsetY += y - _lastMouseY;
        _lastMouseX = x;
        _lastMouseY = y;

        OnViewportChanged?.Invoke();
    }

    public void OnMouseUp() => _isPanning = false;

    // Convert screen coordinates to world coordinates
    public (float X, float Y) ScreenToWorld(float screenX, float screenY)
    {
        return (
            (screenX - OffsetX) / Scale,
            (screenY - OffsetY) / Scale
        );
    }
}
```

## The Render Service: Drawing Entities with SkiaSharp

```csharp
public class RenderService
{
    private readonly DrawingService _drawing;
    private readonly ViewportService _viewport;

    public RenderService(DrawingService drawing, ViewportService viewport)
    {
        _drawing = drawing;
        _viewport = viewport;
    }

    public void Render(SKCanvas canvas, SKImageInfo info)
    {
        canvas.Clear(new SKColor(30, 30, 30)); // Dark background

        canvas.Save();
        canvas.Translate(_viewport.OffsetX, _viewport.OffsetY);
        canvas.Scale(_viewport.Scale, -_viewport.Scale); // Flip Y for CAD coords

        var paint = new SKPaint
        {
            Style = SKPaintStyle.Stroke,
            StrokeWidth = 1 / _viewport.Scale, // Constant screen-space width
            IsAntialias = true
        };

        foreach (var entity in _drawing.GetVisibleEntities())
        {
            var layerInfo = _drawing.Layers
                .FirstOrDefault(l => l.Name == entity.Layer?.Name);
            paint.Color = layerInfo?.Color ?? SKColors.White;

            RenderEntity(canvas, entity, paint);
        }

        canvas.Restore();

        // Draw HUD (crosshair, coordinates, etc.)
        DrawHud(canvas, info);
    }

    private void RenderEntity(SKCanvas canvas, Entity entity, SKPaint paint)
    {
        switch (entity)
        {
            case Line line:
                canvas.DrawLine(
                    (float)line.StartPoint.X, (float)line.StartPoint.Y,
                    (float)line.EndPoint.X, (float)line.EndPoint.Y,
                    paint);
                break;

            case Circle circle:
                canvas.DrawCircle(
                    (float)circle.Center.X, (float)circle.Center.Y,
                    (float)circle.Radius, paint);
                break;

            case Arc arc:
                var rect = new SKRect(
                    (float)(arc.Center.X - arc.Radius),
                    (float)(arc.Center.Y - arc.Radius),
                    (float)(arc.Center.X + arc.Radius),
                    (float)(arc.Center.Y + arc.Radius));
                canvas.DrawArc(rect,
                    (float)arc.StartAngle, (float)(arc.EndAngle - arc.StartAngle),
                    false, paint);
                break;

            case LwPolyline polyline:
                RenderPolyline(canvas, polyline, paint);
                break;

            case TextEntity text:
                var textPaint = new SKPaint
                {
                    Color = paint.Color,
                    TextSize = (float)text.Height,
                    IsAntialias = true
                };
                canvas.Save();
                canvas.Scale(1, -1); // Un-flip Y for text
                canvas.DrawText(text.Value,
                    (float)text.InsertPoint.X,
                    -(float)text.InsertPoint.Y,
                    textPaint);
                canvas.Restore();
                break;
        }
    }

    private void RenderPolyline(SKCanvas canvas, LwPolyline polyline, SKPaint paint)
    {
        var path = new SKPath();
        var vertices = polyline.Vertices.ToList();
        if (vertices.Count < 2) return;

        path.MoveTo((float)vertices[0].Location.X, (float)vertices[0].Location.Y);

        for (int i = 1; i < vertices.Count; i++)
        {
            path.LineTo((float)vertices[i].Location.X, (float)vertices[i].Location.Y);
        }

        if (polyline.IsClosed)
            path.Close();

        canvas.DrawPath(path, paint);
    }

    private void DrawHud(SKCanvas canvas, SKImageInfo info)
    {
        var hudPaint = new SKPaint
        {
            Color = SKColors.LightGray,
            TextSize = 14,
            IsAntialias = true
        };

        var entityCount = _drawing.CurrentDocument?.Entities.Count() ?? 0;
        canvas.DrawText($"Entities: {entityCount} | Zoom: {_viewport.Scale:F2}x",
            10, info.Height - 10, hudPaint);
    }
}
```

## The Blazor Component: DrawingCanvas.razor

```csharp
@using SkiaSharp.Views.Blazor
@inject DrawingService Drawing
@inject ViewportService Viewport
@inject RenderService Renderer

<div class="canvas-container"
     @onmousedown="OnMouseDown"
     @onmousemove="OnMouseMove"
     @onmouseup="OnMouseUp"
     @onwheel="OnWheel">
    
    <SKCanvasView @ref="_canvasView"
                  OnPaintSurface="OnPaintSurface"
                  style="width:100%;height:100%;" />
</div>

@code {
    private SKCanvasView? _canvasView;

    protected override void OnInitialized()
    {
        Drawing.OnDocumentLoaded += () =>
        {
            _canvasView?.Invalidate();
            StateHasChanged();
        };

        Viewport.OnViewportChanged += () =>
        {
            _canvasView?.Invalidate();
        };
    }

    private void OnPaintSurface(SKPaintSurfaceEventArgs args)
    {
        Renderer.Render(args.Surface.Canvas, args.Info);
    }

    private void OnMouseDown(MouseEventArgs e)
    {
        Viewport.OnMouseDown((float)e.OffsetX, (float)e.OffsetY);
    }

    private void OnMouseMove(MouseEventArgs e)
    {
        Viewport.OnMouseMove((float)e.OffsetX, (float)e.OffsetY);
    }

    private void OnMouseUp(MouseEventArgs e)
    {
        Viewport.OnMouseUp();
    }

    private void OnWheel(WheelEventArgs e)
    {
        Viewport.OnMouseWheel(-(float)e.DeltaY, (float)e.OffsetX, (float)e.OffsetY);
    }
}
```

## File Upload Component

```csharp
@inject DrawingService Drawing

<div class="file-upload">
    <label>
        <InputFile OnChange="OnFileSelected" accept=".dxf" />
        <span>Upload DXF File</span>
    </label>
    @if (_isLoading)
    {
        <span>Loading...</span>
    }
</div>

@code {
    private bool _isLoading;

    private async Task OnFileSelected(InputFileChangeEventArgs e)
    {
        _isLoading = true;
        StateHasChanged();

        try
        {
            var file = e.File;
            using var stream = file.OpenReadStream(maxAllowedSize: 50 * 1024 * 1024);
            using var ms = new MemoryStream();
            await stream.CopyToAsync(ms);
            ms.Position = 0;
            await Drawing.LoadFromStreamAsync(ms, file.Name);
        }
        finally
        {
            _isLoading = false;
            StateHasChanged();
        }
    }
}
```

## Layer Panel: Toggle Visibility

```csharp
@inject DrawingService Drawing

<div class="layer-panel">
    <h3>Layers</h3>
    @foreach (var layer in Drawing.Layers)
    {
        <label class="layer-item">
            <input type="checkbox" 
                   @bind="layer.IsVisible"
                   @bind:after="OnLayerChanged" />
            <span class="layer-color" 
                  style="background:rgb(@layer.Color.Red,@layer.Color.Green,@layer.Color.Blue)">
            </span>
            @layer.Name (@layer.EntityCount)
        </label>
    }
</div>

@code {
    private void OnLayerChanged()
    {
        // Trigger re-render of canvas
        Drawing.NotifyChanged();
    }
}
```

## Deploying to GitHub Pages

Since Blazor WASM compiles to static files, deploying to GitHub Pages is straightforward:

```yaml
# .github/workflows/deploy-viewer.yml
name: Deploy Geometry Viewer

on:
  push:
    branches: [main]
    paths: ['GeometryViewer/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'
      
      - run: dotnet publish GeometryViewer -c Release -o output
      
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./output/wwwroot
```

## Performance Tips for WebAssembly

```csharp
// 1. Limit re-renders: only invalidate canvas when state changes
// 2. Use spatial indexing for hit-testing (click-to-select)
// 3. For very large drawings, implement level-of-detail (LOD)
// 4. Cache SkiaSharp paths for polylines instead of rebuilding each frame

// LOD example: skip small entities at low zoom
private bool ShouldRender(Entity entity, float scale)
{
    // Skip text below readable size
    if (entity is TextEntity text && text.Height * scale < 5)
        return false;

    // Skip tiny circles
    if (entity is Circle circle && circle.Radius * scale < 2)
        return false;

    return true;
}
```

## What's Next

This is part 3 of the **Geometry & CAD in C#** series:
1. [IFC Files with xBIM](/technical/.net/.net-core/ifc-parsing-xbim-csharp/) -- parsing building information models
2. [DWG/DXF Files with ACadSharp](/technical/.net/.net-core/dwg-dxf-acadsharp-dotnet/) -- reading AutoCAD files
3. **Interactive Geometry Viewer with Blazor WASM** (this post)
4. [Computational Geometry with Math.NET Spatial](/technical/.net/.net-core/computational-geometry-mathnet/) -- geometric algorithms

## Conclusion

Building a geometry viewer in Blazor WebAssembly shows that .NET isn't just for backends and APIs. With SkiaSharp for rendering and ACadSharp for file parsing, you get a fully functional CAD viewer running entirely in the browser -- no server, no plugins, deployable as a static site.

The complete source code is available on GitHub. Fork it, extend it, make it yours.

---

*Built something visual with Blazor WASM? Share it in the comments!*
