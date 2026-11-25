(() => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const script = document.currentScript;
  if (reducedMotion.matches || !script || !window.HTMLDialogElement || !Element.prototype.animate) return;

  const seen = 'prioritet-intro-seen';
  try {
    if (sessionStorage.getItem(seen)) return;
    sessionStorage.setItem(seen, '1');
  } catch { return; }
  // Переход с презентационной страницы в кабинет в той же вкладке.
  if (document.referrer && new URL(document.referrer).hostname === 'mweowww.github.io') return;

  const dialog = document.createElement('dialog');
  dialog.className = 'splash';
  dialog.setAttribute('aria-label', 'Загрузка кабинета');
  dialog.innerHTML = '<div class="splash-logo" aria-hidden="true"></div><strong>Приоритет</strong><small>Центр образования</small>';
  const mark = dialog.firstElementChild;
  const sprite = new Image();
  sprite.src = new URL('wave.png', script.src);
  const deadline = performance.now() + 500;

  async function show() {
    try {
      await sprite.decode();
      if (performance.now() > deadline || document.hidden || reducedMotion.matches || document.activeElement !== document.body) return;
      document.body.append(dialog);
      const segments = Array.from({length: 6}, () => mark.appendChild(document.createElement('span')));
      dialog.showModal();
      // Порядок спрайта соответствует обходу знака по часовой стрелке.
      const step = 82;
      const duration = 360;
      const secondWave = duration + step * (segments.length - 1) + 1000;
      const waves = segments.map((piece, i) => {
        const angle = (i * 60 - 120) * Math.PI / 180;
        const offset = distance => `translate(${Math.cos(angle)*distance}px, ${Math.sin(angle)*distance}px)`;
        piece.animate([{opacity: 0, transform: offset(26)}, {opacity: 1, transform: 'none'}],
          {duration, delay: i * step, fill: 'backwards', easing: 'ease-out'});
        return piece.animate([{transform: 'none'}, {transform: offset(9)}, {transform: 'none'}],
          {duration, delay: secondWave + i * step, easing: 'ease-in-out'}).finished;
      });
      await Promise.all(waves);
      await dialog.animate([{opacity: 1}, {opacity: 0}], {duration: 180, fill: 'forwards'}).finished;
    } catch {
      // Если браузер прервал загрузку или анимацию, сразу открываем форму.
    } finally { dialog.remove(); }
  }
  reducedMotion.addEventListener('change', () => { if (reducedMotion.matches) dialog.remove(); }, {once: true});
  show();
})();
