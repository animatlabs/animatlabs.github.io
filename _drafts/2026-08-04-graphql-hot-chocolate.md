---
title: "GraphQL in .NET with Hot Chocolate"
excerpt: >-
  "REST isn't always the answer. Here's how to build GraphQL APIs in .NET with Hot Chocolate."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - GraphQL
  - Hot Chocolate
  - API
  - Query Language
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

<!-- 
ORIGINALITY CHECKLIST (from your plan):
- [ ] Does this include a real problem I faced?
- [ ] Did I run the examples myself?
- [ ] Is there at least one personal opinion or recommendation?
- [ ] Would I recognize this as my writing if I saw it elsewhere?
- [ ] Does it reference my actual tech stack or domain?

TARGET: 1,800-2,200 words (long-form)
-->

## Why GraphQL?

<!-- 
TODO: Write your intro here. Avoid generic phrases like "In this article, we will explore..."

AUTHENTIC OPENER EXAMPLE:
"After building REST APIs for years, I hit a wall: mobile clients needed different data 
shapes than web clients, and we were either over-fetching or making multiple round trips. 
GraphQL solved both problems."

Include:
- A real scenario from your work where GraphQL made sense
- Why GraphQL over REST (over-fetching, under-fetching, multiple round trips)
- When GraphQL is the right choice
- When REST is still better
- Your own experience with GraphQL
-->

### GraphQL vs REST

<!-- 
TODO: Explain the differences between GraphQL and REST
Include:
- Over-fetching and under-fetching problems
- Multiple round trips
- Strongly typed schema
- Single endpoint
- When to use GraphQL vs REST
- Your opinion on when each makes sense
-->

## Hot Chocolate Setup

<!-- 
TODO: Explain how to set up Hot Chocolate in ASP.NET Core
Include:
- Package installation
- Basic configuration
- Minimal setup example
- What Hot Chocolate provides
-->

```csharp
// TODO: Add Hot Chocolate setup example
// Install: HotChocolate.AspNetCore

builder.Services
    .AddGraphQLServer()
    .AddQueryType<Query>()
    .AddMutationType<Mutation>()
    .AddSubscriptionType<Subscription>();

var app = builder.Build();

app.MapGraphQL();
```

## Defining Types

<!-- 
TODO: Explain how to define GraphQL types in Hot Chocolate
Include:
- Object types
- Input types
- Scalar types
- Enums
- Type relationships
- Code-first vs schema-first approaches
-->

```csharp
// TODO: Add type definition examples
public class User
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
    public List<Post> Posts { get; set; }
}

public class UserType : ObjectType<User>
{
    protected override void Configure(IObjectTypeDescriptor<User> descriptor)
    {
        descriptor.Field(u => u.Email)
            .Description("The user's email address");
    }
}

public class CreateUserInput
{
    public string Name { get; set; }
    public string Email { get; set; }
}

public class CreateUserInputType : InputObjectType<CreateUserInput>
{
    protected override void Configure(IInputObjectTypeDescriptor<CreateUserInput> descriptor)
    {
        descriptor.Field(i => i.Email)
            .Type<NonNullType<StringType>>();
    }
}
```

## Queries

<!-- 
TODO: Explain GraphQL queries in Hot Chocolate
Include:
- Query resolvers
- Field resolvers
- Data fetching
- Filtering and sorting
- Pagination
- Your own query examples
-->

```csharp
// TODO: Add query examples
public class Query
{
    public async Task<User> GetUser(int id, [Service] IUserService userService)
    {
        return await userService.GetByIdAsync(id);
    }
    
    [UsePaging]
    [UseFiltering]
    [UseSorting]
    public IQueryable<User> GetUsers([Service] IUserService userService)
    {
        return userService.GetAll();
    }
}

// Query example:
// {
//   user(id: 1) {
//     id
//     name
//     email
//     posts {
//       title
//     }
//   }
// }
```

## Mutations

<!-- 
TODO: Explain GraphQL mutations in Hot Chocolate
Include:
- Mutation resolvers
- Input validation
- Error handling
- Returning data from mutations
- Your own mutation examples
-->

```csharp
// TODO: Add mutation examples
public class Mutation
{
    public async Task<User> CreateUser(
        CreateUserInput input,
        [Service] IUserService userService)
    {
        var user = new User
        {
            Name = input.Name,
            Email = input.Email
        };
        
        return await userService.CreateAsync(user);
    }
    
    public async Task<User> UpdateUser(
        int id,
        UpdateUserInput input,
        [Service] IUserService userService)
    {
        var user = await userService.GetByIdAsync(id);
        if (user == null)
            throw new UserNotFoundException(id);
        
        user.Name = input.Name ?? user.Name;
        user.Email = input.Email ?? user.Email;
        
        return await userService.UpdateAsync(user);
    }
}

// Mutation example:
// mutation {
//   createUser(input: { name: "John", email: "john@example.com" }) {
//     id
//     name
//     email
//   }
// }
```

