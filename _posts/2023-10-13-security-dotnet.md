---
title: "ASP.NET Core Security Guide: Authentication, Encryption, and Secure Coding"
excerpt: >-
  A practical guide to .NET security covering authentication, authorization, encryption, input validation, and secure coding with code samples.
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
  - Security
author: animat089
last_modified_at: 2023-10-13
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

Security is one of those topics that nobody prioritizes until something breaks. I've seen production systems with plain-text connection strings in config files and admin endpoints behind nothing but a query parameter. This guide walks through the areas that matter most in ASP.NET Core, with code you can actually drop into a project.

## Authentication and Authorization

Authentication answers "who are you?" and authorization answers "what are you allowed to do?" ASP.NET Core Identity handles both. You wire it up in `Program.cs` (or `Startup.cs` if you're on the older hosting model), and from there you can layer in role checks or policy-based authorization depending on how granular you need to get.

```csharp
// Setting up Identity in ASP.NET Core
services.AddIdentity<ApplicationUser, IdentityRole>()
    .AddEntityFrameworkStores<ApplicationDbContext>()
    .AddDefaultTokenProviders();

// Custom claims-based authorization
[Authorize(Policy = "AdminOnly")]
public IActionResult AdminDashboard()
{
    // Access restricted to users with the "AdminOnly" policy
}
```

## Input Validation

Every external input is suspect. Form fields, query strings, headers, uploaded file names. Trusting any of them without validation is how SQL injection and XSS happen. Data annotations handle the simple cases; FluentValidation gives you more control when rules get complex.

```csharp
// Using data annotations for input validation
[Required]
[RegularExpression(@"^\d{5}(-\d{4})?$")]
public string PostalCode { get; set; }

// Using FluentValidation
public class ProductValidator : AbstractValidator<Product>
{
    public ProductValidator()
    {
        RuleFor(p => p.Name).NotEmpty();
        RuleFor(p => p.Price).GreaterThan(0);
    }
}
```

## Cross-Site Request Forgery (CSRF) Protection

CSRF tricks a logged-in user's browser into making requests they didn't intend. The classic example: a hidden form on an attacker's page that submits a POST to your app while the victim's session cookie is still valid. ASP.NET Core has built-in anti-forgery token support. You generate the token in the form and validate it on the server side.

```csharp
// Generating anti-forgery tokens
@Html.AntiForgeryToken()

// Validating anti-forgery tokens in a POST action
[HttpPost]
[ValidateAntiForgeryToken]
public IActionResult SubmitOrder(Order order)
{
    // Token is automatically validated by ASP.NET Core
}
```

## SQL Injection Prevention

SQL injection has been in the OWASP Top 10 for over two decades and it still shows up in production code. The fix is simple: never concatenate user input into a query string. Use parameterized queries or let EF Core handle it. Both approaches ensure the database treats input as data, not executable SQL.

```csharp
// Using parameterized queries
var query = "SELECT * FROM Users WHERE Username = @Username";
using var cmd = new SqlCommand(query, connection);
cmd.Parameters.AddWithValue("@Username", inputUsername);

// Using Entity Framework Core to avoid SQL injection
var users = dbContext.Users.FromSqlRaw("SELECT * FROM Users WHERE Username = {0}", inputUsername).ToList();
```

## Cross-Site Scripting (XSS) Mitigation

XSS is the mirror image of SQL injection, but for HTML. An attacker injects a script that runs in another user's browser. The defense has two layers: encode all dynamic output so the browser treats it as text, and add a Content Security Policy to limit where scripts can load from.

```csharp
// Output encoding in Razor Views
@Html.Raw(Model.Description)
@Html.Encode(Model.Description)

// Content Security Policy (CSP) configuration in ASP.NET Core
app.UseCsp(options => options
    .DefaultSources(s => s.Self())
    .ScriptSources(s => s.Self().CustomSources("https://cdn.example.com")));
```

## Secure Password Storage

Storing passwords in plain text is an obvious no. But MD5 or SHA-256 without salting isn't much better. BCrypt (or Argon2, if you want the newer option) handles hashing and salting in one call. On top of that, ASP.NET Core Identity lets you enforce password policies so users can't set "password123" and call it a day.

```csharp
// Hashing and salting passwords using BCrypt
string hashedPassword = BCrypt.Net.BCrypt.HashPassword(password, BCrypt.Net.BCrypt.GenerateSalt());

// Enforcing password policies in ASP.NET Core Identity
services.Configure<IdentityOptions>(options =>
{
    options.Password.RequireUppercase = true;
    options.Password.RequiredLength = 8;
});
```

## HTTPS and Data Encryption

Data in transit needs TLS. Data at rest needs encryption. ASP.NET Core pushes you toward HTTPS by default with HSTS (HTTP Strict Transport Security) in production. For the database side, most engines support transparent data encryption. Both together mean even if someone intercepts traffic or copies disk files, the data is useless without the keys.

```csharp
// Configuring HTTPS in ASP.NET Core
public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
{
    if (env.IsDevelopment())
    {
        app.UseDeveloperExceptionPage();
    }
    else
    {
        app.UseHsts();
    }
}

// Database-level encryption with SQL Server Transparent Data Encryption
ALTER DATABASE YourDatabaseName SET ENCRYPTION ON;
```

## API Security

APIs need their own security layer since there's no browser session or cookie jar to fall back on. JWT (JSON Web Tokens) is the standard approach. The client sends a token in the `Authorization` header, and the server validates it on every request. You configure the expected issuer, audience, and signing key; anything that doesn't match gets rejected.

```csharp
// Token-based authentication with JWT in ASP.NET Core
services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = "yourissuer",
            ValidAudience = "youraudience",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes("yoursecretkey"))
        };
    });
```

## Logging and Monitoring

You can have perfect input validation and still get compromised if nobody is watching the logs. Serilog gives you structured logging that's easy to query, and Application Insights (or any APM tool) gives you the dashboards and alerts. The key rule: log the event, not the sensitive data. No passwords, tokens, or PII in log output.

```csharp
// Setting up Serilog in ASP.NET Core
public static IHostBuilder CreateHostBuilder(string[] args) =>
    Host.CreateDefaultBuilder(args)
        .ConfigureWebHostDefaults(webBuilder =>
        {
            webBuilder.UseStartup<Startup>()
                .UseSerilog();
        });

// Integrating Application Insights for monitoring
public void ConfigureServices(IServiceCollection services)
{
    services.AddApplicationInsightsTelemetry(Configuration["ApplicationInsights:InstrumentationKey"]);
}
```

## Security Is Never Done

None of this is "set and forget." Packages get CVEs, authentication standards evolve, and attackers find new angles. Run `dotnet list package --vulnerable` regularly. Review OWASP updates. Audit your dependencies. The patterns in this guide cover the fundamentals, but the real work is keeping them current as your project grows.

---

## More on This Topic

- [Data Protection APIs](/technical/.net/.net-core/data-protection-apis/)
- [Hashing internal IDs](/technical/.net/.net-core/secure-alternate-to-exposing-identifiers/)