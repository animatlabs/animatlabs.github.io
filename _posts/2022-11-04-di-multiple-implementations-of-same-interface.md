---
title: ".NET Apps: DIs with multiple implementations of the same interface"
excerpt: >-
  "Enabling dependency injections of multiple implementations of the same interface in .NET Apps. 2 ways to implement multiple implementations of the same interface."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - Function-Apps
  - Dependency-Injections
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

Many times, during our application development we come across a situation where we wish to reuse a single interface to define multiple classes and for even different purposes. The issue with using that with .NET Core and the in-built dependency injection is the trouble when we face writing code which has to use the above cases. Therefore, in this article, we are going to discuss two ways in which I think we can overcome the same in the present time.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/app-multiple-instances-same-interface){: .btn .btn--primary}

## Project Setup

Let's start with setting up an interface that is going to be the base of operations here.

```c#
public interface IService
{
    void DoWork();
}
```

Following this, let's set up a base service that helps us define the actual classes that are going to be used.

```c#
public abstract class BaseService : IService
{
    private readonly ILogger<IService> logger;
    protected string ServiceName { get; set; }

    public BaseService(ILogger<IService> logger)
    {
        this.logger = logger;
    }

    public virtual void DoWork()
    {
        logger.LogInformation("Successfully executed {0}", ServiceName);
    }
}
```

Now, it is time to set up actual services with the help of a `BaseService`. Here, in this case, we are trying to set up the different services based on their lifetimes. Therefore, let's create the service classes representing singleton, scoped and transient lifetimes.

```c#
public class SingletonService : BaseService, IService
{
    public SingletonService(ILogger<IService> logger) : base(logger)
    {
        ServiceName = typeof(SingletonService).Name;
    }
}

public class ScopedService : BaseService, IService
{
    public ScopedService(ILogger<IService> logger) : base(logger)
    {
        ServiceName = typeof(ScopedService).Name;
    }
}

public class TransientService : BaseService, IService
{
    public TransientService(ILogger<IService> logger) : base(logger)
    {
        ServiceName = typeof(TransientService).Name;
    }
}
```

Since all the required services along with the interfaces are set up, let's set up the base function/application that we are going to use for the demo.

```c#
public abstract class FunctionBase
{
    protected IService singletonService;
    protected IService scopedService;
    protected IService transientService;

    protected async Task<IActionResult> ExecuteFunctionAsync()
    {
        singletonService.DoWork();
        scopedService.DoWork();
        transientService.DoWork();

        string responseMessage = "This HTTP triggered function executed successfully.";
        return await Task.FromResult(new OkObjectResult(responseMessage)).ConfigureAwait(false);
    }
}
```

## Problem

As we can notice in the code snippet above, we have used the same interface `IService` to reference all the dependencies. In general, whenever we talk about DIs, in the `Configure` method of the `Startup.cs` we generally register those with the help of interfaces to classes, but let's see the problem here...

```c#
internal class Startup : FunctionsStartup
{
    public override void Configure(IFunctionsHostBuilder builder)
    {
        builder.Services.AddSingleton<IService, SingletonService>();
        builder.Services.AddScoped<IService, ScopedService>();
        builder.Services.AddTransient<IService, TransientService>();
    }
}
```

The thing that we see here is that all the types of services have been registered with the same interface. But let's try and use it in the way we are generally used to and see what happens.

```c#
public Function_0_Problem(IService singletonService, IService scopedService, IService transientService)
{
    this.singletonService = singletonService;
    this.scopedService = scopedService;
    this.transientService = transientService;
}
```

Now, trying to debug the same...

{% include figure image_path="/assets/images/posts/2022-11-04/DI_Problem.png" alt="Problem with direct DI" caption="Problem with direct DI" %}

As we can see in the image, the dependencies get loaded but we get a random, and not the desired, service resolved from the interface. And hence, we are unable to resolve the required dependencies and end up not fulfilling what we wished for.

