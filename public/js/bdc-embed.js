document.addEventListener('DOMContentLoaded', function () {
  function setLoading(frame, isLoading) {
    const shell = frame.closest('[data-bdc-shell]');
    if (shell) shell.classList.toggle('is-loading', isLoading);
  }

  function loadFrame(frame, source) {
    if (!frame || !source) return;
    setLoading(frame, true);
    frame.setAttribute('src', source);
  }

  document.querySelectorAll('[data-bdc-frame]').forEach(function (frame) {
    frame.addEventListener('load', function () {
      setLoading(frame, false);
    });

    const initialSource = frame.dataset.src;
    if (!initialSource) return;

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        loadFrame(frame, frame.dataset.src || initialSource);
        observer.disconnect();
      }, { rootMargin: '320px 0px' });
      observer.observe(frame);
    } else {
      loadFrame(frame, initialSource);
    }
  });
});
