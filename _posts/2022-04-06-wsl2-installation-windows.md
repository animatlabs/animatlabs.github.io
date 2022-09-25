---
title: "WSL2: Setting up Linux on Windows"
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

Being associated with software development, we all have worked with a terminal at some point in time. And what better than Linux when it comes to that, be it developer and community support, be it the speed or simplicity? But, if we work in a personal/commercial setup, we might just have access to a machine with Microsoft Windows on it. Thereby limiting the options, either installing Ubuntu on dual-boot or setup a VM within the windows machine, but both have quite a few pros and cons and might or might not be feasible for everyone.

In the past, Microsoft brought in support for Linux within Windows OS with Windows Subsystem for Linux (WSL). With this, a dual-boot where we lose access to elements of Windows environment or a VM that potentially uses way too many resources of your machine. In this article, we will be talking about setting up WSL with Windows 10/11 and setting up a basic environment.

## Configuration

### WSL vs WSL2

As of right now, Microsoft has already launched WSL2 which is a major overhaul of the underlying architecture and uses virtualization technology and a Linux kernel to enable new features. The primary goals of this update are to increase file system performance and add full system call compatibility. For more details, refer to this [documentation](https://docs.microsoft.com/en-us/windows/wsl/compare-versions).

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

1. **Enable Windows Features** - We can enable the windows features in 2 ways, either via CLI or GUI. You _**may have to restart your system**_ after installing these for all configurations to be in place.

   - *Option 1* - Via Powershell CLI as Administrator

      ```ps
      dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
      dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
      ```

   - *Option 2* - Via GUI - Windows Features
   {% include figure image_path="/assets/images/posts/2022-04-06/WindowsFeatures.jpg" alt="Windows Features" caption="Windows Features" %}

2. **Set WSL2 as default** - To enable WSL2 we need to open Powershell as Administrator and execute the following command.
   
   ```ps
   wsl --set-default-version 2
   ```

3. **Checking WSL versions installed** - We can use the following command to check for the distros installed in WSL.
   
   ```ps
   wsl -l
   ```
   
   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_FreshInstall.jpg" alt="WSL Fresh Installation" caption="WSL Fresh Installation" %}

4. **List Available Versions (Optional)** - WSL provides the user to install from the various flavors supported, if you wish to see the same you can list the same with the following command.

   ```ps
   wsl --list --online
   ```
  
   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_AvailableDistros.jpg" alt="WSL Available Distros" caption="WSL Available Distros" %}

5. **Installing Ubuntu** - For the demo, I would be setting up the latest version of Ubuntu, and am yet again going to use PowerShell for the same. We could also do this operation via GUI installing the Ubuntu app from the Windows App Store.

   ```ps
   wsl --install -d Ubuntu
   ```

   {% include figure image_path="/assets/images/posts/2022-04-06/WSL_Install.jpg" alt="WSL Installing Ubuntu" caption="WSL Installing Ubuntu" %}   
   
   After this, we see another screen pop-up which is the actual Ubuntu machine asking for the required configurations such as username and password. You get added to the list of sudoers by default and can run Sudo commands using these credentials as well. Once you set up these, you would get the `$` prompt and _**Voila!! You are all set up and ready!!**_  
   
   {% include figure image_path="/assets/images/posts/2022-04-06/Ubuntu_SetupComplete.jpg" alt="Ubuntu Setup Completed" caption="Ubuntu Setup Completed" %}

6. **Check Ubuntu's WSL Version** - You can check the version of the operating systems installed with the following command.

   ```ps
   wsl -l -v
   ```

   If the version of the OS is, **not 2**, you can change the same using the following command:

   ```ps
   wsl set-version Ubutnu 2
   ```

   You might face the following issue when trying to update the WSL version in windows 10, _**WSL 2 requires an update to its kernel component. For information please visit https://aka.ms/wsl2kernel**_. If so happens, you need to do the following:
   - In PowerShell, we need to run the following:
      ```ps
      wsl --shutdown
      ```
   - Download the latest respective arm/x64 kernel from [here](https://www.catalog.update.microsoft.com/Search.aspx?q=wsl)
   - Extract the content cab file and install the package
   - Go back to the PowerShell and start wsl again
      ```ps
      wsl
      ```
   > This should do the trick and you should be able to run the `set-version` command again and it would get converted.

7. **Update and Upgrade Ubuntu (Optional)** - If you wish to update and upgrade the packages installed on Ubuntu in general, you can use the following to do the same.

   ```bash
   sudo apt-get update && sudo apt-get upgrade -y
   ```

   Although not generally, we might face an issue with WSL2 that we are not able to connect to the internet to download the packages when we do so, to fix the issue we add the following to the `/etc/resolv.conf`

   ```bash
   sudo echo nameserver 8.8.8.8 > /etc/resolv.conf
   ```
   Again, it might be possible that this change does not hold with WSL2 and is overwritten, and is a [known issue](https://github.com/microsoft/WSL/issues/5420#issuecomment-646479747). Therefore, to make it permanent we can do the following:

   ```bash
   sudo rm /etc/resolv.conf && \
   sudo bash -c 'echo "nameserver 8.8.8.8" > /etc/resolv.conf' && \
   sudo bash -c 'echo "[network]" > /etc/wsl.conf' && \
   sudo bash -c 'echo "generateResolvConf = false" >> /etc/wsl.conf' && \
   sudo chattr +i /etc/resolv.conf
   ```

8. **Installing Windows Terminal (Optional)** - Although not required, my personal preference is inclined towards using Windows Terminal, which can be installed via the App Store. It gives you the capability to work on multiple terminals in multiple tabs on a single application. Additionally, i can configure it to open Ubuntu as the default tab.

   **Note:** When we open wsl, by default we log in at our windows' user home location, whereas I prefer to use Linux users' home rather than Windows user. Therefore, by making the following configuration in the settings section (Open by pressing `Ctrl+,` and selecting `Ubuntu` configuration) on the Windows Terminal, you can always open a new terminal directly at your Ubuntu Users' home. **Ex**: My user is `animesh` therefore the path I would be setting is `\\wsl$\Ubuntu\home\animesh`

   {% include figure image_path="/assets/images/posts/2022-04-06/Ubuntu_HomeSetup.jpg" alt="Ubuntu Home Setup" caption="Ubuntu Home Setup" %}

   _Now, we can enjoy all the goodness in the world of Linux in Windows itself..._

## Uninstallation

If for some reason we need to uninstall/remove any os from the machine, we need to do the following steps:

1. Find the exact name of the distro you wish to remove from the ones installed
  
   ```ps
   wsl -l -v
   ```

2. Terminate the distro, this will shut down the OS in WSL. Please note, we need to give the name as in the list above
  
   ```ps
   wsl --terminate Ubuntu
   ```

3. Unregister the distro, this will remove any associated filesystem and remove the WSL entry. Please note, we need to give the name as in the list above
  
   ```ps
   wsl --unregister Ubuntu
   ```
