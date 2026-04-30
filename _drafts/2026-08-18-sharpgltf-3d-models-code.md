---
title: "SharpGLTF: Building 3D Models in Code"
excerpt: >-
  Create glTF meshes from vertices and triangles. No Blender, no FBX export. Just C# and one MIT-licensed NuGet package.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - glTF
  - 3D
  - SharpGLTF
  - Geometry
  - Visualization
author: animat089
last_modified_at: 2026-08-18
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I needed to generate 3D files from code. Not load them from Blender. Generate them. Vertices, triangles, materials, all built programmatically.

glTF is the JPEG of 3D. Every viewer, every engine, every web framework understands it. SharpGLTF (MIT-licensed) gives you a typed API to build glTF models in C# without touching JSON or binary encoding.

I used it to export geometry from a processing pipeline into a format that Three.js, Babylon.js, and Windows 3D Viewer all open without plugins.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/SharpGLTF){: .btn .btn--primary}

## Why glTF

Three reasons I picked it over OBJ, STL, or FBX:

- Materials, colors, and textures travel with the file. OBJ needs a separate `.mtl`. STL has no color at all.
- Binary glTF (`.glb`) is a single file. No folder of assets to keep together.
- Every major viewer and game engine imports it natively. Browser-based viewers (Three.js, model-viewer) treat it as first class.

```bash
dotnet add package SharpGLTF.Toolkit
```

## Building a Cube from Scratch

`MeshBuilder` is the core type. You add primitives (triangles) with positions, normals, and optional colors. SharpGLTF calculates bounding boxes and binary layout automatically.

```csharp
using SharpGLTF.Geometry;
using SharpGLTF.Geometry.VertexTypes;
using SharpGLTF.Materials;
using SharpGLTF.Scenes;
using System.Numerics;

var material = new MaterialBuilder("CubeMaterial")
    .WithDoubleSide(true)
    .WithMetallicRoughnessShader()
    .WithBaseColor(new Vector4(0.2f, 0.6f, 0.9f, 1.0f));

var mesh = new MeshBuilder<VertexPosition, VertexEmpty, VertexEmpty>("Cube");
var prim = mesh.UsePrimitive(material);

Vector3[] corners =
[
    new(-0.5f, -0.5f, -0.5f), new(0.5f, -0.5f, -0.5f),
    new(0.5f,  0.5f, -0.5f), new(-0.5f,  0.5f, -0.5f),
    new(-0.5f, -0.5f,  0.5f), new(0.5f, -0.5f,  0.5f),
    new(0.5f,  0.5f,  0.5f), new(-0.5f,  0.5f,  0.5f)
];

int[][] faces =
[
    [0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4],
    [2, 3, 7, 6], [0, 3, 7, 4], [1, 2, 6, 5]
];

foreach (var f in faces)
{
    var a = new VertexPosition(corners[f[0]]);
    var b = new VertexPosition(corners[f[1]]);
    var c = new VertexPosition(corners[f[2]]);
    var d = new VertexPosition(corners[f[3]]);
    prim.AddTriangle(a, b, c);
    prim.AddTriangle(a, c, d);
}

var scene = new SceneBuilder();
scene.AddRigidMesh(mesh, Matrix4x4.Identity);

var model = scene.ToGltf2();
model.SaveGLB("cube.glb");
```

Open `cube.glb` in Windows 3D Viewer or drag it into https://gltf-viewer.donmccurdy.com/. Blue cube, correct faces, no gaps.

## Adding Multiple Objects

A scene can hold multiple meshes at different positions. Each `AddRigidMesh` takes a transform matrix.

```csharp
scene.AddRigidMesh(cubeMesh, Matrix4x4.CreateTranslation(-2, 0, 0));
scene.AddRigidMesh(sphereMesh, Matrix4x4.CreateTranslation(2, 0, 0));
```

Each mesh can use its own material. The playground writes `scene.glb` (cube + sphere together) and `cube.glb` (cube alone). Open either in https://gltf-viewer.donmccurdy.com/ to verify.

## Generating a Sphere

SharpGLTF doesn't ship primitive generators. You build the mesh yourself. A UV sphere is maybe 20 lines:

```csharp
var sphereMaterial = new MaterialBuilder("SphereMaterial")
    .WithDoubleSide(true)
    .WithMetallicRoughnessShader()
    .WithBaseColor(new Vector4(0.9f, 0.3f, 0.3f, 1.0f));

var sphereMesh = new MeshBuilder<VertexPosition, VertexEmpty, VertexEmpty>("Sphere");
var spherePrim = sphereMesh.UsePrimitive(sphereMaterial);

int stacks = 16, slices = 24;
float radius = 0.5f;

for (int i = 0; i < stacks; i++)
{
    float phi1 = MathF.PI * i / stacks;
    float phi2 = MathF.PI * (i + 1) / stacks;

    for (int j = 0; j < slices; j++)
    {
        float theta1 = 2 * MathF.PI * j / slices;
        float theta2 = 2 * MathF.PI * (j + 1) / slices;

        var p1 = SphericalToCartesian(radius, phi1, theta1);
        var p2 = SphericalToCartesian(radius, phi1, theta2);
        var p3 = SphericalToCartesian(radius, phi2, theta2);
        var p4 = SphericalToCartesian(radius, phi2, theta1);

        spherePrim.AddTriangle(new VertexPosition(p1), new VertexPosition(p2), new VertexPosition(p3));
        spherePrim.AddTriangle(new VertexPosition(p1), new VertexPosition(p3), new VertexPosition(p4));
    }
}

static Vector3 SphericalToCartesian(float r, float phi, float theta) =>
    new(r * MathF.Sin(phi) * MathF.Cos(theta),
        r * MathF.Cos(phi),
        r * MathF.Sin(phi) * MathF.Sin(theta));
```

This bridges back to the geometry series. If you parsed coordinates from an IFC or DWG file (earlier posts), you could feed those vertices straight into `MeshBuilder` and export a `.glb`.

## File Size

Binary glTF is compact. The cube above is ~500 bytes. A 10,000-triangle mesh with materials runs about 200KB. Compare that to a text-based OBJ of the same mesh at 1MB+.

SharpGLTF also supports Draco compression via `SharpGLTF.Ext.Draco` if you need to shrink further, but for most cases the binary encoding is enough.

## Where I Use This

I export geometry from processing pipelines into glTF for review. The file opens in any browser without installing software. Stakeholders see the model without CAD licenses.

It also connects to the WorkflowForge geometry pipeline (covered in an earlier post). The final "render output" step writes a `.glb` that anyone can open.

What 3D file format are you generating from .NET code?