## Solution

So, this problem is not something we need a hack for but is already available within the constructs of .NET Core. So, we could possibly do it in the following ways.

### Using a List Type/ServiceProvider

Instead of the way we inserted the type dependencies one by one, we will need to insert those in an enumerable of the type of the dependencies or directly with the the help of service provider.

```c#
public Function_A_DI_List(IEnumerable<IService> services)
{
    singletonService = services.First(svc => svc.GetType() == typeof(SingletonService));
    scopedService = services.First(svc => svc.GetType() == typeof(ScopedService));
    transientService = services.First(svc => svc.GetType() == typeof(TransientService));
}

// OR
public Function_A_DI_List(IServiceProvider serviceProvider)
{
    var services = serviceProvider.GetServices<IService>();
    singletonService = services.First(svc => svc.GetType() == typeof(SingletonService));
    scopedService = services.First(svc => svc.GetType() == typeof(ScopedService));
    transientService = services.First(svc => svc.GetType() == typeof(TransientService));
}
```

As we can see above, the code remains almost the same. Although I prefer using the former approach rather than the latter as it weeds out unnecessary instantiation of the `services` again from the service provider. With this using an IEnumerable instance, we get all the required instances registered for a type and hence we can sort those out.

The problem with this solution, although it does solve the initial issue of not getting all the desired types, is that it is not testable as we will have trouble mocking either the `GetServices` method on `IServiceProvider` or the `First` method and getting the required matching service.

### Using a custom resolver

To solve the above problems, we are building another wrapper that can resolve it in a testable and extensible way. The first thing we would do is preferably set up an `enum`, although we could work with strings as well my personal preference is to use an `enum` over a string.

```c#
public enum ServiceType
{
    Singleton,
    Scoped,
    Transient
}
```

Once the service type is done, we will be looking into setting up an interface for Resolver.

```c#
public interface IServiceResolver
{
    IService Provide(ServiceType serviceType);
}
```

Now, setting up the actual service resolver to clear out the dependencies.

```c#
public class ServiceResolver : IServiceResolver
{
    private readonly IServiceProvider serviceProvider;

    public ServiceResolver(IServiceProvider serviceProvider)
    {
        this.serviceProvider = serviceProvider;
    }

    public IService Provide(ServiceType serviceType)
    {
        var service = serviceType switch
        {
            ServiceType.Singleton => serviceProvider.GetService(typeof(SingletonService)),
            ServiceType.Scoped => serviceProvider.GetService(typeof(ScopedService)),
            ServiceType.Transient => serviceProvider.GetService(typeof(TransientService)),
            _ => null
        };

        return (IService)service;
    }
}
```

Now, once this is done, as we can see that still it is dependent on the service provider to get the types, we will have to make relevant changes in the `Startup.cs` class as well.

```c#
internal class Startup : FunctionsStartup
{
    public override void Configure(IFunctionsHostBuilder builder)
    {
        builder.Services.AddSingleton<SingletonService>();
        builder.Services.AddScoped<ScopedService>();
        builder.Services.AddTransient<TransientService>();
        builder.Services.AddSingleton<IServiceResolver, ServiceResolver>();
    }
}
```

Now, all the required setup is done and we can move towards defining the classes where we wish to utilize the same.

```c#
public Function_B_DI_Resolver(IServiceResolver serviceResolver)
{
    singletonService = serviceResolver.Provide(ServiceType.Singleton);
    scopedService = serviceResolver.Provide(ServiceType.Scoped);
    transientService = serviceResolver.Provide(ServiceType.Transient);
}
```

As we can see from the code, it is cleaner, extensible and testable, with which we get almost all that we could have hoped for.

## Conclusion

There could be other possible ways to achieve the same, there are the ways that I generally see and use as of right now given the time and complexity required to implement the solutions. The latter solution gives me the option of unit testing, therefore it is my preferred way of coding for commercial apps and setups.
