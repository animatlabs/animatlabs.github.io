---
title: "Postmortem Playbook for .NET Teams"
excerpt: >-
  "How to run postmortems that actually prevent repeat incidents - with templates you can use today."
categories:
  - Technical
  - .NET
  - Architecture
tags:
  - .NET
  - Production
  - Reliability
  - Postmortem
  - Incident Response
  - DevOps
author: animat089
last_modified_at: 2026-01-31
sitemap: true
toc: true
toc_label: "Table of Contents"
comments: true
---

## Why Postmortems Matter

Every team has incidents. The difference between teams that keep having the same incidents and teams that continuously improve is one thing: effective postmortems.

I learned this after watching the same issue take down our system three times in six months. Each time, we scrambled to fix it, breathed a sigh of relief, and moved on. No documentation. No analysis. No prevention. The third time, when leadership asked "why does this keep happening?", we had no good answer.

That's when we formalized our postmortem process. Not because someone mandated it, but because we were tired of fighting the same fires.

A good postmortem isn't about assigning blame or filling out paperwork. It's a learning exercise that turns painful incidents into systematic improvements. Done well, postmortems make your system more resilient and your team more confident.

## The Blameless Postmortem Culture

Before we talk about process, we need to talk about culture. A postmortem only works if people are honest about what happened. And people won't be honest if they're afraid of punishment.

**Blameless doesn't mean accountable-less.** It means we focus on *systems* that allowed the failure, not *individuals* who made mistakes. The question isn't "who screwed up?" but "what conditions made this failure possible?"

Consider these two framings:

**Blame-focused:** "Sarah deployed without testing, causing the outage."

**Blameless:** "Our deployment process allowed changes to reach production without adequate testing. What safeguards should exist?"

The first framing ends with Sarah feeling terrible and everyone else thinking "glad it wasn't me." The second framing leads to CI/CD improvements that prevent future incidents regardless of who deploys.

**Key principles for blameless culture:**
- Assume everyone acted with the best information they had at the time
- Focus on system weaknesses, not individual failures
- Make it safe to admit mistakes - they're how we learn
- Never use postmortem findings in performance reviews
- Share postmortems widely so everyone benefits from the lessons

## My Postmortem Process

I run postmortems in five steps, typically scheduled 24-72 hours after the incident is resolved. This gives people time to decompress while memories are still fresh.

### Step 1: Incident Timeline

The foundation of every postmortem is an accurate timeline. What happened, when, and in what order?

**How to build the timeline:**
1. Gather data from monitoring tools, logs, and alerting systems
2. Collect chat logs from incident channels (Slack, Teams)
3. Interview key participants - separately if needed
4. Cross-reference timestamps to build a unified view

A good timeline includes:
- When the issue started (often earlier than when we noticed)
- When it was detected and how
- Key decisions and actions taken
- When mitigation began working
- When the incident was fully resolved

**Example timeline entry:**

| Time (UTC) | Event | Source |
|------------|-------|--------|
| 14:23 | Deployment of v2.3.1 to production completed | CI/CD logs |
| 14:31 | First 500 errors appear in logs | Application Insights |
| 14:47 | Error rate exceeds threshold, alert fires | PagerDuty |
| 14:52 | On-call engineer acknowledges, begins investigation | Slack |
| 15:08 | Root cause identified (database connection pool exhaustion) | Investigation |
| 15:15 | Decision to rollback to v2.3.0 | Slack |
| 15:23 | Rollback complete, error rate dropping | Monitoring |
| 15:35 | Incident resolved, monitoring confirms stability | Monitoring |

The timeline itself often reveals insights: a 16-minute gap between errors starting and alerts firing? That's worth investigating.

### Step 2: Root Cause Analysis

Once you have the timeline, dig into *why* each thing happened. The "5 Whys" technique works well for this.

