---
permalink: /subscribe/
title: "Subscribe"
author_profile: true
author: animat089
---

Stay updated with the latest posts from AnimatLabs! Choose your preferred method below.

---

## Subscribe via RSS

RSS (Really Simple Syndication) lets you follow blogs and websites without checking them manually. New posts appear automatically in your feed reader.

<a href="{{ '/feed.xml' | absolute_url }}" class="btn btn--primary btn--large"><i class="fas fa-rss"></i> Subscribe to RSS Feed</a>


### Get Email Notifications (via RSS-to-Email)

Prefer email over RSS? Use these free services to convert the RSS feed to email notifications:

| Service | How to Use |
|---------|------------|
| [Blogtrottr](https://blogtrottr.com) | Enter your email and the feed URL below |
| [FeedRabbit](https://feedrabbit.com) | Simple RSS-to-email service |

**Feed URL to use:**
```
{{ '/feed.xml' | absolute_url }}
```

### Why RSS?

- **No algorithms** - You see every post, in order
- **No tracking** - Your reading habits stay private
- **No distractions** - Clean reading experience
- **One place** - Follow all your favorite sites together
- **Never miss a post** - Updates come to you automatically

---

## Subscribe via Email

Get new posts delivered directly to your inbox - no RSS reader needed!

<div class="email-subscribe-box">
  <form action="https://api.follow.it/subscription-form/eXRoSmNlOEdxTjZ5aFBLaW5lYjZzR3pnb1BQTks5MElIQVdTY2hZSEw5REYzbERXckJQKzREUDRBblhsbEtyUnpMV09ONlhNbDR6azRnRVh2NmdlZXdFWGVGQlhocm1GeW96UXpUN0RaTG91d3hVS2hjUjNkOG8xUk96UElBZzh8T2hrVEtkaU1iQjJiR0IxWi95czFXYjJMWWcwSWprU21GVk4xVXkwS3NjWT0=/8" method="post">
    <div class="subscribe-inner">
      <h3 style="margin: 0 0 0.5rem; font-size: 1.3rem;">Get posts in your inbox</h3>
      <p style="margin: 0 0 1rem; color: #666; font-size: 0.95rem;">New articles delivered directly to your email. No spam, unsubscribe anytime.</p>
      <div class="subscribe-form-row">
        <input type="email" name="email" placeholder="Enter your email" required class="subscribe-input">
        <button type="submit" class="subscribe-btn">Subscribe</button>
      </div>
    </div>
  </form>
</div>

<style>
.email-subscribe-box {
  background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
  padding: 2rem;
  border-radius: 12px;
  margin: 1.5rem 0;
  border: 1px solid #dee2e6;
}
.subscribe-inner {
  text-align: center;
  color: #212529;
}
.subscribe-inner h3 { color: #212529; }
.subscribe-form-row {
  display: flex;
  gap: 0.5rem;
  max-width: 450px;
  margin: 0 auto;
  flex-wrap: wrap;
  justify-content: center;
}
.subscribe-input {
  flex: 1;
  min-width: 200px;
  padding: 0.75rem 1rem;
  border: 1px solid #ced4da;
  border-radius: 6px;
  font-size: 1rem;
  text-align: center;
  outline: none;
  background: #fff;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.subscribe-input:focus {
  border-color: #495057;
  box-shadow: 0 0 0 3px rgba(73, 80, 87, 0.15);
}
.subscribe-btn {
  padding: 0.75rem 1.5rem;
  background: #212529;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}
.subscribe-btn:hover {
  background: #343a40;
  transform: translateY(-1px);
}
@media (max-width: 480px) {
  .subscribe-input, .subscribe-btn { width: 100%; }
}
</style>


---

## Questions?

Have questions or suggestions? Feel free to reach out via [LinkedIn](https://linkedin.com/in/089ani) or [GitHub](https://github.com/animat089).
