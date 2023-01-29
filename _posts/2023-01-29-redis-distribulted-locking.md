---
title: ".NET Apps: Redis Distributed Locking"
excerpt: >-
  "Distributed locking in centralized cache management system like redis which helps maintain integrity and consistency throughout all microservices."
categories:
  - Technical
  - .NET
  - Apps
tags:
  - C#
  - .NET
  - .NET-Core
  - Redis
  - DistributedLocking
  - RedLock.net
author: animat089
toc: true
toc_label: "Table of Contents"
comments: true
---

In today's world where we see a boom of microservices or even multiple instances of the same service running for fail-overs, in general, we need to work with centralized cache management systems like Redis. The main problem that comes with any centralized data persistent system is the race conditions that get created due to multiple resources trying to compete and write/update data to the same resource.

Therefore, in this article, we are going to discuss distributed locking, which is a technique used to ensure that only a single process or thread can access a specific resource at a time, even when the resource is located on different machines or processes. Our distributed cache system for this demo is going to be Redis.

## Idea and Theory

There could be multiple ways we work with our redis servers to obtain the result.

### Single Master Setup - SETNX and DEL

In this case, we have only a single master setup for Redis with backing over failover slaves. There is a possible race condition that can come up with this model:

- Client A acquires the lock in the master.
- The master crashes before the write to the key is transmitted to the replica.
- The replica gets promoted to master.
- Client B acquires the lock to the same resource A already holds a lock for. SAFETY VIOLATION!

Therefore, to achieve locking in such a case, when the resources need to write/update any key onto the system, it needs to take a lock over the resource and then perform the action.
  
```bash
SET resource_name my_random_value NX PX 30000
```

The command will set the key only if it does not already exist (NX option), with an expiration of 30000 milliseconds (PX option). The key is set to a value “my_random_value” which must be unique across all clients and all lock requests.

Basically, the random value is used in order to release the lock in a safe way, with a script that tells Redis: remove the key only if it exists and the value stored at the key is exactly the one I expect to be.

```bash
if redis.call("get",KEYS[1]) == ARGV[1] then
  return redis.call("del",KEYS[1])
else
  return 0
end
```

This is necessary to prevent removing a lock that was put there by a different client. Using merely "DEL" is risky since a client could unlock the lock of another client. The lock will only be released if it is still the one that was set by the client attempting to remove it thanks to the above script's random string "signing" of each lock.

The period of time we select as the key's life span is known as the "lock validity time." The mutual exclusion guarantee, which is only valid for a specific window of time after the lock is acquired, may technically be broken during the auto-release time as well as the time the client has to complete the required operation before another client may be able to acquire the lock again.

We now have a reliable method for obtaining and releasing the lock. With this framework, it is safe to reason about a non-distributed system made up of a single, readily accessible instance. Let's apply the idea to a distributed system without these assurances.

### Multiple Masters Setup - Redlock Algorithm

In the algorithm's distributed form, we presumptively have N Redis masters. We don't use replication or any other implicit coordination scheme because those nodes are completely independent of one another. We have already covered the safe acquisition and release of the lock in one action.

We assume that the algorithm will acquire and release the lock in a single instance using this technique. To acquire the lock, the client performs the following steps:

1. It gets the current time in milliseconds.
2. It tries to acquire the lock in all N instances consecutively, using the same key name and a random value in each instance. During this step, when setting the lock in each instance, the client uses a timeout which is quite small compared to the total lock auto-release time in order to acquire it. This prevents the client from remaining blocked for a long time trying to talk with a Redis node which might be down.
3. The client calculates how long it took to acquire the lock, by subtracting from the current time the timestamp obtained in the first step. If and only if the client was able to acquire the lock in the majority of the instances, and the total time elapsed to acquire the lock is less than the lock validity time, then the lock is considered to be acquired.
4. If the lock was acquired, its validity time is considered to be the initial validity time minus the time elapsed, as computed in the third step.
5. If the client failed to acquire the lock somehow (either it couldn't lock N/2+1 instances or its validity time was negative), it will try unlocking all of them (even those it thought it didn't have a chance of unlocking).

Unlocking the lock is easy, and can be done even if the client believes it was unsuccessful in locking a given instance.

## Implementation of RedLock

There are many libraries that have implemented the redlock algorithms, the one that we are going to discuss here is the `RedLock.NET` library that has implemented all the above for us and abstracted the complexity of maintaining it all.

```c#
using System.Linq;
using RedLockNet.SERedis;
using RedLockNet.SERedis.Configuration;
using StackExchange.Redis;

public class DistributedLock_MultipleMasters
{
    private readonly RedLockFactory _redlockFactory;

    public DistributedLock(params string[] connectionStrings)
    {
        var multiplexers = connectionStrings.Select(connStr => (RedLockMultiplexer)ConnectionMultiplexer.Connect(connStr));
        
        _redlockFactory = RedLockFactory.Create(multiplexers);
    }

    public async Task<bool> TryAcquireLock(string resource, TimeSpan expiry)
    {
        var lockObj = await _redlockFactory.CreateLockAsync(resource, expiry);
        return lockObj.IsAcquired;
    }

    public async Task<bool> TryAcquireLock(string resource, TimeSpan expiry, TimeSpan wait, TimeSpan retry)
    {
        var lockObj = await _redlockFactory.CreateLockAsync(resource, expiry, wait, retry);
        return lockObj.IsAcquired;
    }

    public void ReleaseLock(string resource)
    {
        _redlockFactory.ReleaseLock(resource);
    }
}
```

In the above example, we are using a package called `RedLock.Net`, which accepts the list of connection multiplexers to the redis servers and creates a redlock instance over all those servers.

There are two variations of the acquire lock functionality, which we could think of, one which accepts the resource to lock as well as the expiry time of the lock and another which apart from the two earlier als0 accepts the wait and retry times; which essentially means that in case of failure to acquire the lock, the system will keep retrying after every `retry` TimeSpan until `wait` TimeSpan. Unlocking again here is fairly simple that releases the lock over the resource without any hassles.

## Conclusion

In conclusion, the RedLock algorithm is a distributed locking algorithm that is designed to provide a simple and reliable way to implement distributed locks in Redis. The RedLock.net library provides an easy-to-use implementation of the Redlock algorithm in .NET core, taking care of handling the clock drift and all other complexities of the algorithm.

## References

- [official Redis Documentation](https://redis.io/docs/manual/patterns/distributed-locks/)