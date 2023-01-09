---
title: ".NET Apps: Hashing the IDs - Securing internal IDs"
excerpt: >-
  "We tend to expose the internal IDs in a system, therefore trying to prevent exposing the same via hashing"
categories:
  - Technical
  - .NET
  - Apps
tags:
  - C#
  - .NET
  - .NET-Core
  - Database
  - Hashing
  - Alternate to GUID
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

In the world driven by data, the entities are setup and identified with the help of keys. Those keys could come in many shapes and formats namely, numbers, strings, GUIDs/UUIDs... Sometimes the system designers don’t think of security concerns when implementing the REST APIs.

In general, for the systems that use an integer-based Id the REST APIs for their get/post APIs would use those IDs directly, and hence become very predictable. With their predictability and monotonic availability, one could easily fetch results for identifiers which they were not even supposed to, for example: orders of clients, user information, etc. This might turn out to be a security nightmare unless there are either some or the other checks or solutions are put in place for the same.

Therefore, in this article, we will discussing about the alternatives that we could possibly go with to be able to curb the possible security breaches in the systems where we do have numeric Ids.

## Problem Statement

In the commercial setups, the databases and the ID setup system could be based on anything be it GUIDs, UUIDs, or integer-based. Now, we may think about the systems that have IDs that are GUID or UUID based, the IDs though unpredictable but it is not always possible or feasible to use or change the system. Apart from that, when we do go with GUID/UUID based systems, although controversial, DBAs and developers raise the following concerns:

- Larger than the traditional numeric value
- Difficult to debug
- Do not increase monotonically

## Solution

We will be looking into an approach which masks the IDs, basically a type of 2-way encryption technique with hashing which has been around for a very long time, theoretically. The similar approach is being user in today's date on huge platforms like youtube, instagram, and etc. for example = `https://www.youtube.com/watch?v=**tSuwe7FowzE**`, the value to the parameter `v` is the hash, hiding the actual Id which could be either numeric or GUID/UUID-based.

