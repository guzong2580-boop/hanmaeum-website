/* 한마음일터 — 공통 헤더/메뉴 스크립트 */

(function () {
  // 헤더 스크롤 효과
  const header = document.getElementById('site-header');
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 30) header.classList.add('scrolled');
      else header.classList.remove('scrolled');
    });
  }

  // 모바일 메뉴 토글
  const mobToggle = document.getElementById('mob-toggle');
  const mobMenu   = document.getElementById('mob-menu');
  if (mobToggle && mobMenu) {
    mobToggle.addEventListener('click', () => {
      const isOpen = mobMenu.classList.toggle('open');
      mobMenu.classList.toggle('hidden', !isOpen);
    });
    mobMenu.querySelectorAll('a').forEach(a =>
      a.addEventListener('click', () => {
        mobMenu.classList.remove('open');
        mobMenu.classList.add('hidden');
      })
    );
  }

  // 모바일 그룹 아코디언
  document.querySelectorAll('.mob-group-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const sub = document.getElementById(btn.getAttribute('data-target'));
      if (!sub) return;
      const isOpen = sub.classList.toggle('open');
      btn.classList.toggle('open', isOpen);
    });
  });

  // 스크롤 시 reveal
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  // 탭 네비게이션 (앵커 클릭 시 active 표시)
  const tabLinks = document.querySelectorAll('.tab-link');
  if (tabLinks.length) {
    const sections = Array.from(tabLinks).map(t => {
      const id = t.getAttribute('href').replace('#', '');
      return { link: t, el: document.getElementById(id) };
    }).filter(s => s.el);

    function syncTab() {
      const y = window.scrollY + 200;
      let active = sections[0];
      for (const s of sections) {
        if (s.el.offsetTop <= y) active = s;
      }
      tabLinks.forEach(t => t.classList.remove('active'));
      if (active) active.link.classList.add('active');
    }
    window.addEventListener('scroll', syncTab);
    syncTab();
  }
})();
