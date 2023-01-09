---
title: "EF Core: Managing Custom SQLs, SPs, and UDFs with migrations"
excerpt: >-
  "Managing the custom SQL statements, stored procedures, and user-defined functions with migrations"
categories:
  - Technical
  - .NET
  - EF-Core
tags:
  - C#
  - .NET
  - EF Core
  - Code First Migrations
  - Stored Procedure
  - User Defined Function
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

When we think of Entity Framework, we think of queries in the form of a  C# Code rather than direct queries or in the form of UDFs (user-defined functions) or SPs (stored procedures). Though in a commercial setup, it might not always be possible to get away with the C# code due to business or technical (performance, client set-up, fixing migrations) reasons. Therefore, in this article, we will be exploring how we can handle those gracefully.

Given that we have already discussed earlier, how to [set up an EF Core project](../ef-core-managing-configurations-migrations/) and manage configurations and migrations on the same. I would be extending on the same example, so request you to (re)visit the previous article, before we continue.

## Objectives

The objectives of the article are to provide for direction to manage the following with the migrations:

- Custom SQL queries
- SPs & UDFs

## Implementation

Again, keeping things to the left and early feedback in the picture, deployments should get performed by CI/CD before the application is deployed instead of when the (first or each) call to the database is made. With this, we will be looking forward to extending the code that we developed with the previous article.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/ef_core){: .btn .btn--primary}

### Solution & Project Structure

