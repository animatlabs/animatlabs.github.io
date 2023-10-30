---
title: "Demystifying SOAP Services in the world of .NET Core"
excerpt: >-
  "Exploring the new ways of achieving Soap based Apis in aspnet-core..."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - SOAP
  - CoreWcf
  - SoapCore
  - Asmxass
  - Wcf
  - .NET-Framework
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

When we talk about an API in form of protocols, there are generally 2 options that come to our mind, one being, obviously, REST (Representational State Transfer) and the other being SOAP (Simple Object Access Protocol); others being RPC and GraphQL APIs.

In this article, we are going to explore the various ways in which we can create SOAP APIs in the legacy, .net framework, and the latest and the greatest, which is .NET 6.0 as fo right now. Similar would be the case, if for some commercial requirement we had an opportunity to upgrade and ASMX service to newer counterparts. Although in the recent times the usage of REST APIs has gained a lot of popularity in the modern systems but SOAP API systems are still prevalent and used across domains and integrations.

Basically, when .net core/.net 6.0 was released, it did not have any support for soap-based APIs but with the ever developing world of .net we now have possible ways of mimicking the same, So let's jump into the actuals...

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/AllSoapBasedApis){: .btn .btn--primary}

## Legacy Systems (.NET Framework)

Earlier, when we only had .net framework there were only a couple of ways to be able to make soap APIs. They came in with **ASMX** (Active Server Methods) which then evolved to **WCF** (Windows Communication Foundation) services that could support the soap-based requests. Anyway, since we are not discussing why and how they evolved but rather the options that were there...so let's code the code!!

> Note: this section showcases how services were created earlier and then we can look into what has changed for setting those up in the new .net core system

For any soap-based system, we need to create a contract, basically an interface, which needs to be decorated with some attributes. which look like as follows:

```c#
[ServiceContract]
public interface ISampleService
{
    [OperationContract]
    int PerformCount(string input);

    [OperationContract]
    string PerformReverse(string input);
}
```

We would need a few extension methods, so let's define that as well here...

```c#
public static class StringExtensions
{
    public static int CountString(this string input)
    {
        return string.IsNullOrWhiteSpace(input) ? 0 : input.Length;
    }

    public static string ReverseString(this string input)
    {
        return string.IsNullOrWhiteSpace(input) ? null : new string(input.Reverse().ToArray());
    }
}
```

### ASMX

Now, we would continue to make an asmx service, for doing the same we need to create an .asmx class with the following code.

```c#
/// <summary>
/// Summary description for SampleAsmxService
/// </summary>
[WebService(Namespace = "http://tempuri.org/")]
[WebServiceBinding(ConformsTo = WsiProfiles.BasicProfile1_1)]
[System.ComponentModel.ToolboxItem(false)]
public class SampleAsmxService : WebService, ISampleService
{
    [WebMethod]
    public int PerformCount(string input)
    {
        return input.CountString();
    }

    [WebMethod]
    public string PerformReverse(string input)
    {
        return input.ReverseString();
    }
}
```

> This corresponds to a very simple implementation of the asmx service. Now, creating the client for the same so that we can see how this can be used.

How we work with these services is we register those as a connected service. Let's settle this by creating a client with the connected Service.

{% include figure image_path="/assets/images/posts/2023-06-19/AddConnectedService.jpg" alt="Add Connected Service" caption="Step 1: Add Connected Service" %}

{% include figure image_path="/assets/images/posts/2023-06-19/AddWebService.jpg" alt="Add Web Service" caption="Step 2: Add Web Service" %}

{% include figure image_path="/assets/images/posts/2023-06-19/SampleAsmxService.jpg" alt="Add ASMX Service" caption="Step 3: Add ASMX Service" %}

Add the url for the service as visible in the image below and hit `GO` to get all the available contracts exposed and then continue further...

{% include figure image_path="/assets/images/posts/2023-06-19/SampleAsmxService.jpg" alt="Add ASMX Service" caption="Step 3: Add ASMX Service" %}

{% include figure image_path="/assets/images/posts/2023-06-19/SepcifyDataTypeOptions.jpg" alt="Specify Data Type Options" caption="Step 4: Specify Data Type Options" %}

{% include figure image_path="/assets/images/posts/2023-06-19/SpecifyClientOptions.jpg" alt="Specify Client Options" caption="Step 5: Specify Client Options" %}

Once this is added we get client stub auto-generated for connecting with the service and we can use the same in the following way...

