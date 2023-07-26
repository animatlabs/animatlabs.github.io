---
title: "Simplify API Consumption in C# with Refit: A Type-Safe Approach for Efficient Development"
excerpt: >-
  "Discover how Refit, a powerful library for C#, simplifies API consumption by providing a type-safe and intuitive approach. Learn how Refit tackles common challenges such as manual HTTP request handling, serialization/deserialization, error handling, and type safety. Explore a code example that demonstrates Refit's usage in a practical scenario."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - API Consumption
  - Refit
  - RESTful APIs
  - Code Generation
  - Type-Safe Programming
  - Web Development
  - Maintainability
  - Serialization/Deserialization
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

API integration is a crucial aspect of modern software development. However, it often involves challenges such as handling HTTP requests, managing request/response serialization, and maintaining a testable codebase. In this blog post, we will delve into Refit, a powerful library for building type-safe HTTP clients, to understand how it simplifies API integration and promotes testability. We will explore the provided sample code and examine how Refit addresses common pain points.

**You can access the entire code from my** [GitHub Repo](https://github.com/animat089/playground/tree/main/Refit.ApiSdk){: .btn .btn--primary}

## Problem Statement

Integrating with APIs can be complex and error-prone. Developers frequently encounter difficulties when handling HTTP requests, managing serialization/deserialization, and ensuring code maintainability. Additionally, testability is a critical factor in software development, as it directly impacts code quality, reliability, and ease of maintenance.

- **Manual HTTP request handling:** Writing boilerplate code to handle making HTTP requests, including managing headers, query parameters, request bodies, and response handling.

- **Serialization/Deserialization:** Manually converting data between JSON or XML and C# objects, including handling complex types, nested objects, and arrays.

- **Error Handling:** Dealing with different HTTP status codes, error responses, and handling exceptions during API consumption.

- **Type Safety:** Ensuring that the API endpoints, request/response payloads, and data types are properly aligned and validated at compile-time.

- **Testing/Maintainability:** Refit addresses these challenges by providing a simple and elegant way to define strongly typed interfaces that describe the API endpoints, allowing developers to make API calls as if they were local method calls.

## Introduction to Refit

Refit is a robust library that significantly simplifies API integration by generating type-safe HTTP clients from interfaces. It abstracts away the intricacies of making HTTP requests, resulting in cleaner, more readable code with reduced boilerplate. With Refit, developers can benefit from compile-time safety, improved productivity, and enhanced code consistency.

Refit allows developers to define API interfaces using C# interfaces and then generates the implementation for these interfaces at runtime. It leverages the power of the `System.Net.Http.HttpClient` class and libraries like `Newtonsoft.Json` for serialization/deserialization.

With Refit, developers can:

- Define a REST API contract using an interface and decorate the methods with attributes to specify the HTTP method, route, and other parameters.

- Use the defined interface to create an instance of the API client, which handles the low-level HTTP request/response handling, serialization/deserialization, and error handling.

- Invoke the API methods as regular C# method calls, passing the required parameters and receiving strongly typed responses.

Now let's dive into an example codebase that demonstrates the usage of Refit for consuming a simple in-memory API for managing students.

## Example Code

To understand how Refit simplifies API integration and enhances code readability, let's examine the provided sample code. The code consists of an API controller, models, a Refit service interface, and a consumer. By analyzing each component, we can grasp how Refit streamlines API interactions.

### API Models

First, let's define the models associated with the API. In this case, we have an `EntityBase` abstract class representing common properties like `Id`, `CreatedOn`, and `UpdatedOn`. The `Student` class inherits from `EntityBase` and adds properties for `FirstName`, `MiddleName`, and `LastName`.

```csharp
namespace AnimatLabs.Api.Models;

/// <summary>
/// Base entity class with common properties
/// </summary>
public abstract class EntityBase
{
    public Guid Id { get; set; }
    public DateTimeOffset CreatedOn { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? UpdatedOn { get; set; }
}

/// <summary>
/// Student model inheriting from EntityBase
/// </summary>
public class Student : EntityBase
{
    public string FirstName { get; set; } = string.Empty;
    public string? MiddleName { get; set; }
    public string LastName { get; set; } = string.Empty;
}
```

### API Contract

Now, we will setup the API Contract for the operations to be performed by the API. In this demo, we are planning to make a crud based application, therefore the contract would look like the following:

```csharp
namespace AnimatLabs.Api.Contracts;

/// <summary>
/// Interface for the CRUD operations
/// </summary>
/// <typeparam name="T">Type of the entity for CRUD operations</typeparam>
public interface ICrudOperations<T>
{
    Task<IEnumerable<T>> GetAllAsync();

    Task<T> GetAsync(Guid id);

    Task<Guid?> CreateAsync(T entity);

    Task<bool> UpdateAsync(Guid id, T entity);

    Task<bool> DeleteAsync(Guid id);
}
```

### API Controller

Next, we'll create an in-memory API controller called `StudentsController` that implements the CRUD operations for the Student model. The controller derives from `ControllerBase` and implements the `ICrudOperations<Student>` interface. It uses a static list to store the student data for the purpose of the demo.

```csharp
using AnimatLabs.Api.Contracts;
using AnimatLabs.Api.Models;
using Microsoft.AspNetCore.Mvc;

namespace AnimatLabs.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class StudentsController : ControllerBase, ICrudOperations<Student>
{
    private static List<Student> _students = new List<Student>();

    [HttpGet]
    public async Task<IEnumerable<Student>> GetAllAsync()
    {
        return _students.AsEnumerable();
    }

    [HttpGet("{id}")]
    public async Task<Student?> GetAsync(Guid id)
    {
        return _students.FirstOrDefault(student => student.Id == id);
    }

    [HttpPost]
    public async Task<Guid?> CreateAsync([FromBody] Student student)
    {
        if (student != null)
            _students.Add(student);

        return student?.Id;
    }

    [HttpPost("{id}")]
    public async Task<bool> UpdateAsync(Guid id, [FromBody] Student student)
    {
        var index = _students.FindIndex(s => s.Id == id);

        if (index >= 0)
        {
            _students[index] = student;
            return true;
        }

        return false;
    }

    [HttpDelete("{id}")]
    public async Task<bool> DeleteAsync(Guid id)
    {
        return _students.Remove(_students.FirstOrDefault(s => s.Id == id));
    }
}
```

### Refit Service Interface

We will now define a Refit service interface called `IStudentsService` that maps to the API endpoints defined in the `StudentsController`. Each method in the interface is decorated with attributes specifying the HTTP method, route, and request/response types.

```csharp
using AnimatLabs.Api.Models;
using Refit;

namespace AnimatLabs.Api.Sdk;

/// <summary>
/// Refit service interface
/// </summary>
public interface IStudentsService
{
    [Get("/students")]
    Task<ApiResponse<IEnumerable<Student>>> GetAllAsync();

    [Get("/students/{id}")]
    Task<ApiResponse<Student?>> GetAsync(Guid id);

    [Post("/students")]
    Task<ApiResponse<Guid?>> CreateAsync([Body] Student entity);

    [Post("/students/{id}")]
    Task<ApiResponse<bool>> UpdateAsync(Guid id, [Body] Student entity);

    [Delete("/students/{id}")]
    Task<ApiResponse<bool>> DeleteAsync(Guid id);
}
```

### API Consumer

We will create a consumer class called `StudentsServiceConsumer` that encapsulates the interaction with the API using the Refit service interface. It provides methods for reading all students, creating a new student, reading a student by ID, updating a student, and deleting a student.

```csharp
using AnimatLabs.Api.Models;
using AnimatLabs.Api.Sdk;

namespace AnimatLabs.Api.Consumer;

public class StudentsServiceConsumer
{
    private readonly IStudentsService _studentsService;

    public StudentsServiceConsumer(IStudentsService studentsService)
    {
        _studentsService = studentsService;
    }

    public async Task<IEnumerable<Student>?> ReadAllStudents()
    {
        var response = await _studentsService.GetAllAsync().ConfigureAwait(false);
        return response.Content?.ToList();
    }

    public async Task<Guid?> CreateStudent(Student student)
    {
        var response = await _studentsService.CreateAsync(student).ConfigureAwait(false);
        return response.Content;
    }

    public async Task<Student?> ReadStudent(Guid id)
    {
        var response = await _studentsService.GetAsync(id).ConfigureAwait(false);
        return response.Content;
    }

    public async Task<bool> UpdateStudent(Guid id, Student student)
    {
        var response = await _studentsService.UpdateAsync(id, student).ConfigureAwait(false);
        return response.Content;
    }

    public async Task<bool> DeleteStudent(Guid id)
    {
        var response = await _studentsService.DeleteAsync(id).ConfigureAwait(false);
        return response.Content;
    }
}
```

### Promoting Testability with Refit

Testability is a critical aspect of software development, and Refit provides features that promote testability within the codebase. By utilizing Refit, developers can ensure that their API integration code remains testable, leading to improved reliability and maintainability. Let's delve into how Refit enhances testability in the provided sample code.

- Separation of Concerns: The codebase demonstrates a clear separation of concerns by utilizing interfaces and dependency injection. This separation allows for easy unit testing of individual components, such as the `StudentsService` class.
- Mocking and Testing API Interactions: Refit simplifies the process of mocking and testing API interactions by providing an abstraction over the underlying HTTP requests. Developers can easily create mock instances of the Refit-generated interface (`IStudentsService`) to simulate API responses and test the logic of their code without making actual network requests.
- Unit Testing the `StudentsService` Class: Developers can write unit tests for the `StudentsService` class, ensuring that the API integration logic behaves as expected. For example, using popular testing frameworks like xUnit or NUnit, developers can mock the `IStudentsService` interface and test methods such as `ReadAllStudents`, `CreateStudent`, `ReadStudent`, `UpdateStudent`, and `DeleteStudent`.

```csharp
using AnimatLabs.Api.Models;
using AnimatLabs.Api.Sdk;
using Moq;
using Refit;

namespace AnimatLabs.Api.Consumer.Tests;

public class StudentsServiceConsumerTests
{
    private readonly Mock<IStudentsService> _mockStudentsService;
    private readonly StudentsServiceConsumer _studentsServiceConsumer;
    private readonly RefitSettings _refitSettings;

    public StudentsServiceConsumerTests()
    {
        _refitSettings = new RefitSettings();
        _mockStudentsService = new Mock<IStudentsService>();
        _studentsServiceConsumer = new StudentsServiceConsumer(_mockStudentsService.Object);
    }

    [Fact]
    public async Task ReadAllStudents_ShouldReturnAllStudents()
    {
        // Arrange
        var expectedStudents = new List<Student> { new Student(), new Student() };
        var expectedResponse = new ApiResponse<IEnumerable<Student>>(
                new HttpResponseMessage()
                {
                    Content = new StringContent(string.Empty),
                    StatusCode = System.Net.HttpStatusCode.OK
                },
                expectedStudents,
                _refitSettings);
        _mockStudentsService.Setup(s => s.GetAllAsync()).ReturnsAsync(expectedResponse);

        // Act
        var students = await _studentsServiceConsumer.ReadAllStudents();

        // Assert
        Assert.Equal(expectedStudents, students);
    }

    [Fact]
    public async Task ReadStudent_ShouldReturnStudentById()
    {
        // Arrange
        var id = Guid.NewGuid();
        var expectedStudent = new Student { Id = id, FirstName = "John", LastName = "Doe" };
        var expectedResponse = new ApiResponse<Student>(
            new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(string.Empty)
            },
            expectedStudent,
            _refitSettings);
        _mockStudentsService.Setup(s => s.GetAsync(id)).ReturnsAsync(expectedResponse);

        // Act
        var student = await _studentsServiceConsumer.ReadStudent(id);

        // Assert
        Assert.Equal(expectedStudent, student);
    }

    [Fact]
    public async Task UpdateStudent_ShouldUpdateExistingStudent()
    {
        // Arrange
        var id = Guid.NewGuid();
        var student = new Student { Id = id, FirstName = "John", LastName = "Doe" };
        var expectedResponse = new ApiResponse<bool>(
        new HttpResponseMessage(System.Net.HttpStatusCode.OK)
        {
            Content = new StringContent(string.Empty)
        },
        true,
        _refitSettings);
        _mockStudentsService.Setup(s => s.UpdateAsync(id, student)).ReturnsAsync(expectedResponse);

        // Act
        var isUpdated = await _studentsServiceConsumer.UpdateStudent(id, student);

        // Assert
        Assert.True(isUpdated);
    }

    [Fact]
    public async Task DeleteStudent_ShouldDeleteExistingStudent()
    {
        // Arrange
        var id = Guid.NewGuid();
        var expectedResponse = new ApiResponse<bool>(
            new HttpResponseMessage(System.Net.HttpStatusCode.OK)
            {
                Content = new StringContent(string.Empty)
            },
            true,
            _refitSettings);
        _mockStudentsService.Setup(s => s.DeleteAsync(id)).ReturnsAsync(expectedResponse);

        // Act
        var isDeleted = await _studentsServiceConsumer.DeleteStudent(id);

        // Assert
        Assert.True(isDeleted);
    }
}
```

### Driver Console Application

Finally, we can create a console application that utilizes the `StudentsServiceConsumer` to interact with the API. The application displays a menu of options for reading all students, creating a student, reading a student by ID, updating a student, deleting a student, and exiting the program.

```csharp
using AnimatLabs.Api.Consumer;
using AnimatLabs.Api.Models;
using AnimatLabs.Api.Sdk;
using Refit;
using System.Diagnostics.CodeAnalysis;

[ExcludeFromCodeCoverage]
internal class Program
{
    private static async Task Main(string[] args)
    {
        var serviceClient = RestService.For<IStudentsService>("https://localhost:7128/api/");
        var studentsService = new StudentsServiceConsumer(serviceClient);
        bool exit = false;

        while (!exit)
        {
            DisplayMenu();
            int choice = GetMenuChoice();

            switch (choice)
            {
                case 1:
                    await ReadAllStudents(studentsService);
                    break;

                case 2:
                    await CreateStudent(studentsService);
                    break;

                case 3:
                    await ReadStudent(studentsService);
                    break;

                case 4:
                    await UpdateStudent(studentsService);
                    break;

                case 5:
                    await DeleteStudent(studentsService);
                    break;

                case 6:
                    exit = true;
                    break;

                default:
                    Console.WriteLine("Invalid choice. Try again.");
                    break;
            }

            Console.WriteLine();
        }
    }

    private static void DisplayMenu()
    {
        Console.WriteLine("Student Menu");
        Console.WriteLine("1. Read All Students");
        Console.WriteLine("2. Create Student");
        Console.WriteLine("3. Read Student");
        Console.WriteLine("4. Update Student");
        Console.WriteLine("5. Delete Student");
        Console.WriteLine("6. Exit");
        Console.Write("Enter your choice: ");
    }

    private static int GetMenuChoice()
    {
        int choice;
        while (!int.TryParse(Console.ReadLine(), out choice))
        {
            Console.WriteLine("Invalid input. Please enter a valid number.");
        }

        return choice;
    }

    private static async Task ReadAllStudents(StudentsServiceConsumer studentsService)
    {
        var students = await studentsService.ReadAllStudents();
        if (students != null)
        {
            foreach (var student in students)
            {
                Console.WriteLine($"{student.Id} - {student.FirstName} {student.LastName}");
            }
        }
        else
        {
            Console.WriteLine("No students found.");
        }
    }

    private static async Task CreateStudent(StudentsServiceConsumer studentsService)
    {
        Console.Write("Enter the first name: ");
        var firstName = Console.ReadLine();
        Console.Write("Enter the last name: ");
        var lastName = Console.ReadLine();
        var newStudent = new Student { Id = Guid.NewGuid(), FirstName = firstName, LastName = lastName };
        var createdId = await studentsService.CreateStudent(newStudent);
        Console.WriteLine($"New student created with ID: {createdId}");
    }

    private static async Task ReadStudent(StudentsServiceConsumer studentsService)
    {
        Console.Write("Enter the student ID: ");
        if (Guid.TryParse(Console.ReadLine(), out Guid id))
        {
            var student = await studentsService.ReadStudent(id);
            if (student != null)
            {
                Console.WriteLine($"Student ID: {student.Id}");
                Console.WriteLine($"First Name: {student.FirstName}");
                Console.WriteLine($"Last Name: {student.LastName}");
            }
            else
            {
                Console.WriteLine("Student not found.");
            }
        }
        else
        {
            Console.WriteLine("Invalid student ID.");
        }
    }

    private static async Task UpdateStudent(StudentsServiceConsumer studentsService)
    {
        Console.Write("Enter the student ID to update: ");
        if (Guid.TryParse(Console.ReadLine(), out Guid updateId))
        {
            var updatedStudent = await studentsService.ReadStudent(updateId);
            if (updatedStudent != null)
            {
                Console.Write("Enter the new first name: ");
                updatedStudent.FirstName = Console.ReadLine();
                Console.Write("Enter the new last name: ");
                updatedStudent.LastName = Console.ReadLine();
                var isUpdated = await studentsService.UpdateStudent(updateId, updatedStudent);
                if (isUpdated)
                {
                    Console.WriteLine("Student updated successfully.");
                }
                else
                {
                    Console.WriteLine("Failed to update student.");
                }
            }
            else
            {
                Console.WriteLine("Student not found.");
            }
        }
        else
        {
            Console.WriteLine("Invalid student ID.");
        }
    }

    private static async Task DeleteStudent(StudentsServiceConsumer studentsService)
    {
        Console.Write("Enter the student ID to delete: ");
        if (Guid.TryParse(Console.ReadLine(), out Guid deleteId))
        {
            var isDeleted = await studentsService.DeleteStudent(deleteId);
            if (isDeleted)
            {
                Console.WriteLine("Student deleted successfully.");
            }
            else
            {
                Console.WriteLine("Failed to delete student.");
            }
        }
        else
        {
            Console.WriteLine("Invalid student ID.");
        }
    }
}
```

## Conclusion

Refit simplifies the process of consuming web APIs in C# by providing a type-safe and intuitive approach. It addresses common challenges such as manual HTTP request handling, serialization/deserialization, error handling, and type safety. By defining API contracts with interfaces and utilizing Refit, developers can focus on writing clean and readable code without sacrificing flexibility and maintainability.

In our example codebase, we demonstrated how to define API models, create an API controller, use the Refit service interface, and consume the API using a consumer class. The code showcases the elegance and simplicity that Refit brings to API consumption.

Additionally, the codebase is designed to be testable. By utilizing interfaces and dependency injection, we can easily mock the API service and write unit tests for the consumer class. This allows for comprehensive testing of the application logic, ensuring the expected behavior of the API consumer.

Refit is a powerful library that significantly reduces the boilerplate code associated with API consumption, leading to cleaner, more maintainable code. Whether you're working on small projects or large-scale applications, Refit can be a valuable tool in your C# development toolbox.

I hope this article provides a comprehensive overview of Refit and demonstrates its usage in a practical scenario. Feel free to explore Refit further and experiment with its capabilities to enhance your API consumption experience in C#. Happy Coding!! :)
