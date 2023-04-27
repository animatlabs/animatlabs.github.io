---
title: "Reactive Programming"
excerpt: >-
  "Reactive programming in .NET - Efficiently using the Rx library"
categories:
  - Technical
  - .NET
tags:
  - C#
  - .NET
  - .NET-Core
  - ReactiveProgramming
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

The programming paradigm that is based on propagation of data streams and real-time updates is described as Reactive Programming. The basic tenet of reactive programming is that an application should be able to react to changes in the system reliably and consistently, even while under a lot of demand thereby making responsive, scalable, high-throughput, low-latency systems is a good fit for it. Functional and reactive programming are frequently combined because the practical approach makes it simpler to think through and analyze the behavior of the code.

It is built on the observer pattern, in which an object (the observer) is informed of changes to another object (the subject) as a result, we could achieve making applications that can react to system changes, including user input, network events, or data changes. As a result, it is ideal for creating scalable and responsive applications, including real-time systems, streaming systems, and interactive user interfaces.

## Use Cases

Although there could possibly be many use cases where reactive programming could be used in the real-world  use cases

- **_Real Time Analytics_** - A trading platform for financial instruments that continuously receives and analyses large amounts of financial data. Traders can receive real-time analytics and alerts by using reactive programming to process and evaluate data as it comes in.
- **_Chat Applications_** - A chat application that enables group conversations amongst users. Real-time chat interface updates can be handled using reactive programming, which can also handle user conversation between users.
- **_Gaming_** - A multiplayer game that enables real-time communication between participants and updates to the game state can be handled using reactive programming, as well as player-to-player communication.
- **_Internet of Things (IoT)_** - A system that instantly collects and analyses data from a lot of IoT devices where incoming data can be processed using reactive programming, allowing immediate action.

## Examples

### Simple

One popular library for reactive programming in C# is Reactive Extensions (Rx).
Here's a simple example using Rx in C# to filter a stream of numbers and display only even numbers...

```c#
using System.Reactive.Linq;

internal class RangeFilter
{
    public static void StartFilter()
    {
        var numbers = Observable.Range(1, 10);
        var evenNumbers = numbers.Where(n => n % 2 == 0);
        Console.WriteLine("The sorted range is:");
        evenNumbers.Subscribe(n => Console.WriteLine(n));
        Console.ReadKey();
    }
}
```

In this example, we use the `Observable.Range` method to create a stream of numbers from 1 to 10. We then use the `Where` method to filter out only the even numbers from the stream. Finally, we subscribe to the filtered stream and print out each even number as it comes in and when we run this program, we should see the following output.

```txt
2
4
6
8
10
```

### Complex

So, now, let's take a little more complex example. Let's say we want to create a program that monitors a directory for new files, and whenever a new file is added to that directory, it reads the contents of the file and performs some operation on the data. We can use Rx to easily handle the events that occur when new files are added to the directory, and to process the data from those files.

```c#
using System;
using System.IO;
using System.Reactive.Linq;

class Program
{
    static void Main(string[] args)
    {
        string directoryToWatch = @"C:\Temp";
        
        var watcher = new FileSystemWatcher(directoryToWatch);
        watcher.NotifyFilter = NotifyFilters.FileName;
        watcher.IncludeSubdirectories = false;

        var fileCreated = Observable.FromEventPattern<FileSystemEventHandler, FileSystemEventArgs>(
            handler => watcher.Created += handler,
            handler => watcher.Created -= handler
        );

        var dataStream = fileCreated
            .SelectMany(evt => ReadFileData(evt.EventArgs.FullPath))
            .Where(data => !string.IsNullOrEmpty(data))
            .Select(data => ProcessData(data));

        dataStream.Subscribe(data => Console.WriteLine($"Processed data: {data}"));

        watcher.EnableRaisingEvents = true;
        Console.WriteLine($"Monitoring directory '{directoryToWatch}' for new files...");
        Console.ReadKey();
    }

    static IObservable<string> ReadFileData(string filePath)
    {
        return Observable.Start(() =>
        {
            Console.WriteLine($"Reading data from file '{filePath}'");
            return File.ReadAllText(filePath);
        });
    }

    static string ProcessData(string data)
    {
        Console.WriteLine($"Processing data: {data}");
        // Do some processing on the data
        return data.ToUpper();
    }
}
```

In this example, we first set up a `FileSystemWatcher` to monitor the directory specified in the `directoryToWatch` variable. We then create an `IObservable` that listens for the `Created` event of the `FileSystemWatcher`, using the `FromEventPattern` method to convert the event into an observable stream.

We then create a pipeline of reactive operators to process the data from the new files that are created. First, we use the `SelectMany` operator to map the `Created` event into a stream of file data, using the `ReadFileData` method to asynchronously read the file data. We then use the Where operator to filter out any empty data strings. Finally, we use the `Select` operator to transform the data by calling the `ProcessData` method.

Finally, we subscribe to the dataStream observable to print out each piece of processed data as it comes in.

```txt
Monitoring directory 'C:\Temp' for new files...
Reading data from file 'C:\Temp\example.txt'
Processing data: File watcher Test
Processed data: FILE WATCHER TEST
```

## Conclusion

As we can see there are multiple ways in which reactive programming can be used and could perhaps prove very vital for our systems. Hope, you enjoy reading more about it, happy coding!!
