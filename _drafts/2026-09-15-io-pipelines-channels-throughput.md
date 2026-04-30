---
title: "System.IO.Pipelines + Channels for High-Throughput Parsing"
excerpt: >-
  Parse a 500MB file without loading it into memory. Pipelines handle the bytes, Channels handle the backpressure. Together they replace most custom buffer code.
categories:
  - Technical
  - .NET
  - Performance
tags:
  - C#
  - .NET
  - System.IO.Pipelines
  - Channels
  - Performance
  - High-Throughput
  - Parsing
author: animat089
last_modified_at: 2026-09-15
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

I was parsing a 2GB log file line by line. `StreamReader.ReadLineAsync` worked, but memory sat at 400MB because each line became a `string` that lived until GC got around to it.

Switching to `System.IO.Pipelines` dropped memory to 12MB. Same file, same output, 30x less RAM. The trick is that Pipelines rent buffers from a pool and return them as soon as you advance past the data. No string allocations until you actually need one.

`Channel<T>` sits on the other side. It decouples the parsing thread from the processing thread. The parser writes parsed records into a channel, the processor reads them at its own pace. If the processor is slow, the channel applies backpressure. If the parser is slow, the processor waits. No manual `BlockingCollection`, no `ConcurrentQueue` polling.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/IoPipelines){: .btn .btn--primary}

## Pipelines: Rent, Read, Advance

The `PipeReader` gives you a `ReadOnlySequence<byte>`. You scan for delimiters, slice out the data you need, then call `AdvanceTo` to tell the pipe how far you got. The pipe reclaims the buffers behind you.

```csharp
using System.Buffers;
using System.IO.Pipelines;
using System.Text;

async Task<int> CountLinesWithPipeline(string path)
{
    await using var stream = File.OpenRead(path);
    var reader = PipeReader.Create(stream);
    int lineCount = 0;

    while (true)
    {
        var result = await reader.ReadAsync();
        var buffer = result.Buffer;

        while (TryReadLine(ref buffer, out _))
            lineCount++;

        reader.AdvanceTo(buffer.Start, buffer.End);

        if (result.IsCompleted) break;
    }

    await reader.CompleteAsync();
    return lineCount;
}

bool TryReadLine(ref ReadOnlySequence<byte> buffer, out ReadOnlySequence<byte> line)
{
    var pos = buffer.PositionOf((byte)'\n');
    if (pos is null) { line = default; return false; }

    line = buffer.Slice(0, pos.Value);
    buffer = buffer.Slice(buffer.GetPosition(1, pos.Value));
    return true;
}
```

`AdvanceTo(buffer.Start, buffer.End)` is important. The first argument says "I consumed up to here." The second says "I examined up to here." The pipe knows not to give you the examined bytes again until more data arrives.

No `byte[]` allocations. No `string` allocations. The buffers come from `ArrayPool<byte>` and go back when you advance past them.

## Channels: Decouple Parse from Process

Once you have parsed records, push them into a `Channel<T>`. A separate `Task` reads from the channel and does the heavy work (database writes, HTTP calls, whatever).

```csharp
using System.Threading.Channels;

var channel = Channel.CreateBounded<ParsedRecord>(new BoundedChannelOptions(1000)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleWriter = true,
    SingleReader = true
});

var parseTask = Task.Run(async () =>
{
    await using var stream = File.OpenRead("data.csv");
    var reader = PipeReader.Create(stream);

    while (true)
    {
        var result = await reader.ReadAsync();
        var buffer = result.Buffer;

        while (TryReadLine(ref buffer, out var line))
        {
            var record = ParseRecord(line);
            await channel.Writer.WriteAsync(record);
        }

        reader.AdvanceTo(buffer.Start, buffer.End);
        if (result.IsCompleted) break;
    }

    await reader.CompleteAsync();
    channel.Writer.Complete();
});

var processTask = Task.Run(async () =>
{
    await foreach (var record in channel.Reader.ReadAllAsync())
    {
        await ProcessRecord(record);
    }
});

await Task.WhenAll(parseTask, processTask);
```

`BoundedChannelOptions` with capacity 1000 means the parser blocks if the processor falls behind. That's backpressure. Without it, the parser would pile up millions of records in memory faster than the processor can drain them.

`SingleWriter = true` and `SingleReader = true` let the channel skip internal locks. Small optimization, but it adds up when you're pushing millions of items.

## When Pipelines Beat StreamReader

Not always. For small files (under 10MB), `File.ReadAllLines` or `StreamReader` is fine. The complexity of Pipelines isn't worth it.

Pipelines earn their keep when:
- The file is large (100MB+) and you can't afford to hold it all in memory
- You're processing a network stream (TCP socket, HTTP chunked response) where data arrives in unpredictable chunks
- You need to scan for specific byte patterns without converting everything to strings first

I wouldn't reach for Pipelines to parse a config file. I would reach for them to parse a 2GB access log or a binary protocol stream.

## When Channels Beat ConcurrentQueue

`ConcurrentQueue` makes you poll. You spin in a loop calling `TryDequeue`. That burns CPU when the queue is empty.

`Channel<T>` gives you `await ReadAsync()`. The thread yields until data arrives. No spinning, no wasted cycles. And bounded channels give you backpressure, which `ConcurrentQueue` never had.

## Combining Them

The real power is the combination. Pipeline handles the raw byte parsing with zero allocations. Channel handles the producer-consumer coordination with backpressure. Together they replace most custom buffer management code I've written over the years.

The pattern is always the same: PipeReader on one end, Channel in the middle, processor on the other end. Swap in different parsers (CSV, binary protocol, JSON lines) and different processors (DB insert, HTTP forward, aggregation) and the plumbing stays identical.

What high-throughput parsing problem would you throw Pipelines at?
