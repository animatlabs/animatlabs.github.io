(function () {
  function renderMermaid() {
    if (!window.mermaid) return;

    // Jekyll/Rouge typically renders ```mermaid as <pre><code class="language-mermaid">...
    var codeBlocks = document.querySelectorAll(
      'pre > code.language-mermaid, pre > code.mermaid, code.language-mermaid'
    );

    if (!codeBlocks || codeBlocks.length === 0) return;

    codeBlocks.forEach(function (codeEl) {
      var pre = codeEl.closest('pre');
      if (!pre) return;

      // Avoid double-processing
      if (pre.dataset && pre.dataset.mermaidProcessed === 'true') return;
      if (pre.dataset) pre.dataset.mermaidProcessed = 'true';

      var container = document.createElement('div');
      container.className = 'mermaid';
      container.textContent = codeEl.textContent || '';

      pre.replaceWith(container);
    });

    try {
      window.mermaid.initialize({
        startOnLoad: false
      });

      // Render only the blocks we created
      window.mermaid.run({
        querySelector: '.mermaid'
      });
    } catch (e) {
      // Non-critical: leave the code block content as-is if rendering fails
      console.warn('Mermaid render failed', e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderMermaid);
  } else {
    renderMermaid();
  }
})();
