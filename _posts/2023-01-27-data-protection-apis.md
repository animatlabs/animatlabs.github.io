---
title: ".NET Apps: Securing data with Data Protection APIs"
excerpt: >-
  "Dealing with the unavoidable eventuality of storing sensitive information and leveraging IDataProtector data protection APIs to solve the problem at hand."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - DataSecurity
  - IDataProtector
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

We discussed in the previous article about securing the IDs from the public APIs. In the same direction, we may end up in a situation with the commercial set-up where might need to persist security-sensitive data. There are a few reasons why we would wish to encrypt data available in the system which could majorly be categorized into either client requirements, compliance or untrusted persistence/transmission or third parties involved, for example, validation tokens, passwords, etc.

This is a far common problem to go unnoticed by Microsoft for which they released a package in dotnet core which helps toward providing a solution for certain such problems. In this article, we are going to discuss some of the facets of the same and explore its capabilities.

## When to and when not to?

WARNINGS FIRST!! As Microsoft documentation for the same states...

> It's not advised to use these APIs to protect payloads which require long-term or indefinite persistence. "Can I afford for the protected payloads to be permanently unrecoverable after a month?" can serve as a good rule of thumb; if the answer is no then developers should consider alternative APIs.

Theoretically, you could use the data-protection system for data that you wish to encrypt and store long-term, in a database for example. The data-protection keys expire every 90 days (by default), but you can still decrypt data with an expired key.

The real danger comes if the data-protection keys get deleted for some reason. This isn't recommended, but accidents happen. When used correctly, the impact of deleting data-protection keys on most applications would be relatively minor—users would have to log in again, and password reset keys previously issued would be invalid—annoying, but not a disaster.

## Implementations

Here, let's set up a small sample console app and see how it basically works! But before that let's install and NuGet Package `Microsoft.AspNetCore.DataProtection` and do the following:

```c#
using Microsoft.AspNetCore.DataProtection;

public class DataProtectionExample {
    private readonly IDataProtector _protector;

    public DataProtectionExample(IDataProtectionProvider provider) {
        _protector = provider.CreateProtector("example_purpose");
    }

    public string EncryptPassword(string password) {
        return _protector.Protect(password);
    }

    public string DecryptPassword(string protectedPassword) {
        return _protector.Unprotect(protectedPassword);
    }
}
```

In this example, we are using the IDataProtectionProvider to create an IDataProtector object with the `purpose` "example_purpose" which works in a similar fashion to a `secret` in encryption/hashing algorithms. The purpose string doesn't have to be secret. It should simply be unique in the sense that no other well-behaved component will ever provide the same purpose string.

The EncryptPassword method takes a string input and returns the encrypted string using the _protector. Protect method. On the other hand, the DecryptPassword method takes an encrypted string input and returns the decrypted string using_protector.Unprotect method.

### Lifetime Bound

Now, many times we need a payload that needs to have a particular lifetime. We can make it possible with the help of `ITimeLimitedDataProtector` which has been made available to us. This is basically an extension over the `IDataProtector` and is created like this:

```c#
var timeLimitedDataProtector = _protector.ToTimeLimitedDataProtector();
```

The time-limited format of the data protector exposes certain other methods in the system like the following:

- Protect(string plaintext, DateTimeOffset expiration) : string
- Protect(string plaintext, TimeSpan lifetime) : string
- Unprotect(string protectedData, out DateTimeOffset expiration) : string

Similar methods are available with `byte[]` as input as well. The Unprotect methods return the original unprotected data. If the payload hasn't yet expired, the absolute expiration is returned as an optional out parameter along with the original unprotected data. If the payload is expired, all overloads of the Unprotect method will throw `CryptographicException`.

### Configurations

#### Key Store

We could choose the locations where we wish to keep the keys in the system, apart from where they are created by default, as explained below:

- Default:
  - If the app is hosted in Azure Apps, keys are persisted to the %HOME%\ASP.NET\DataProtection-Keys folder. This folder is backed by network storage and is synchronized across all machines hosting the app.
  - If the user profile is available, keys are persisted to the %LOCALAPPDATA%\ASP.NET\DataProtection-Keys folder. If the operating system is Windows, the keys are encrypted at rest using DPAPI.
  - If the app is hosted in IIS, keys are persisted to the HKLM registry in a special registry key that's ACLed only to the worker process account. Keys are encrypted at rest using DPAPI.
  - If none of these conditions matches, keys aren't persisted outside of the current process. When the process shuts down, all generated keys are lost.
  
- KeyVault:
  
  ```c#
    builder.Services.AddDataProtection()
    .PersistKeysToAzureBlobStorage(new Uri("<blobUriWithSasToken>"))
    .ProtectKeysWithAzureKeyVault(new Uri("<identifier>"), new DefaultAzureCredential());
  ```

- File System:
  
  ```c#
    builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(@"<directoryPath>"));
  ```
  
  > If you change the key persistence location, the system no longer automatically encrypts keys at rest, since it doesn't know whether DPAPI is an appropriate encryption mechanism.

- Database:
  To do so, the DbContext should implement the `IDataProtectionKeyContext. IDataProtectionKeyContext` exposes the property `DataProtectionKeys`, therefore we have something as below:
  
  ```c#
    builder.Services.AddDataProtection()
    .PersistKeysToDbContext<SampleDbContext>();

    public DbSet<DataProtectionKey> DataProtectionKeys { get; set; } = null!;
  ```

#### Key Lifetime

We could choose to have a custom key lifetime, by default it is 90 days. To do so, we will have to do the following:

```c#
builder.Services.AddDataProtection()
    .SetDefaultKeyLifetime(TimeSpan.FromDays(<days>));
```

#### DisableAutomaticKeyGeneration

You may have a scenario where you don't want an app to automatically roll keys (create new keys) as they approach expiration.

```c#
builder.Services.AddDataProtection()
    .DisableAutomaticKeyGeneration();
```

## More details & references

The article does not cover all the aspects of the data protection API in detail, but only the highlights of the same. To get detailed information about the same, refer to the following links:

- [Official Microsoft Documentation](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/introduction?view=aspnetcore-6.0)
- [Introduction to DP Api - Andrew Lock](https://andrewlock.net/an-introduction-to-the-data-protection-system-in-asp-net-core/)
