// Lazy-load images that lack the attribute
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img:not([loading])').forEach(img => {
    img.setAttribute('loading', 'lazy');
  });

  // Click-to-zoom images (lightbox-lite)
  const pageContent = document.querySelector('.page__content');
  if (pageContent) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:none;align-items:center;justify-content:center;z-index:9999;';
    const zoomImg = document.createElement('img');
    zoomImg.style.cssText = 'max-width:90vw;max-height:90vh;box-shadow:0 10px 30px rgba(0,0,0,0.4);border-radius:8px;';
    overlay.appendChild(zoomImg);
    const closeOverlay = () => overlay.style.display = 'none';
    overlay.addEventListener('click', closeOverlay);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
    document.body.appendChild(overlay);

    pageContent.querySelectorAll('img').forEach(img => {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => {
        zoomImg.src = img.src;
        overlay.style.display = 'flex';
      });
    });

    // External links: open in new tab with noopener/noreferrer
    pageContent.querySelectorAll('a[href^="http"]').forEach(a => {
      try {
        const url = new URL(a.href);
        if (url.hostname && url.hostname !== location.hostname) {
          a.setAttribute('target', '_blank');
          a.setAttribute('rel', 'noopener noreferrer');
        }
      } catch {}
    });
  }

  // Back-to-top button with accessibility
  const backBtn = document.createElement('button');
  backBtn.id = 'backToTop';
  backBtn.title = 'Back to top';
  backBtn.setAttribute('aria-label', 'Back to top');
  backBtn.innerHTML = '<span aria-hidden="true">▲</span>';
  backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(backBtn);

  // Floating subscribe button (always visible)
  const subBtn = document.createElement('button');
  subBtn.id = 'subscribeFloat';
  subBtn.title = 'Subscribe';
  subBtn.setAttribute('aria-label', 'Subscribe to new posts');
  subBtn.innerHTML = '<span aria-hidden="true">&#9993;</span>'; // Envelope (subscribe)
  subBtn.addEventListener('click', () => {
    const ctaEl = document.getElementById('subscribe-cta');
    if (ctaEl) {
      ctaEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      window.location.href = '/subscribe/';
    }
  });
  document.body.appendChild(subBtn);

  // Back-to-top appears on scroll only
  const onScrollUI = () => {
    backBtn.style.opacity = window.scrollY > 600 ? '0.85' : '0';
  };
  document.addEventListener('scroll', onScrollUI, { passive: true });
  onScrollUI();

  // Reading progress bar with accessibility
  const progress = document.createElement('div');
  progress.id = 'readingProgress';
  progress.setAttribute('role', 'progressbar');
  progress.setAttribute('aria-label', 'Reading progress');
  progress.setAttribute('aria-valuemin', '0');
  progress.setAttribute('aria-valuemax', '100');
  progress.setAttribute('aria-valuenow', '0');
  document.body.appendChild(progress);
  const content = document.querySelector('.page__content') || document.body;
  const updateProgress = () => {
    const rect = content.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const contentTop = rect.top + window.scrollY;
    const contentHeight = content.scrollHeight;
    const max = Math.max(contentHeight - viewportH, 1);
    const scrolled = Math.min(Math.max(window.scrollY - contentTop, 0), max);
    const pct = Math.round((scrolled / max) * 100);
    progress.style.transform = `scaleX(${pct / 100})`;
    progress.setAttribute('aria-valuenow', pct);
  };
  document.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress);
  updateProgress();

  // Code language badges
  document.querySelectorAll('.highlighter-rouge pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    const cls = [...code.classList].find(c => c.startsWith('language-'));
    if (!cls) return;
    const lang = cls.replace('language-', '').toUpperCase();
    if (!lang) return;
    const badge = document.createElement('span');
    badge.className = 'code-badge';
    badge.textContent = lang;
    pre.style.position = pre.style.position || 'relative';
    pre.appendChild(badge);
  });

  // (removed dynamic width match; using fixed line heights in CSS)

  // Warn in console if heading levels jump (e.g., H2 to H4)
  const headings = Array.from(document.querySelectorAll('.page__content h1, .page__content h2, .page__content h3, .page__content h4, .page__content h5, .page__content h6'));
  let last = 0;
  headings.forEach(h => {
    const level = parseInt(h.tagName.substring(1), 10);
    if (last && level - last > 1) {
      console.warn('Heading level jump detected:', `H${last} -> H${level}`, 'at', h.textContent.trim().slice(0,80));
    }
    last = level;
  });

  // Email Subscribe CTA at end of blog posts
  try {
    const ctaContent = document.querySelector('.page__content');
    const isPost = document.querySelector('.page__meta') && document.querySelector('.page__date');
    if (ctaContent && isPost) {
      const cta = document.createElement('div');
      cta.id = 'subscribe-cta';
      cta.innerHTML = `
        <div style="background:linear-gradient(135deg,#f8f9fa 0%,#e9ecef 100%);padding:1.5em 2em;border-radius:12px;margin:2.5em 0 1em;text-align:center;border:1px solid #dee2e6;">
          <p style="margin:0 0 0.5em;font-size:1.1em;font-weight:600;color:#212529;">Enjoyed this post?</p>
          <p style="margin:0 0 1em;color:#6c757d;font-size:0.95em;">Get new articles delivered to your inbox. No spam, unsubscribe anytime.</p>
          <form action="https://api.follow.it/subscription-form/eXRoSmNlOEdxTjZ5aFBLaW5lYjZzR3pnb1BQTks5MElIQVdTY2hZSEw5REYzbERXckJQKzREUDRBblhsbEtyUnpMV09ONlhNbDR6azRnRVh2NmdlZXdFWGVGQlhocm1GeW96UXpUN0RaTG91d3hVS2hjUjNkOG8xUk96UElBZzh8T2hrVEtkaU1iQjJiR0IxWi95czFXYjJMWWcwSWprU21GVk4xVXkwS3NjWT0=/8" method="post" style="display:flex;gap:0.5rem;max-width:400px;margin:0 auto;flex-wrap:wrap;justify-content:center;">
            <input type="email" name="email" placeholder="Enter your email" required style="flex:1;min-width:180px;padding:0.6rem 1rem;border:1px solid #ced4da;border-radius:6px;font-size:0.95rem;text-align:center;outline:none;">
            <button type="submit" style="padding:0.6rem 1.25rem;background:#0ea5e9;color:#fff;border:none;border-radius:6px;font-size:0.95rem;font-weight:600;cursor:pointer;">Subscribe</button>
          </form>
        </div>
      `;
      ctaContent.appendChild(cta);
    }
  } catch (e) {
    // Subscribe CTA is non-critical; fail silently
  }
});

