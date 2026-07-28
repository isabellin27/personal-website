document.addEventListener('DOMContentLoaded', function () {

  // Scroll fade-up animation
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  document.querySelectorAll('.fade-up').forEach((el) => observer.observe(el));

  // Nav active link highlight on scroll
  const sections = document.querySelectorAll('section[id], div[id]');
  const navLinks = document.querySelectorAll('.nav-links a');

  const scrollObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          navLinks.forEach((link) => {
            link.style.color = 'rgba(255,255,255,0.4)';
            if ((link.getAttribute('href') || '').endsWith('#' + entry.target.id)) {
              link.style.color = 'var(--gold-light)';
            }
          });
        }
      });
    },
    { threshold: 0.4 }
  );

  sections.forEach((section) => scrollObserver.observe(section));

  // Close the mobile navigation after a destination is selected.
  const mobileNav = document.querySelector('.nav-mobile');
  document.querySelectorAll('.nav-mobile-panel a').forEach((link) => {
    link.addEventListener('click', () => {
      if (mobileNav) mobileNav.removeAttribute('open');
    });
  });
});