Since we are extending the application which we had developed earlier, here we would be extending the same focusing more on the custom SQL, SPs and UDFs. You can refer to the structure [here](../ef-core-managing-configurations-migrations/#solution-structure)

#### Custom SQL

As discussed earlier, we might have to include raw custom scripts in the migrations because of several reasons:

- Custom migration queries and/or scripts
- Data backup/migration fixes, are required before/after the migrations
- Pre/post deployment scripts

EF Core does provide us with a way to include raw SQL within the migrations. To do so, we would have to do so in the migration files. Again, there could be a couple of possible ways to include the scripts in the migrations.

- Using direct SQL
- Using the SQL from a file

Therefore, setting up a simple code to demonstrate how the scripts would be added, other examples with reading from a file would follow. For now, we are first creating a new migration file, in the development profile.

```PowerShell
dotnet ef migrations add dev.1.0.2 -p src/Infrastructure.Data.DataSetup.Development
```

The above command creates an empty migration file with 1.0.2 followed by which we are trying to add a very simple custom SQL to the migration with the `Sql` method on the `migrationBuilder` object. Additionally, we could move the script to an SQL file as well therefore, to keep things simple, we prefer keeping the name of the script and the migration this makes the scripts easy to track and manage. For that purpose, we include a file as well here, which has the content as follows:

> Although the scripts could all be placed in a single location where we could load those while running the migrations but We prefer to keep the files maintained closer to the migrations. First, The scripts might be tightly coupled with the changes made in the migrations rather than a general change and secondly, reverting and tracking the changes might get very difficult if we go the other way round.

```sql
SELECT @@LANGUAGE as 'DefaultLanguage'
SELECT @@MAX_CONNECTIONS as 'MaxConnections'
```

{% include figure image_path="/assets/images/posts/2022-09-03/Migration_Scripts.png" alt="Sql files for migrations" caption="Sql File Naming for Migrations" %}

> On a general thing, we would be executing any script we read from a file via an `EXEC` command, this allows us the flexibility and additionally, we are going to replace the `'` in the application with the `''` to be able to run the queries via C#.

```cs
private readonly string filePath = Path.Combine("Migrations", "20221005112853_dev1.0.2");

protected override void Up(MigrationBuilder migrationBuilder)
{
    var fileName = $"{filePath}.sql";
    migrationBuilder.Sql("SELECT @@VERSION as 'Version'");
    migrationBuilder.Sql($"EXEC(N'{File.ReadAllText(fileName).Replace("'", "''")}')");
}

protected override void Down(MigrationBuilder migrationBuilder)
{
}
```

Now, since the code is all done we could just generate the scripts and get the setup completed, with the following command:

```PowerShell
dotnet ef migrations script dev.1.0.1 dev.1.0.2 -i -p src/Infrastructure.Data.DataSetup.Development -o src/Infrastructure.Data.DataSetup.Development/Scripts/Up/dev.1.0.1-dev.1.0.2.sql
```

The SQL scripts generated with the above command would look something like the following:

```sql
BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005112853_dev1.0.2')
BEGIN
    SELECT @@VERSION as 'Version'
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005112853_dev1.0.2')
BEGIN
    EXEC(N'SELECT @@LANGUAGE as ''DefaultLanguage''
    SELECT @@MAX_CONNECTIONS as ''MaxConnections''')
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005112853_dev1.0.2')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20221005112853_dev1.0.2', N'6.0.9');
END;
GO

COMMIT;
GO
```

Voila! The migrations and scripts are in... Though a point to note here, any query that we did add to the up/down scripts will get added to a section within a separate `IF` clause as we had used the `-i` flag to generate the script.

#### SPs & UDFs

This technique works great till the time we do not have the various sessions in the script separated by a `GO` statement or we do not create SPs/UDFs. Therefore, extending this further to be able to handle the same using the very same strategy but with a small twist. But before we do so, trying to understand the issue, creating a new migration 1.0.4 on the development scripts and creating a new set of SQL files for housing the SPs/UDFs.

> We would try to create SQL files in such a way that we create both Up and Down scripts so that even if we are ever moving back in the timeline, then we can restore the database including the scripts.

Creating both Up and down scripts separately as we can see in the image above:

```sql
-- Up Script
CREATE OR ALTER PROCEDURE GetAllCourses
AS
BEGIN
    SELECT [C].*
    FROM dbo.Courses C
END
GO

CREATE OR ALTER PROCEDURE GetAllStudents
AS
BEGIN
    SELECT [S].*
    FROM dbo.Students S
END
GO
```

```sql
-- Down Script
DROP PROCEDURE GetAllCourses
GO

DROP PROCEDURE GetAllStudents
GO
```

Now, if we had to run it the very same way earlier and simply ahead and generate the scripts, it would look like the following:

The `C#` migration file:

```c#
private readonly string filePath = Path.Combine("Migrations", "20221005115753_dev1.0.3");

protected override void Up(MigrationBuilder migrationBuilder)
{
    var fileName = $"{filePath}_Up.sql";
    migrationBuilder.Sql($"EXEC(N'{File.ReadAllText(fileName).Replace("'", "''")}')");
}
```

The generated SQL file:

```sql
BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    EXEC(N'CREATE OR ALTER PROCEDURE GetAllCourses
    AS
    BEGIN
      SELECT [C].*
      FROM dbo.Courses C
    END
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    CREATE OR ALTER PROCEDURE GetAllStudents
    AS
    BEGIN
      SELECT [S].*
      FROM dbo.Students S
    END
    GO')
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20221005115753_dev1.0.3', N'6.0.9');
END;
GO

COMMIT;
GO
```

Did you notice something strange over here? EFCore migration builder automatically grabbed the sessions separated by the `GO` statements while reading the file and then tried to embed those within the `IF` clause but ended up in a mess creating a structure which is not valid itself.

Now, if you are thinking, we could have just removed the `EXEC` command and things would have worked then; it would have not as we would not be able to create SPs/UDFs within an `IF` clause as they need a session of their own.

After giving it some research (still on, to find a better way), came up with an extension which splits up the query at every `GO` statement and then feeds it to the migrations as separate SQL statements.

```cs
public static class MigrationBuilderExtensions
{
    public static void AddSqlFile(this MigrationBuilder migrationBuilder, string sqlFile)
    {
        var sqlContent = File.ReadAllText(sqlFile).Replace("'", "''");
        var sqlQueries = Regex.Split(sqlContent, @"\bGO\b").Select(sql => sql.Trim()).Where(sql => sql.Length > 0);
        foreach (var script in sqlQueries)
        {
            migrationBuilder.Sql($"EXEC(N'{script}')");
        }
    }
}
```

And now, based on this we change the migration to 1.0.3.

```cs
private readonly string filePath = Path.Combine("Migrations", "20221005115753_dev1.0.3");

protected override void Up(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddSqlFile($"{filePath}_Up.sql");
}

protected override void Down(MigrationBuilder migrationBuilder)
{
    migrationBuilder.AddSqlFile($"{filePath}_Down.sql");
}
```

This would render the scripts correctly, as follows:

```sql
BEGIN TRANSACTION;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    EXEC(N'CREATE OR ALTER PROCEDURE GetAllCourses
    AS
    BEGIN
      SELECT [C].*
      FROM dbo.Courses C
    END')
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    EXEC(N'CREATE OR ALTER PROCEDURE GetAllStudents
    AS
    BEGIN
      SELECT [S].*
      FROM dbo.Students S
    END')
END;
GO

IF NOT EXISTS(SELECT * FROM [__EFMigrationsHistory] WHERE [MigrationId] = N'20221005115753_dev1.0.3')
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20221005115753_dev1.0.3', N'6.0.9');
END;
GO

COMMIT;
GO
```

Finally, we can call the SPs in the code as well. Let's try out a simple case of getting all the courses available by both the ways, one by LINQ and other by an SP call like follows:

```c#
using var dbContext = new HogwartsDbContext(contextOptions);
{
    Console.WriteLine("All Courses from EF Model:");
    foreach (var course in dbContext.Courses)
        Console.WriteLine(course.Title);

    Console.WriteLine("All Courses from Stored Proc:");
    foreach (var course in dbContext.Courses.FromSqlRaw("GetAllCourses"))
        Console.WriteLine(course.Title);
}
```

## Conclusion

We have tried to look into how we include scripts, generate migrations and then execute those within the bounds of EF Core. In commercial projects, since as there are many cases where any of these conditions might be unavoidable. Hope this helps... :)