**The 5 Whys:**
1. Why did the outage occur? → Database connection pool was exhausted
2. Why was the pool exhausted? → New code opened connections without closing them
3. Why weren't connections closed? → Developer used `SqlConnection` directly instead of our repository pattern
4. Why was this pattern bypassed? → Developer was unfamiliar with our data access conventions
5. Why was there no code review catch? → PR was approved without data access review checklist

Now we have multiple intervention points: documentation, code review checklists, static analysis rules, connection pool monitoring.

**Tips for effective root cause analysis:**
- Keep asking "why" until you reach systemic issues
- Look for multiple contributing causes - incidents rarely have one root cause
- Distinguish between proximate cause (what triggered it) and root cause (why it was possible)
- Don't stop at "human error" - dig into why the error was possible

### Step 3: Impact Assessment

Quantify the impact to understand severity and prioritize prevention efforts.

**Metrics to capture:**
- **Duration:** Total time from start to resolution
- **User impact:** Number of users affected, type of impact (complete outage vs. degraded experience)
- **Business impact:** Revenue lost, SLA credits owed, reputation damage
- **Engineering cost:** Person-hours spent on incident response
- **Severity level:** P1 (critical), P2 (major), P3 (minor)

**Example impact summary:**

> **Duration:** 1 hour 12 minutes  
> **Users affected:** ~15,000 (100% of users during peak hours)  
> **Revenue impact:** Estimated $8,500 in lost transactions  
> **SLA impact:** Monthly uptime dropped from 99.95% to 99.91%  
> **Engineering cost:** 6 engineer-hours during incident, 40 hours for follow-up fixes

This quantification helps prioritize remediation. A bug that affects 0.1% of users doesn't need the same urgency as one that caused a $50,000 outage.

### Step 4: Action Items

This is where postmortems create value. Each finding should translate into concrete, actionable items.

**Good action items are SMART:**
- **Specific:** "Add connection pool monitoring to Grafana dashboard" not "improve monitoring"
- **Measurable:** "Reduce MTTR to under 15 minutes" not "detect issues faster"
- **Assignable:** Every action has a single owner
- **Realistic:** Achievable with current resources and priorities
- **Time-bound:** Has a due date, not "someday"

**Categories of action items:**

| Category | Example |
|----------|---------|
| Detection | Add alert for connection pool utilization > 80% |
| Prevention | Add static analysis rule to flag direct SqlConnection usage |
| Process | Add data access review to PR checklist |
| Documentation | Document connection pooling best practices |
| Testing | Add load test that validates connection handling under stress |

**Anti-patterns to avoid:**
- "Be more careful" - not actionable
- "Fix the bug" - that already happened during the incident
- "Improve testing" - too vague
- Actions without owners - nobody's responsibility means nobody does it

### Step 5: Follow-Up

The postmortem isn't complete when the meeting ends - it's complete when the action items are done.

**Follow-up process:**
1. Publish the postmortem document to your team's knowledge base
2. Create tickets for each action item, linked to the postmortem
3. Review action item progress in regular team syncs
4. Mark the postmortem "closed" only when all actions are complete
5. Reference the postmortem in any related incidents

**I track action items in a simple table:**

| Action | Owner | Due Date | Status | Ticket |
|--------|-------|----------|--------|--------|
| Add connection pool alert | Alex | 2026-02-15 | Done | OPS-234 |
| Create data access docs | Maria | 2026-02-20 | In Progress | DOC-89 |
| Update PR checklist | Team Lead | 2026-02-10 | Done | PROC-12 |

## Postmortem Template

Here's the template I use. Copy it directly for your next incident.