## Subscriptions

<!-- 
TODO: Explain GraphQL subscriptions in Hot Chocolate
Include:
- Real-time updates with WebSocket
- Subscription resolvers
- Publishing events
- Use cases for subscriptions
- Your own subscription examples
-->

```csharp
// TODO: Add subscription examples
public class Subscription
{
    [Subscribe]
    public User OnUserCreated([EventMessage] User user)
    {
        return user;
    }
}

public class Mutation
{
    public async Task<User> CreateUser(
        CreateUserInput input,
        [Service] IUserService userService,
        [Service] ITopicEventSender eventSender)
    {
        var user = await userService.CreateAsync(new User
        {
            Name = input.Name,
            Email = input.Email
        });
        
        await eventSender.SendAsync("UserCreated", user);
        
        return user;
    }
}

// Subscription example:
// subscription {
//   onUserCreated {
//     id
//     name
//     email
//   }
// }
```

## N+1 Problem and DataLoader

<!-- 
TODO: Explain the N+1 problem in GraphQL and how DataLoader solves it
Include:
- What the N+1 problem is
- How it manifests in GraphQL
- Hot Chocolate's DataLoader implementation
- Batch loading
- Caching
- Your own DataLoader examples
-->

```csharp
// TODO: Add DataLoader examples
public class UserDataLoader : BatchDataLoader<int, User>
{
    private readonly IUserService _userService;
    
    public UserDataLoader(
        IUserService userService,
        IBatchScheduler batchScheduler,
        DataLoaderOptions options)
        : base(batchScheduler, options)
    {
        _userService = userService;
    }
    
    protected override async Task<IReadOnlyDictionary<int, User>> LoadBatchAsync(
        IReadOnlyList<int> keys,
        CancellationToken cancellationToken)
    {
        var users = await _userService.GetByIdsAsync(keys);
        return users.ToDictionary(u => u.Id);
    }
}

public class PostType : ObjectType<Post>
{
    protected override void Configure(IObjectTypeDescriptor<Post> descriptor)
    {
        descriptor.Field(p => p.Author)
            .Resolve(async (context, cancellationToken) =>
            {
                var dataLoader = context.DataLoader<UserDataLoader>();
                return await dataLoader.LoadAsync(context.Parent<Post>().AuthorId, cancellationToken);
            });
    }
}
```

## Authorization

<!-- 
TODO: Explain authorization in Hot Chocolate
Include:
- Policy-based authorization
- Field-level authorization
- Type-level authorization
- Integration with ASP.NET Core authorization
- Your own authorization examples
-->

```csharp
// TODO: Add authorization examples
public class Query
{
    [Authorize]
    public async Task<User> GetCurrentUser([Service] ICurrentUserService currentUserService)
    {
        return await currentUserService.GetCurrentUserAsync();
    }
}

public class UserType : ObjectType<User>
{
    protected override void Configure(IObjectTypeDescriptor<User> descriptor)
    {
        descriptor.Field(u => u.Email)
            .Authorize("EmailViewPolicy");
    }
}

// In Program.cs
builder.Services
    .AddGraphQLServer()
    .AddAuthorization()
    .AddQueryType<Query>();
```

## My Recommendations

<!-- 
TODO: Share your personal opinion on using GraphQL with Hot Chocolate
Include:
- When GraphQL is the right choice
- When to stick with REST
- Best practices for Hot Chocolate
- Common pitfalls to avoid
- Performance considerations
- Your own experience and lessons learned
-->

### When to Use GraphQL

1. **Multiple Clients with Different Needs** - Mobile, web, and admin panels need different data
2. **Complex Relationships** - When REST endpoints become deeply nested
3. **Over-fetching is Expensive** - When bandwidth or processing costs matter
4. **Rapid Frontend Development** - When frontend teams need flexibility

### When to Stick with REST

1. **Simple CRUD APIs** - REST is simpler for basic operations
2. **Caching is Critical** - HTTP caching works better with REST
3. **Team Familiarity** - If your team doesn't know GraphQL
4. **Simple Data Models** - Not every API needs GraphQL's complexity

## Conclusion

<!-- 
TODO: Summarize with your personal recommendation
What's your takeaway? What should readers do next?
Include:
- Key points to remember
- Next steps for implementing GraphQL with Hot Chocolate
- Resources for further learning
-->

**Sample project:** [GitHub](https://github.com/animat089/graphql-sample){: .btn .btn--primary}

---

*Building with GraphQL? Share your experience!*
