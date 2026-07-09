
  function filterRoutes(btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.textContent.trim();
    document.querySelectorAll('.route-row').forEach(row => {
      const mode = row.querySelector('.route-mode').textContent.trim();
      row.style.display = (filter === 'Tous' || filter === mode) ? 'grid' : 'none';
    });
  }

  // Scroll reveal
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.08 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));