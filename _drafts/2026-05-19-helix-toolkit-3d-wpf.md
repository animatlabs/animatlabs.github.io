---
title: "3D Shapes in C# with WPF and Helix Toolkit"
excerpt: >-
  Five shapes, one NuGet package, orbit camera included. Helix Toolkit turns a WPF window into a 3D viewport in under 80 lines.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - WPF
  - 3D
  - Helix Toolkit
  - Geometry
  - Visualization
author: animat089
last_modified_at: 2026-05-19
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I spent years working with 3D geometry in CAD tools. When I wanted to render a few shapes in C# for a side project, I assumed I'd need OpenGL bindings, shader code, and a weekend I'd never get back.

Turns out WPF has a 3D viewport built in. And Helix Toolkit wraps it so well that five shapes, orbit camera, and lighting fit in 70 lines.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/HelixToolkit3D){: .btn .btn--primary}

## The Setup

One NuGet package. One WPF window.

```bash
dotnet new wpf -n AnimatLabs.HelixToolkit3D --framework net8.0
cd AnimatLabs.HelixToolkit3D
dotnet add package HelixToolkit.Wpf
```

`HelixToolkit.Wpf` is MIT-licensed. It builds on WPF's `Viewport3D` but adds orbit camera, default lights, coordinate axes, and shape primitives that would take hundreds of lines to set up manually.

## The Viewport

The XAML is 12 lines. `HelixViewport3D` replaces the raw `Viewport3D` control and brings mouse orbit, zoom, and pan for free.

```xml
<Window x:Class="AnimatLabs.HelixToolkit3D.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        xmlns:helix="http://helix-toolkit.org/wpf"
        Title="3D Shapes - Helix Toolkit" Height="600" Width="800">
    <Grid>
        <helix:HelixViewport3D x:Name="Viewport" ZoomExtentsWhenLoaded="True"
                               ShowCoordinateSystem="True"
                               CoordinateSystemLabelForeground="White"
                               Background="#1e1e2e">
            <helix:DefaultLights/>
        </helix:HelixViewport3D>
    </Grid>
</Window>
```

`ZoomExtentsWhenLoaded` auto-frames the camera to fit all shapes. `ShowCoordinateSystem` puts the XYZ gizmo in the corner. `DefaultLights` adds ambient and directional lights so you don't have to manually position light sources.

## Adding Shapes

Each shape is a `Visual3D` subclass. Set the geometry properties, pick a color, add it to the viewport.

```csharp
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Media3D;
using HelixToolkit.Wpf;

namespace AnimatLabs.HelixToolkit3D;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        AddShapes();
    }

    private void AddShapes()
    {
        var cube = new BoxVisual3D
        {
            Center = new Point3D(-3, 0, 0.5),
            Length = 1, Width = 1, Height = 1,
            Fill = new SolidColorBrush(Color.FromRgb(0x89, 0xb4, 0xfa))
        };

        var sphere = new SphereVisual3D
        {
            Center = new Point3D(0, 0, 0.5),
            Radius = 0.6,
            Fill = new SolidColorBrush(Color.FromRgb(0xa6, 0xe3, 0xa1))
        };

        var cone = new TruncatedConeVisual3D
        {
            Origin = new Point3D(3, 0, 0),
            BaseRadius = 0.6,
            TopRadius = 0,
            Height = 1.2,
            Fill = new SolidColorBrush(Color.FromRgb(0xf3, 0x8b, 0xa8))
        };

        var cylinder = new TruncatedConeVisual3D
        {
            Origin = new Point3D(-1.5, 3, 0),
            BaseRadius = 0.5,
            TopRadius = 0.5,
            Height = 1.2,
            Fill = new SolidColorBrush(Color.FromRgb(0xfa, 0xb3, 0x87))
        };

        var torus = new TorusVisual3D
        {
            TorusDiameter = 1.2,
            TubeDiameter = 0.35,
            Fill = new SolidColorBrush(Color.FromRgb(0xcb, 0xa6, 0xf7))
        };
        torus.Transform = new TranslateTransform3D(1.5, 3, 0.5);

        Viewport.Children.Add(cube);
        Viewport.Children.Add(sphere);
        Viewport.Children.Add(cone);
        Viewport.Children.Add(cylinder);
        Viewport.Children.Add(torus);
    }
}
```

That's the whole file. No vertex buffers, no shaders, no model loading. Helix does the mesh generation internally.

A few things to notice:

- `TruncatedConeVisual3D` with `TopRadius = 0` makes a cone. Set `TopRadius = BaseRadius` and you get a cylinder. Same class, different parameters.
- `TorusVisual3D` doesn't have a `Center` property. Use a `TranslateTransform3D` to position it.
- Colors are Catppuccin Mocha palette because dark background + pastel shapes looks better than the default gray-on-gray.

## Running It

```bash
cd AnimatLabs.HelixToolkit3D
dotnet run
```

A window opens with five colored shapes on a dark background. Drag to orbit, scroll to zoom, middle-click to pan. The coordinate gizmo in the bottom-left shows orientation.

No Docker. No database. Just .NET 8 and one NuGet package.

## What Helix Toolkit Has That I Didn't Show

I used five primitives. The library has more:

- `PipeVisual3D`, `ArrowVisual3D`, `EllipsoidVisual3D`
- STL and OBJ model importers
- `MeshBuilder` for procedural geometry
- Cut planes and cross-sections
- Text labels in 3D space
- Hit testing (click on a shape, get the object back)

`MeshBuilder` is where it gets interesting for CAD-adjacent work. You can programmatically build meshes from vertices and triangles, which is what you'd do if parsing geometry from IFC or DWG files (topics I'll cover in upcoming posts).

## Why Not OpenGL or Silk.NET?

For raw GPU access and custom shaders, Silk.NET is the right pick. But for "show me five shapes in a window," it's 10x more code. You'd write your own camera, your own lighting, your own mesh primitives.

Helix Toolkit sits in the middle: more control than hardcoded WPF `Viewport3D` geometry, less ceremony than OpenGL. For demos, prototypes, and visualization tools, that's the sweet spot.

What 3D rendering problems are you tackling in .NET?
