---
title: ".NET/C#: Faster ways to iterate collections"
excerpt: >-
  "Exploring the different ways to achieve optimization in performance on iterations in .NET"
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - Iteration
  - Performance
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

When we discuss about any programming language, perhaps the first thing we look into after variables is iterations. Although there are many types of iterations available over several types, lets explore a few available with .NET 6 and also explore the code for the same. For benchmarking, we will be using a third-party library called `BechmarkDotNet`.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/Benchmarking/Iterations){: .btn .btn--primary}

## Exploring Various Types

When we discuss about collections, we generally think about quite a few type of collections and sometimes even implement those without even the proper understanding on why to use a specific one... In the study here, we are going to explore the performance in .NET 6.0 for the types as follows:

1. Array
2. Enumerable
3. List

## Exploring Various Looping Mechanisms

In terms of loops that we are going to use, we are going to be fairly simple:

1. For
2. ForEach
3. ForEach over [Span](https://learn.microsoft.com/en-us/archive/msdn-magazine/2018/january/csharp-all-about-span-exploring-a-new-net-mainstay) (think of pointers references in C/C++)
4. Linq based Foreach
5. For over reference via MemoryMarshal (think of pointers references in C/C++)
6. Parallel.ForAll()
7. Parallel.ForEach()

## Results First - Let's blow your mind...

To set the context, we have performed the said benchmarking over the collections of 10, 1_000, and 100_000 size of elements all generated in random and some methods are specific to a certain type therefore missing items in the block!

{% include figure image_path="/assets/images/posts/2023-07-11/PerformanceResults.JPG" alt="Performance Results" caption="Iteration Performance Looping over different types and methods" %}

> The performance is computed as a whole for looping and accessing the item in the collection and the caveat that spans to not have an extension on top of IEnumerable to be able to do any operations with the same.

As per the computations above, the best ways of iterations over different types of records are as follows:

1. Array - ForEach (ForEach over .AsSpan() - Marginally different)
2. Enumerable - ForEach
3. List - Foreach over Span

In any of the comparison block, we can clearly see that iterations over an array or even a list is much faster than that over an Enumeration.

## Looking into the implementations

So, to begin it off lets look into how we generated a sample set data, we used a random value generator and generated an enumerable that gets the defines size of enumerable returned form the method. Apart from that, there is an extension for the ForEach on the Enumerable itself for uses later.

```c#
internal static class ListGenerator
{
    private static readonly Random random = new Random(10_00_000);

    public static IEnumerable<int> GenerateList(int size)
    {
        return Enumerable.Range(1, size).Select(i => random.Next()).AsEnumerable();
    }

    public static void ForEach<T>(this IEnumerable<T> @this, Action<T> action)
    {
        foreach (T item in @this)
        {
            action(item);
        }
    }
}
```

Now, given we have setup the sample set generator, let's look into setting up the collections for iterations:

### Global Setup

The `GlobalSetupAttribute` is used over the method that sets up the data for the performance benchmarking in the library that we are referencing to. Along with the same, we use the `ParamsAttribute` for defining the set of values for which the globalSetup and the test cases need to run for:

```c#
private int[] sampleSetArray;
private List<int> sampleSetList;
private IEnumerable<int> sampleSetEnumerable;

[Params(10, 1_000, 1_00_000)]
public int Size { get; set; }

[GlobalSetup]
public void SetupData()
{
    var sampleSet = ListGenerator.GenerateList(Size);

    sampleSetArray = sampleSet.ToArray();
    sampleSetList = sampleSet.ToList();
    sampleSetEnumerable = sampleSet;
}
```

### Array

Now, let's look into all the code written for the loops with Arrays

- **For**

    ```c#
    [Benchmark]
    public void Array_For()
    {
        for (int iterator = 0; iterator < sampleSetArray.Length; iterator++)
        {
            var item = sampleSetArray[iterator];
            //Perform something
        }
    }
    ```

- **ForEach**

    ```c#
    [Benchmark]
    public void Array_ForEach()
    {
        foreach (int item in sampleSetArray)
        {
            //Perform something
        }
    }
    ```

- **ForEachLinq**

    ```c#
    [Benchmark]
    public void Array_ForEachLinq()
    {
        Array.ForEach(sampleSetArray, (item) => { });
    }
    ```

- **ParallelForEach**

    ```c#
    [Benchmark]
    public void Array_ParallelForEach()
    {
        Parallel.ForEach(sampleSetArray, item => { });
    }
    ```

- **ParallelForAll**

    ```c#
    [Benchmark]
    public void Array_ParallelForAll()
    {
        sampleSetArray.AsParallel().ForAll(item => { });
    }
    ```

- **ForEachAsSpan**

    ```c#
    [Benchmark]
    public void Array_ForEachAsSpan()
    {
        foreach (var item in sampleSetArray.AsSpan())
        {
            //Perform Something
        }
    }
    ```

- **ForMemoryMarshalSpanUnsafe**
    > Note: This method only exists for arrays and nothing else

    ```c#
    [Benchmark]
    public void Array_ForMemoryMarshalSpanUnsafe()
    {
        // Get Reference of the first item in the collection
        ref var itemRef = ref MemoryMarshal.GetArrayDataReference(sampleSetArray);
        for (int iterator = 0; iterator < sampleSetArray.Length; iterator++)
        {
            var item = Unsafe.Add(ref itemRef, iterator);
            //Perform something
        }
    }
    ```

### List

Now, let's look into all the code written for the loops with Lists

- **For**

    ```c#
    [Benchmark]
    public void List_For()
    {
        for (int iterator = 0; iterator < sampleSetList.Count(); iterator++)
        {
            var item = sampleSetList[iterator];
            //Perform something
        }
    }
    ```

- **ForEach**

    ```c#
    [Benchmark]
    public void List_Foreach()
    {
        foreach (int item in sampleSetList)
        {
            //Perform something
        }
    }
    ```

- **ForEachLinq**

    ```c#
    [Benchmark]
    public void List_ForEachLinq()
    {
        sampleSetList.ForEach((item) => { });
    }
    ```

- **ParallelForEach**

    ```c#
    [Benchmark]
    public void List_ParallelForEach()
    {
        Parallel.ForEach(sampleSetList, item => { });
    }
    ```

- **ParallelForAll**

    ```c#
    [Benchmark]
    public void List_ParallelForAll()
    {
        sampleSetList.AsParallel().ForAll(item => { });
    }
    ```

- **ForEachAsSpanUnsafe**
    > Point to note here, unlike in the case fo arrays, this charters into the unsafe code territory!

    ```c#
    [Benchmark]
    public void List_ForEachAsSpanUnsafe()
    {
        foreach (var item in CollectionsMarshal.AsSpan(sampleSetList))
        {
            //Perform Something
        }
    }
    ```

### Enumerable

Now, let's look into all the code written for the loops with Enumerables

- **For**

    ```c#
    [Benchmark]
    public void Enumerable_For()
    {
        for (int iterator = 0; iterator < sampleSetEnumerable.Count(); iterator++)
        {
            var item = sampleSetEnumerable.ElementAt(iterator);
            //Perform something
        }
    }
    ```

- **ForEach**

    ```c#
    [Benchmark]
    public void Enumerable_Foreach()
    {
        foreach (int item in sampleSetEnumerable)
        {
            //Perform something
        }
    }
    ```

- **ForEachLinq**

    ```c#
    [Benchmark]
    public void Enumerable_ForEachLinq()
    {
        sampleSetEnumerable.ForEach((item) => { });
    }
    ```

- **ParallelForEach**

    ```c#
    [Benchmark]
    public void Enumerable_ParallelForEach()
    {
        Parallel.ForEach(sampleSetEnumerable, item => { });
    }
    ```

- **ParallelForAll**

    ```c#
    [Benchmark]
    public void Enumerable_ParallelForAll()
    {
        sampleSetEnumerable.AsParallel().ForAll(item => { });
    }
    ```

## Conclusion

Given, now we have seen the perspective of the that it is not just the looping mechanism but also the collection type that plays a vital role in the process. Assuming that this will help you in understanding the process better and utilizing the information to write better code!