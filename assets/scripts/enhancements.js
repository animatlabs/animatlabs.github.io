// Lazy-load images that lack the attribute
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img:not([loading])').forEach(img => {
    img.setAttribute('loading', 'lazy');
  });

  // Click-to-zoom images (lightbox-lite)
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:none;align-items:center;justify-content:center;z-index:9999;';
  const zoomImg = document.createElement('img');
  zoomImg.style.cssText = 'max-width:90vw;max-height:90vh;box-shadow:0 10px 30px rgba(0,0,0,0.4);border-radius:8px;';
  overlay.appendChild(zoomImg);
  const closeOverlay = () => overlay.style.display = 'none';
  overlay.addEventListener('click', closeOverlay);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOverlay(); });
  document.body.appendChild(overlay);

  document.querySelectorAll('.page__content img').forEach(img => {
    img.style.cursor = 'zoom-in';
    img.addEventListener('click', () => {
      zoomImg.src = img.src;
      overlay.style.display = 'flex';
    });
  });

  // External links: open in new tab with noopener/noreferrer
  document.querySelectorAll('.page__content a[href^="http"]').forEach(a => {
    try {
      const url = new URL(a.href);
      if (url.hostname && url.hostname !== location.hostname) {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      }
    } catch {}
  });

  // Back-to-top button
  const backBtn = document.createElement('button');
  backBtn.id = 'backToTop';
  backBtn.title = 'Back to top';
  backBtn.innerHTML = '▲';
  backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(backBtn);

  const onScrollUI = () => {
    backBtn.style.opacity = window.scrollY > 600 ? '1' : '0';
  };
  document.addEventListener('scroll', onScrollUI, { passive: true });
  onScrollUI();

  // Reading progress bar
  const progress = document.createElement('div');
  progress.id = 'readingProgress';
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
});

