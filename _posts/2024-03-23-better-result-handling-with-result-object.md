---
title: "Better result handling with Result<T>"
excerpt: >-
  "Exceptions shouldn't be used to control normal program flow. It can be challenging to follow the logic of a program that jumps from one exception handler to another, as opposed to one that follows a more straightforward, linear flow."
categories:
  - Technical
  - .NET
  - .NET-Core
tags:
  - C#
  - .NET
  - .NET-Core
author: animat089
last_modified_at: 2024-03-23
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Introduction

Exceptions should be rare...**Why?**...Throwing and catching exceptions **is slow** relative to other code flow patterns. Because of this, exceptions shouldn't be used to control normal program flow.**Also**...Code that relies heavily on exceptions for control flow can become **difficult to read and maintain** . It can be challenging to follow the logic of a program that jumps from one exception handler to another, as opposed to one that follows a more straightforward, linear flow.

**Also**...Improperly handled exceptions can lead to resource leaks. Exceptions are designed to **handle unexpected and rare events** . Using them for regular control flow, like handling business logic or validations, is generally considered a bad practice because it misrepresents the intention of the exception mechanism.

Even Microsoft has a recommendation:

- Do not use throwing or catching exceptions as a means of normal program flow, especially in hot code paths. 
- Do include logic in the app to detect and handle conditions that would cause an exception. 
- Do throw or catch exceptions for unusual or unexpected conditions.

In this article, we explain how you can minimize using exceptions, and change them for the **Result<T>** object in the normal flow of the application.

## Result Error Handling

### Handling errors with regular Exceptions

Let's consider a common business logic scenario: validating user input for a registration form. Initially, let's see how this might be done using exceptions:

```c#    
public class UserRegistration
{
    public void RegisterUser(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            throw new ArgumentException("Username and password are required.");
        }

        if (password.Length &lt; 8)
        {
            throw new ArgumentException("Password must be at least 8 characters long.");
        }

        // Proceed with registration
    }
}
```
In this approach, validation failures are treated as exceptions, which is not ideal for common scenarios like invalid input. They are best reserved for truly exceptional, unforeseen, and irregular situations.

For regular and predictable events like input validation, standard control flow mechanisms (like Result<T>) are more appropriate and efficient.

### Handling errors with Result<T> object

By using Result, you're ensuring that your code is handling expected scenarios (like invalid user input) in a more predictable and maintainable way, improving the overall quality and readability of your codebase.

```c#
public class UserRegistration
{
    public Result RegisterUser(string username, string password)
    {
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
        {
            return Result.Failure("Username and password are required.");
        }

        if (password.Length &lt; 8)
        {
            return Result.Failure("Password must be at least 8 characters long.");
        }

        // Proceed with registration
        return Result.Success();
    }
}
```

Here the flow is quite normal, we return values in relation to the code being executed instead of throwing an exception where it is not necessary. Result<T> does not come with any library (there are various libraries that already implement the Result object, like FluentResults) which means that we created it ourselves.

```c#
public class Result
{
    public bool IsSuccess { get; private set; }
    public bool IsFailure { get; private set; } => !IsSuccess
    public string ErrorMessage { get; private set; }

    protected Result(bool isSuccess, string errorMessage)
    {
        IsSuccess = isSuccess;
        ErrorMessage = errorMessage;
    }

    public static Result Success() => new Result(true, null);
    public static Result Failure(string message) => new Result(false, message);
}
```

- **Success/Failure Indicator** : At its core, a Result object contains a flag indicating whether the operation was successful. This is usually a boolean value.
- **Return Value** : In the case of success, the Result object can hold the resulting value of the operation. For instance, if the operation was to process a file, the Result might contain the processed data.
- **Error Message or Error Object:** In case of failure, the Result can hold an error message or an entire error object that provides more details about why the operation failed. This is more informative than a simple false or null return value.
- **Additional Metadata:** Depending on the implementation, a Result object can also contain additional metadata about the operation, like error codes, timestamps, or diagnostic information.

This is a better way to express the error. In this case, I don't like the fact that the magic string is used for errors. Here we can create a class (or record) that will display the error as a combination of error type and error description.

```c#
public record Error(string Type, string Description)
{
    public static readonly Error None = new(string.Empty, string.Empty);
}
```

And now for each of the failed validations we can create a separate Error object that will represent a unique error for that type of validation:

```c#
public static class RegistrationErrors
{
    public static readonly Error UsernameAndPasswordRequired = new Error(
        "Registration.UsernameAndPasswordRequired", "Username and password are required.");

    public static readonly Error PasswordTooShort = new Error(
        "Registration.PasswordTooShort", "Password must be at least 8 characters long.");
}
```

So, instead of an ordinary string, we can return a more structured value (this means that Error in the Result<T> object should be an Error type, and no longer a string):

```c#
    return Result.Failure(RegistrationErrors.PasswordTooShort);
```

The Result pattern clearly indicates that user input validation is a part of the normal flow and not an exceptional circumstance.

- **Easier Error Handling:** It guides the caller to handle both success and failure cases explicitly, making the code more robust.
- **Enhanced Performance:** Avoiding exceptions for regular control flow scenarios like input validation is more performance-efficient.
- **Flexibility and Extensibility:** The Result pattern can easily be extended or modified to include additional details about the failure or even success scenarios, without changing the method signature.

## Conclusion

We should reserve exceptions for truly unforeseen events. They are best suited for situations where the error is beyond your immediate handling capabilities. For everything else, the clarity and structure offered by the Result pattern are far more beneficial.

Embracing the Result class in your code allows you to:

- Clearly indicate that a method might not always succeed.
- Neatly wrap up an error occurring within your application.
- Offer a streamlined, functional approach to managing errors.

What's more, you can systematically catalog all the errors in your application using the Error class. This is incredibly useful, providing a clear guide on which errors to anticipate and handle.