```c#
var httpsBinding = new BasicHttpBinding()
{
    Security = new BasicHttpSecurity()
    {
        Mode = BasicHttpSecurityMode.Transport, //Required for calls over Https
    }
};
const string strInput = "hannah";

// Asmx client invocation 
var testAsmxEndpoint = "https://localhost:44362/SampleAsmxService.asmx?wsdl";
var testAsmxEndpointAddress = new EndpointAddress(testAsmxEndpoint);
using (var testWcfClient = new SampleAsmxService.SampleAsmxServiceSoapClient(httpsBinding, testAsmxEndpointAddress))
{
    var intResult = testWcfClient.PerformCountAsync(strInput).Result;
    Console.WriteLine("With Client - Count - {0}", intResult.Body.PerformCountResult);

    var strResult = testWcfClient.PerformReverseAsync(strInput).Result;
    Console.WriteLine("With Client - Reverse - {0}", strResult.Body.PerformReverseResult);
}
```

The observations that we can decipher from stub are as follows:

- All the contracts, i.e. simple and synchronous, have been converted into asynchronous tasks.
- All the response data types have been embedded into series of classes and properties instead of a simple response.

### WCF

This is a general behavior of the ASMX client stubs and since we are looking forward for ways to mimic the services int he new systems, in commercial systems there might be a need to replace those with WCF or any other system, so let's go in and create some classes to mimic these responses.

```c#
// Response Classes to mimic the responses of the asmx service
[DataContract]
public class PerformCountResponse
{
    [DataMember]
    public PerformCountResponseBody Body { get; set; }
}

[DataContract]
public class PerformCountResponseBody
{
    [DataMember]
    public int PerformCountResult { get; set; }
}

[DataContract]
public class PerformReverseResponse
{
    [DataMember]
    public PerformReverseResponseBody Body { get; set; }
}

[DataContract]
public class PerformReverseResponseBody
{
    [DataMember]
    public string PerformReverseResult { get; set; }
}
```

With the classes to mimic the responses, we also need to update the service contract, so let's define that as well here. It extends on the original service contract exposing 2 more actions in the contract.

```c#
[ServiceContract]
public interface ISampleServiceExtended : ISampleService
{
    [OperationContract]
    PerformCountResponse PerformCountWithAsmxResponseFormat(string input);

    [OperationContract]
    PerformReverseResponse PerformReverseWithAsmxResponseFormat(string input);
}
```

First, let's create a common service for generically using everywhere from now onwards.

```c#
public class SampleService : ISampleServiceExtended
{
    public int PerformCount(string input)
    {
        return input.CountString();
    }

    public PerformCountResponse PerformCountWithAsmxResponseFormat(string input)
    {
        return new PerformCountResponse
        {
            Body = new PerformCountResponseBody
            {
                PerformCountResult = input.CountString()
            }
        };
    }

    public string PerformReverse(string input)
    {
        return input.ReverseString();
    }

    public PerformReverseResponse PerformReverseWithAsmxResponseFormat(string input)
    {
        return new PerformReverseResponse
        {
            Body = new PerformReverseResponseBody
            {
                PerformReverseResult = input.ReverseString()
            }
        };
    }
}
```

Since, the WCF service needs to be created with a `.svc` extension, let's create another class that extends the above with the required extension.

```c#
public class SampleWcfService : SampleService
{
}
```

As we can see above, the service got created with 4 actions, 2 how it would have looked generally and the others to mimic the ASMX service (if ASMX had to get upgraded to WCF).

Now, similar to the ASMX service, we will register the WCF Service as well to create client stub and follow the steps with just a different url.

{% include figure image_path="/assets/images/posts/2023-06-19/SampleWcfService.jpg" alt="Add WCF Service" caption="Add WCF Service" %}

Once the client stub is created, we can look into the code to consume the services as well.

