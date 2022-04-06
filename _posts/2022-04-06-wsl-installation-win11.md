---
title: "WSL: Linux in WSL2 on Windows"
excerpt: >-
  "Setting up Windows Subsystem for Linux (WSL) on Windows 10/11"
categories:
  - Technical
  - Infra
  - WSL2
tags:
  - Windows Subsystem for Linux
  - WSL2
  - Linux on Windows
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

## Introduction

Being associated with software development, we all have worked with a terminal at some in time. And what better than Linux when it comes to the that, the developer and community support, the speed and simplicity to name a few! But, if we work in a personal/commercial setup, we might just have access to a machine with Microsoft Windows on it. Thereby limiting the options, either install Ubuntu on dual-boot or setup a VM within the windows machine, but both have quite a few pros and cons and might or might not be feasible for everyone.

In the past, Microsoft brought in the support for Linux within Windows OS with Windows Subsystem for Linux (WSL). With this, a dual-boot where we lose access to elements of Windows environment or a VM that potentially uses way too many resources of your machine. In this article, we will be talking about setting up WSL with Windows 10/11 and setup a basic environment.

## Configuration

### WSL vs WSL2

As of right now, microsoft has already launched WSL2 which a major overhaul of the underlying architecture and uses virtualization technology and a Linux kernel to enable new features. The primary goals of this update are to increase file system performance and add full system call compatibility. For more details, refer to this [documentation](https://docs.microsoft.com/en-us/windows/wsl/compare-versions).

#### WSL

- **Minimum System Requirements**
  - Windows 10 version 1607 or above/Windows 11
  - Only 64-bit Windows 10/Windows 11 is supported

- **Required Windows Features**
  - Windows Subsystem for Linux

#### WSL2

- **Minimum System Requirements**
  - For x64 systems: Version 1903 or higher, with Build 18362 or higher.
  - For ARM64 systems: Version 2004 or higher, with Build 19041 or higher.
  - Builds lower than 18362 do not support WSL 2

- **Required Windows Features**
  - Windows Subsystem for Linux
  - Virtual Machine Platform

### Setup

For my setup, I would be using Windows 11 and setting the WSL2, you may choose to go with WSL based on your requirements and available environments.

1. **Enable Windows Features** - We can enable the windows features in 2 ways, either via CLI or GUI.
   - *Option 1* - Via Powershell CLI as Administrator

   ```ps
   > dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   > dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```

   - *Option 2* - Via GUI - Windows Features
   {% include figure image_path="/assets/images/posts/2022-04-06/WindowsFeatures.jpg" alt="Windows Features" caption="Windows Features" %}

   > You may have to restart you system after installing these for all configurations to be in place.

2. **Set WSL2 as default** - To enable WSL2 we need to open Powershell as Administrator and execute the following command.
   
   ```ps
   > wsl --set-default-version 2
   ```

3. **Checking WSL versions installed** - We can use the following command to check for the distros installed in WSL.
   
   ```ps
   > wsl -l
   ```

   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_FreshInstall.jpg" alt="WSL Fresh Installation" caption="WSL Fresh Installation" %}

4. **List Available Versions (Optional)** - WSL provides the user to install from the various flavours supported, if you wish to see the same you can list the same with the following command.

   ```ps
   > wsl --list --online
   ```
   
   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_AvailableDistros.jpg" alt="WSL Available Distros" caption="WSL Available Distros" %}

5. **Installing Ubuntu** - For the purpose of the demo, I would be setting up the latest version of Ubuntu, and am yet again going to use powershell for the same. We could also do this operation via GUI installing the Ubuntu app from the Windows App Store.

   ```ps
   > wsl --install -d Ubuntu
   ```
   
   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_Install.jpg" alt="WSL Installing Ubuntu" caption="WSL Installing Ubuntu" %}

   After this, we see another screen pop-up which is the actual Ubuntu machine asking for the required  configurations such as username and password. You basically get added to the list of sudoers by default and can run sudo commands using these credentials as well. Once you setup these, you would get the `$` prompt and _**Voila!! You are all setup and ready!!**_

   {% include figure image_path="/assets/images/posts/2022-04-06/Ubuntu_SetupComplete.jpg" alt="Ubuntu Setup Completed" caption="Ubuntu Setup Completed" %}

6. **Installing Windows Terminal (Optional)** - Although not required, but my personal preference is inclined towards using Windows Terminal, which can be installed via the App Store. It basically gives you the capability to work on multiple terminals in multiple tabs on a single application. Additionally, i can configure it to open Ubuntu as the default tab.

**Note:** When we open wsl, by default we login at our windows' user home location, whereas I prefer to use Linux users' home rather Windows user. Therefore, by making the following configuration in the settings section (Open by pressing `Ctrl+,` and selecting `Ubuntu` configuration) on the Windows Terminal, you can always open a new terminal directly at your Ubuntu Users's home. **Ex**: My user is `animesh` therefore the path i would be setting is `\\wsl$\Ubuntu\home\animesh`

{% include figure image_path="/assets/images/posts/2022-04-06/Ubuntu_HomeSetup.jpg" alt="Ubuntu Home Setup" caption="Ubuntu Home Setup" %}

*Now, we can enjoy all the goodness in the world of Linux in Windows itself...*