In this discussion, we will specifically be discussing masking/hashing the numeric-based systems and do that with the help of an open-source project - [HashIds.NET](https://hashids.org/net/). This project has been around for quite some time and has significant amount of downloads per day and overall to bering it about.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/HashId.NET/Sample.Hashed){: .btn .btn--primary}

## Project Setup

We are going to be using a web api based project in .NET 6.0 as of right now for the purpose of the demo.

> The project has been setup in a playground arena, so as to explain the usage and does not represent how it actually would be used in an actual commercial system or follows all the best of coding guidelines.

The first thing that we would be doing is installing the dependency onto the project, wiz. `Hashids.net` (v1.6.1 - latest to date). Once the dependencies are set up, now lets look into setting up the code for the same.

The first thing that we are going to do is set up the DI container to handle the HashIds' dependencies. One thing to note, as in general any hashing system works with a [Salt](https://auth0.com/blog/adding-salt-to-hashing-a-better-way-to-store-passwords/), so no difference here as well we would need to set up a `Salt` which is known to the system only.

For simplicity, let's assume that the `Salt` for this system is `"SECURED-SALT"` then the setup in the `Program.cs` or `Startup.cs` for the application would be as follows:

```c#
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<IHashids>(_ => new Hashids("SECURE-SALT"));
```

There are multiple overloads available to register the hashIds' dependency where we have the following:

- Salt - A string based entry that is used for hashing
- MinHashLenth - A numeric value representing how long should be at minimum
- Alphabet - Characters to be used to create the hash, if we wish to limit the same

In the above use-case, I have not used the any other overload value and am just using the `Salt`.

Followed by this, let's setup the data. For the purpose of the demo, we are going to use static data from a json file, therefore setting it up as follows:

```json
[
  {
    "id": 1,
    "name": "user1",
    "email": "user1@test.com"
  },
  {
    "id": 2,
    "name": "user2",
    "email": "user2@test.com"
  },
  {
    "id": 3,
    "name": "user3",
    "email": "user3@test.com"
  }
]
```

Now, we will have to setup the object and the view model classes, with nothing different other than the type of the Id property.

```c#
// The object model representing the data structure
public class User
{
    public long Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}

// The view model representing the response of the service
public class User
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}
```

This will be followed by the creating the controller and making relevant changes in there. The controller is defined as of right now, to be dependent upon the `UserService` which does the heavy lifting as of right now and takes the responsibility for  fetching and massaging the data to suit the needs here.

```c#
[ApiController]
    [Route("[controller]")]
    public class UserController : ControllerBase
    {
        private readonly IUserService userService;

        public UserController(IUserService userService)
        {
            this.userService = userService;
        }

        [HttpGet("{id}", Name = "GetUser")]
        public IActionResult Get([FromRoute] string id)
        {
            var result = userService.GetUserById(id);

            if (result == null)
                return NotFound();

            return Ok(result);
        }

        [HttpGet(Name = "GetAllUsers")]
        public IActionResult GetAll()
        {
            return Ok(userService.GetAllUsers());
        }
    }
```

As we can see in the code snippet above, we have created 2 end points, one for getting all the details and the other for getting details of the user based on the hashed IDs. So, we can first use the `GetAllUsers` end point to get the hashed Ids and then use those to query the same from the system via `GetUser` endpoint.

The other thing to notice here is that the response here always the hashed string and the input to get the details again is availed with the help of a string instead of a number as in the actual object model.

Now, setting up the `UserService` that deals with the data and its transformation.

```c#
// Setting up the interface for the service
public interface IUserService
{
    User GetUserById(string userId);
    IEnumerable<User> GetAllUsers();
}
// Here the `User` object is the view Models' User that has string based Ids

// Setting up the class for the same
public sealed class UserService : IUserService
{
    private readonly IHashids hashids;
    private readonly IEnumerable<Models.Entity.User> users;

    public UserService(IHashids hashids)
    {
        this.hashids = hashids;
        users = Newtonsoft.Json.JsonConvert.DeserializeObject<IEnumerable<Models.Entity.User>>(File.ReadAllText("UserDetails.json"));
    }

    public Models.View.User GetUserById(string userId)
    {
        var rawId = hashids.DecodeLong(userId);

        if (rawId.Length == 0)
            return null;

        return MapEntityToView(users.FirstOrDefault(x => x.Id == rawId[0]));
    }

    public IEnumerable<Models.View.User> GetAllUsers()
    {
        return users.Select(x => MapEntityToView(x));
    }

    private Models.View.User MapEntityToView(Models.Entity.User? user)
    {
        if (user == null)
            return null;

        return new Models.View.User
        {
            Id = hashids.EncodeLong(user.Id),
            Name = user.Name,
            Email = user.Email
        };
    }
}
```

As we can see in the code above, the constructor loads in the dependency for the `IHashids` that we has setup in the `Startup.cs` and loads the data for the users's service. We have set up a private method which takes care of mapping the entity model to the view model by encoding the userId into the encoded string.

The package as of right now, supports encoding and decoding multiple elements to form a single hash. Therefore, when we decode in the GetById, we get and array output from which we need to check if there is any valid input available or nor. So, in an alternate requirement, it could possibly be used like:

```c#
var str = hashids.EncodeLong(1, 2, 3);
// This would result in a single string based on the same, let's assume "AbcyTD"

// Now when we decode the same, it gives an array with 3 elements
long[] respose = hashids.DecodeLong("AbcyTD");
```

> The encoded strings generated from the input are case sensitive.

The images below represent the output of the APIs on the swagger pages for the same.

{% include figure image_path="/assets/images/posts/2022-12-01/GetAllResponse.JPG" alt="All UserIds converted" caption="All UserIds Converted" %}

As we can see in the image above the user Ids where the IDs were 1/2/3 respectively as indicated in the json object above have been encoded.

Now, let's try to get the user details by the encoded id, and see what it returns:

{% include figure image_path="/assets/images/posts/2022-12-01/GetByIdResponse.JPG" alt="Single User Detail" caption="Single User Detail" %}

> If we try to make a call with the general Id then the Id is not found in the system.

## Performance

Since, the focus of the discussion above was security, we have not discussed the performance of this as of yet. From various studies (probably to be shared later), we see it adds a couple of nano seconds to the call along with a couple of bytes of memory. So, not a massive impact but in the future versions this might get faster and support more functionalities.

## Conclusion

With this we are successfully able to mask the Ids and make then unpredictable. The process adds close to nothing on the latency, therefore where we have such a use case and security is important, we could safely think about such a library.

## References

- [HashIds.NET Repository](https://github.com/ullmark/hashids.net)
- [Guid are coll, but this is cooler - Nick Chapsas](https://www.youtube.com/watch?v=tSuwe7FowzE)