```c#
var testWcfEndpoint = "https://localhost:44362/SampleWcfService.svc?wsdl";
var testWcfEndpointAddress = new EndpointAddress(testWcfEndpoint);
using (var testWcfClient = new SampleWcfService.SampleServiceExtendedClient(httpsBinding, testWcfEndpointAddress))
{
    // Point to note, if the all contracts return Task<T> instead of T
    var intResult = testWcfClient.PerformCountAsync(strInput).Result;
    Console.WriteLine("With Client - Count - {0}", intResult);

    var asmxIntResult = testWcfClient.PerformCountWithAsmxResponseFormatAsync(strInput).Result;
    Console.WriteLine("With Client - AsmxFormatCount - {0}", asmxIntResult.Body.PerformCountResult);

    var strResult = testWcfClient.PerformReverseAsync(strInput).Result;
    Console.WriteLine("With Client - Reverse - {0}", strResult);

    var asmxStrResult = testWcfClient.PerformReverseWithAsmxResponseFormatAsync(strInput).Result;
    Console.WriteLine("With Client - AsmxFormatReverse - {0}", asmxIntResult.Body.PerformCountResult);

}
```

One thing that we are doing additional over here is we are going to access the service both with and without the client stub, i.e., by the service contract directly. This is to showcase that it is not absolutely required to create a client-stub always...

```c#
using (var factory = new ChannelFactory<Core.ISampleServiceExtended>(httpsBinding, testWcfEndpointAddress))
{
    // Point to note all contracts can be used with T and not Task<T> in contrast with the above
    var channel = factory.CreateChannel();

    // Point to note, if the all contracts return Task<T> instead of T
    var intResult = channel.PerformCount(strInput);
    Console.WriteLine("Without Client - Count - {0}", intResult);

    var asmxIntResult = channel.PerformCountWithAsmxResponseFormat(strInput);
    Console.WriteLine("Without Client - AsmxFormatCount - {0}", asmxIntResult.Body.PerformCountResult);

    var strResult = channel.PerformReverse(strInput);
    Console.WriteLine("Without Client - Reverse - {0}", strResult);

    var asmxStrResult = channel.PerformReverseWithAsmxResponseFormat(strInput);
    Console.WriteLine("Without Client - AsmxFormatReverse - {0}", asmxIntResult.Body.PerformCountResult);
}
```

## Latest (.NET 6.0)

The time .Net Core/.Net Standard came into existence, there was nothing that could compare with the ASMX/WCF services in the .net framework stack that were available for the same. Therefore, with need came a third-party library that just did what we needed it for, provide SOAP actions in .net core, namely `SoapCore`. Anyway, now we also have the Core version of WCF, namely CoreWCF as well. Let's discuss the implementation of both of them into the system and replicate the behavior as above.

### SoapCore

Before, we begin, let's install the required libraries, `SoapCore 1.1.0.37` and create a service for the `ISampleServiceExtended` and now let's define the service.

Now, since, we have set up all the required code in the Core libraries themselves, we can just setup the endpoint here in the new application referring to those classes.

```c#
//Program.cs
var builder = WebApplication.CreateBuilder(args);

// Add SoapCore
builder.Services.AddSoapCore();
builder.Services.AddSingleton<ISampleServiceExtended, SampleService>();

var app = builder.Build();

// Register SoapCore
((IApplicationBuilder)app).UseSoapEndpoint<ISampleServiceExtended>("/SampleSoapCoreService", new SoapEncoderOptions(), SoapSerializer.DataContractSerializer);

app.Run();
```

NOw, that is all that is required to be able to run the service with all the setup as required.

### CoreWCF

With the advent af Core WCF, it exposes the endpoints in almost the similar way, we just need to add in the references for CoreWCF and this is how we can configure adding in the same here:

```c#
//Program.cs
var builder = WebApplication.CreateBuilder(args);

// Add CoreWCF
builder.Services.AddServiceModelServices();
builder.Services.AddServiceModelMetadata();
builder.Services.AddSingleton<IServiceBehavior, UseRequestHeadersForMetadataAddressBehavior>();

var app = builder.Build();

// Register CoreWcf
app.UseServiceModel(builder =>
{
    builder.AddService<SampleService>(serviceOptions => { })
    // Add BasicHttpBinding endpoint
    .AddServiceEndpoint<SampleService, ISampleServiceExtended>(new BasicHttpBinding(CoreWCF.Channels.BasicHttpSecurityMode.Transport), "/SampleCoreWcfService");

    var mb = app.Services.GetRequiredService<ServiceMetadataBehavior>();
    mb.HttpsGetEnabled = true;
});

app.Run();
```

## Conclusion

Therefore, what we witness over here is that with .NET Core as well, we can achieve SOAP based endpoint showing almost the same behavior, it is just that we need to do some workaround encapsulating the response types into their specific type class objects so that the consumers do not have to make any significant changes on their side. But, still it is very well doable...happy coding and happy modernizations!!