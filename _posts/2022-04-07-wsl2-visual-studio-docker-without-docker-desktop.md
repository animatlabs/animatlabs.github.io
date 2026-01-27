---
title: "WSL2: Running containerized solutions on Visual Studio without Docker Desktop"
excerpt: >-
  "Setting up docker on WSL2 and integrating it with Visual Studio to run and debug the containerized applications"
categories:
  - Technical
  - Infra
  - WSL2
tags:
  - Windows Subsystem for Linux
  - WSL2
  - Linux on Windows
  - Visual Studio 2022
  - Docker Integration
  - Docker Desktop
author: animat089
last_modified_at: 2022-04-07
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Introduction

With the advent of containerization, Docker and Docker Desktop came in and provided GUI-based simple solutions for most of the problems that a developer would face in setting up a local development environment. But with the news that broke out last year (2021) that Docker Desktop will no longer be free for an Enterprise setup, although it is still free for personal use.

Therefore, looking out for alternate strategies as of right now, in this article we would be looking forward to setup Visual Studio with WSL2. So, that we could leverage the same without Docker Desktop in Visual Studio 2022 on a Windows machine.

**Note:** If you have not set up WSL, you can [refer to this article](../wsl2-installation-windows/) for setting it up before we continue.

## Configuration

Over here we are going to leverage the caveat that only Docker Desktop needs a license to be used in a commercial setup and not the actual docker services which we will be hosting in our WSL setup. Noting, that it was always possible in Docker Desktop to integrate it with WSL but we generally never choose to do so! So, let's begin with configuring docker in our WSL2 setup on Ubuntu.

### Configure Docker

1. Update the apt package index and install packages:

    ```bash
    sudo apt-get update && \
    sudo apt-get install ca-certificates curl gnupg lsb-release -y
    ```

2. Add Docker’s official GPG key:

    ```bash
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    ```

3. Set up Docker's stable repository

    ```bash
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu \
    $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    ```

4. Install Docker Engine and packages that go along with it

    ```bash
    sudo apt-get update && /
    sudo apt-get install docker-ce docker-ce-cli containerd.io -y
    ```

5. Start the docker service

    ```bash
    sudo service docker start
    ```
    
    If by any chance you are happen to install `Ubuntu 22.04` or above, you will notice that even after running the above command the service would not start, the reason being the OS uses `iptables-nft` by default. Therefore, to fix it you would have to switch to `iptables-legacy` and to do so follow the following:

    ```bash
    sudo update-alternatives --config iptables
    ```

    The above command would list the list of iptables available, select `1` and hit enter to continue. Repeat step 5 of starting the service and move further.

    {% include figure image_path="/assets/images/posts/2022-04-07/Ubuntu22-04-issue.jpg" alt="Selecting iptables" caption="Selecting iptables" %}

6. Verify that Docker is installed correctly
  
    ```bash
    sudo docker run hello-world
    ```

### Configure .NET 6.0

To be able to run and build the services on docker, we need to install dotnet on WSL setup of Ubuntu as well. First, we would need to check on the [official provider](https://docs.microsoft.com/en-us/dotnet/core/install/linux-ubuntu), if the version of dotnet we wish to install is supported on the version on Ubuntu we have installed. Here, we use Ubuntu 20.04 which is supported, therefore continuing...

1. Add the Microsoft package signing key to your list of trusted keys and add the package repository.
  
    ```bash
    wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb -O packages-microsoft-prod.deb && \
    sudo dpkg -i packages-microsoft-prod.deb && \
    rm packages-microsoft-prod.deb
    ```

2. Install the SDK - The .NET SDK allows you to develop apps with .NET. If you install the .NET SDK, you don't need to install the corresponding runtime.
  
    ```bash
    sudo apt-get update; \
    sudo apt-get install -y apt-transport-https && \
    sudo apt-get update && \
    sudo apt-get install -y dotnet-sdk-6.0
    ```

3. Install the runtime - The ASP.NET Core Runtime allows you to run apps that were made with .NET that didn't provide the runtime. The following commands install the ASP.NET Core Runtime, which is the most compatible runtime for .NET.

    ```bash
    sudo apt-get update; \
    sudo apt-get install -y apt-transport-https && \
    sudo apt-get update && \
    sudo apt-get install -y aspnetcore-runtime-6.0
    ```

    As an alternative to the ASP.NET Core Runtime, you can install the .NET Runtime, which doesn't include ASP.NET Core support: replace aspnetcore-runtime-6.0 in the previous command with dotnet-runtime-6.0:

    ```bash
    sudo apt-get install -y dotnet-runtime-6.0
    ```

4. Verify .NET installed successfully - Running the following command should tell you the version of .NET installed on the machine.

    ```bash
    dotnet --version
    ```

### Configuring Visual Studio 2022

1. Now, let's set up Visual Studio 2022 and build our sample Hello-World Console App With Visual Studio. It is the template console app created by Visual Studio.

    {% include figure image_path="/assets/images/posts/2022-04-07/ProjectSetup.jpg" alt="Console App Setup" caption="Console App Setup" %}

2. Add Docker Support - This creates the Dockerfile automatically in the solution
    
    {% include figure image_path="/assets/images/posts/2022-04-07/AddDockerSupport.jpg" alt="Add Docker Support" caption="Add Docker Support" %}

    For simplicity, we are using the generic docker file that is created by Visual Studio itself:

    ```yml
    FROM mcr.microsoft.com/dotnet/runtime:6.0 AS base
    WORKDIR /app

    FROM mcr.microsoft.com/dotnet/sdk:6.0 AS build
    WORKDIR /src
    COPY ["ContainerizedSolution/ContainerizedSolution.csproj", "ContainerizedSolution/"]
    RUN dotnet restore "ContainerizedSolution/ContainerizedSolution.csproj"
    COPY . .
    WORKDIR "/src/ContainerizedSolution"
    RUN dotnet build "ContainerizedSolution.csproj" -c Release -o /app/build

    FROM build AS publish
    RUN dotnet publish "ContainerizedSolution.csproj" -c Release -o /app/publish

    FROM base AS final
    WORKDIR /app
    COPY --from=publish /app/publish .
    ENTRYPOINT ["dotnet", "ContainerizedSolution.dll"]
    ```

3. Select WSL to run the application - Visual Studio 2022 automatically detects WSL setup on your machine

    {% include figure image_path="/assets/images/posts/2022-04-07/SelectWSL.jpg" alt="Run with WSL" caption="Run with WSL" %}

4. Run the application - The sample application is run and we can see the result in the output window
  
    {% include figure image_path="/assets/images/posts/2022-04-07/SuccessfulRun.jpg" alt="Successful Run" caption="Successful Run" %}

Now, we have successfully set up WSL2 and can run containerized solutions via visual studio directly over there. _**Happy containerizing without Docker Desktop on Windows!!**_
