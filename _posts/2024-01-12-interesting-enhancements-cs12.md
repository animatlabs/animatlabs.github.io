---
title: "Exciting enhancements in C# 12"
excerpt: >-
  "In November 2023, C# 12 arrived with a bang, bundled with .NET 8, bringing with it a bunch of cool new features that have made developers sit up and take notice."
redirect_from:
  - /technical/.net/.net-core/intersting-enhancements-cs12/
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - C#12
author: animat089
last_modified_at: 2024-01-12
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---


## Introduction

In November 2023, C# 12 arrived with a bang, bundled with .NET 8, bringing with it a bunch of cool new features that have made developers sit up and take notice. I'll be breaking down each feature with real coding examples to show how they can make your coding life better and more efficient.

## Enhancements

### Collection Expressions

C# 12 brings a fresh take on handling collections like arrays, lists, and spans, making the syntax cleaner and more intuitive. The introduction of collection expressions eliminates the need for the 'new' operator and specifying the type, allowing you to simply list your items within angle brackets.

Even better, the new spread operator ".." makes combining collections seamless, enhancing code readability and reducing clutter.

```C#
//Before
var integers = new int[] { 1,2,3,4,5 };
var list = new List<int>() { 1,2,3,4,5 };
var fruits = new List<string>() {"apple", "banana", "cherry"};

//After
int[] integers = [ 1,2,3,4,5 ];
List<int> list = [ 1,2,3,4,5 ];
List<string> fruits = ["apple", "banana", "cherry"];
```

This feature boosts coding efficiency by cutting down on boilerplate and potential errors, while also making your code easier to read and maintain. With these changes, working with collections in C# has become more straightforward, allowing for more expressive and flexible coding.

### Primary Constructors

C# 12 introduces a streamlined approach to class and struct construction with the advent of primary constructors, significantly reducing the verbosity traditionally associated with object initialization.

This new feature **allows constructors to be declared directly within the type's declaration line**, making it applicable to classes, structs, record classes, and record structs. It's particularly effective for initializing fields or properties directly with constructor parameters, thereby facilitating a more straightforward dependency injection.

```c#
public class User(string firstName, string lastName, int age, List<Role> roles)
{
    public string FirstName => firstName;
    public string LastName => lastName;
    public int Age => age;
    public List<Role> => roles;
}
```

Here's what makes primary constructors stand out:

- **Conciseness:** By integrating constructors into the type declaration, C# 12 eliminates the need for separate, often repetitive, constructor definitions. This not only simplifies the code but also enhances its readability.
- **Accessibility:** Having the constructor logic within the class or struct definition itself makes it easier to understand and maintain the code, as it centralizes the logic for object creation and initialization.
- **Readability:** The code more clearly communicates the structure of an object and its initialization needs, making it easier for developers to grasp the essentials at a glance.

In essence, primary constructors cut down on the boilerplate code associated with setting up classes and structs, making code more concise, accessible, and readable, and thus streamlining the development process.

### Inline Arrays

C# 12 introduces inline arrays, a feature that enhances array usage by allowing fixed-size arrays to be declared within structs. This means arrays can now be allocated on the stack, boosting performance by reducing heap allocations and copying. Inline arrays can be initialized directly within expressions, making code more concise and memory-efficient.

```c#
using System.Runtime.CompilerServices;

[InlineArray(5)]
public struct FixedArray
{
    private int _element;
    // Usage
    var buffer = new FixedSizeBuffer();
    for (int i = 0; i < 5; i++) buffer[i] = i;
}
```

This leads to:

- **Memory Efficiency:** Reduces overhead by avoiding unnecessary allocations.
- **Conciseness:** Allows for direct array initialization in expressions, streamlining code.
- **Readability:** Improves clarity by cutting out temporary variables.

While inline arrays offer notable benefits like enhanced memory efficiency, their application may not always extend to replacing traditional arrays in everyday use.

### Alias Any Type with 'using'

C# 12 introduces an enhancement to type aliasing, expanding its capabilities beyond named types like classes or structs, which were previously the only types that could be aliased. Now, it's possible to alias any type, including tuples, arrays, and generics. This development simplifies code by reducing verbosity, thereby improving both readability and maintainability.

```C#
// possible only with C# 12
using Point = (int x, int y);
Point origin = (0, 0);
    
Console.WriteLine(origin);
```

By broadening the scope of the using directive to encompass complex types, C# 12 makes it easier to work with intricate data structures while keeping the codebase clean and understandable.

### Default Lambda Parameters

Prior to C# 12, incorporating default parameters into your code was restricted to traditional functions.

```c#
public static void WelcomeUser(string username = "Guest") {
    Console.WriteLine($"Welcome, {username}!");
}

WelcomeUser();
```

However, the advent of C# 12 revolutionizes this by extending the capability to lambda expressions. This new feature, known as Default Lambda Parameters, introduces the ability to specify default values for lambda parameters, thereby enhancing flexibility and streamlining execution.

```c#
var WelcomeUser = (string username = "Guest") => Console.WriteLine($"Welcome, {username}!");

WelcomeUser();
```

Now, lambda expressions can be executed without the mandatory need to specify every parameter, marking a significant leap in coding efficiency and expression conciseness.

## Conclusion

C# 12 brings a bunch of cool new updates that make coding easier, faster, and lets you try new ways of programming. But, not everything is ready for prime time right out of the gate. Some features are still being tested, so you might want to use them carefully.

## References

- [Official C# documentation](https://learn.microsoft.com/en-us/dotnet/csharp/whats-new/csharp-12)
- [Stefan's Blog talking about the same](https://stefandjokic.tech/posts/5-new-cool-features-in-csharp?utm_source=emailoctopus&utm_medium=email&utm_campaign=%2361%20Stefan%27s%20Newsletter%20-%203%20things%20you%20should%20know%20about%20Strings)