```markdown
# Incident Postmortem: [Brief Title]

**Incident ID:** INC-XXXX
**Date of Incident:** YYYY-MM-DD
**Date of Postmortem:** YYYY-MM-DD
**Severity:** P1 / P2 / P3
**Duration:** X hours Y minutes
**Author:** [Your Name]
**Attendees:** [List of participants]

---

## Summary

[1-2 sentence description of what happened and the impact]

---

## Impact

| Metric | Value |
|--------|-------|
| Duration | X hours Y minutes |
| Users Affected | N |
| Revenue Impact | $X |
| SLA Impact | X% downtime |
| Severity | P1/P2/P3 |

---

## Timeline (All times in UTC)

| Time | Event |
|------|-------|
| HH:MM | [First symptom or trigger] |
| HH:MM | [Alert fired / Issue detected] |
| HH:MM | [Response began] |
| HH:MM | [Key decision or action] |
| HH:MM | [Mitigation applied] |
| HH:MM | [Incident resolved] |

---

## Root Cause Analysis

### What Happened

[Detailed technical explanation of the failure]

### 5 Whys

1. **Why did [symptom] occur?**  
   → [Answer]

2. **Why did [answer 1] happen?**  
   → [Answer]

3. **Why did [answer 2] happen?**  
   → [Answer]

4. **Why did [answer 3] happen?**  
   → [Answer]

5. **Why did [answer 4] happen?**  
   → [Answer - usually a systemic/process issue]

### Contributing Factors

- [Factor 1]
- [Factor 2]
- [Factor 3]

---

## What Went Well

- [Thing that helped during the incident]
- [Process that worked as designed]
- [Quick thinking that prevented worse outcome]

## What Went Poorly

- [Thing that delayed detection]
- [Process that didn't work]
- [Communication breakdown]

---

## Action Items

| Priority | Action | Owner | Due Date | Ticket |
|----------|--------|-------|----------|--------|
| P1 | [Critical fix] | [Name] | YYYY-MM-DD | [Link] |
| P2 | [Important improvement] | [Name] | YYYY-MM-DD | [Link] |
| P3 | [Nice to have] | [Name] | YYYY-MM-DD | [Link] |

---

## Lessons Learned

1. [Key insight from this incident]
2. [What we'll do differently next time]
3. [Broader architectural lesson]

---

## Related Documents

- [Link to incident ticket]
- [Link to monitoring dashboard]
- [Link to related postmortems]
```

## Common Patterns I've Seen

After running dozens of postmortems, certain patterns emerge. Watch for these in your incidents:

**The "It Worked in Staging" Pattern:**
Production differs from staging in ways that matter. Traffic volume, data shape, third-party integrations. Action items usually involve making environments more similar or adding production-specific testing.

**The "Silent Failure" Pattern:**
Something broke but nobody noticed until users complained. Fix involves adding monitoring, health checks, and synthetic transactions.

**The "Thundering Herd" Pattern:**
A small issue triggers retry logic across many clients, turning a hiccup into a meltdown. Fix involves jitter, backoff, and circuit breakers.

**The "It's Been Broken for Weeks" Pattern:**
The incident timeline reveals the issue started long before detection. Fix involves monitoring, alerting, and proactive health checks.

**The "Single Point of Failure" Pattern:**
One component failing takes down everything. Fix involves redundancy, graceful degradation, and architectural review.

## Tools for Incident Management

Having the right tools makes postmortems easier:

**Incident Management:**
- PagerDuty, Opsgenie, or VictorOps for alerting and on-call scheduling
- Incident.io or Rootly for incident response coordination
- Jira Service Management for enterprise workflows

**Monitoring and Logging:**
- Application Insights, Datadog, or New Relic for APM
- Grafana for dashboards
- ELK stack or Splunk for log aggregation

**Postmortem Documentation:**
- Confluence, Notion, or your team's wiki
- GitHub/GitLab issues linked to postmortem docs
- Shared templates that everyone uses

The specific tools matter less than having *a* tool for each purpose and using it consistently.

## Conclusion

Postmortems are how good teams become great teams. Every incident is tuition paid for a lesson - the postmortem is how you make sure you actually learn it.

Start simple: after your next significant incident, schedule a meeting, build a timeline, ask "why" five times, and create three action items with owners. You'll be surprised how much you learn.

The goal isn't to prevent all incidents - that's impossible. The goal is to prevent the same incident from happening twice, and to detect and recover from new incidents faster. Effective postmortems make that happen.

---

*How does your team run postmortems? Share your process in the comments!*
