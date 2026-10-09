(() => {
  const form = document.querySelector('#controls');
  const preview = document.querySelector('#preview');
  const effects = document.querySelector('#title-effects');
  const names = ['shimmer', 'sweep', 'glow', 'spectacle'];
  const signatures = {
    nebula: { name: 'Nebula Sovereign', mark: '✧', color: '#d4a1ff', tagline: 'A NEW NAME IN THE COSMOS.', description: 'Violet clouds · drifting stardust · pearlescent metal', details: ['Nebula veil|Two violet and pink gas clouds slowly drift behind the title.', 'Pearlescent metal|Lavender, rose and ice-blue reflections flow through the letters.', 'Stardust|Tiny points of light blink softly across the cloud.'] },
    comet: { name: 'Comet Crown', mark: '☄', color: '#9aeeff', tagline: 'ONE RUN. A TRAIL FOREVER.', description: 'Shooting comet · ion trail · icy chrome', details: ['The comet|A bright ice-blue head crosses behind the title on a diagonal.', 'Ion trail|A long tapered tail follows the comet and fades before the next pass.', 'Ice chrome|Cold silver and cyan sweep across a midnight-blue plaque.'] },
    pulsar: { name: 'Pulsar Prime', mark: '✺', color: '#8bbaff', tagline: 'THE SIGNAL AT THE TOP.', description: 'Twin beams · neutron core · expanding pulses', details: ['Neutron core|A compact blue-white star burns behind the center of the title.', 'Twin beams|Two opposing beams rotate slowly through space.', 'Signal rings|Circular wavefronts expand outward from the star.'] },
    saturn: { name: 'Saturn’s Heir', mark: '♄', color: '#f3d2a0', tagline: 'YOUR OWN PLACE IN ORBIT.', description: 'Banded planet · tilted rings · orbiting moons', details: ['Gas giant|Warm atmospheric bands wrap a bronze planet behind your name.', 'Planetary rings|Two thin tilted ellipses surround the planet.', 'Little moons|Three small satellites move around the champion’s orbit.'] },
    andromeda: { name: 'Andromeda Rise', mark: '❂', color: '#ffb1da', tagline: 'AN ENTIRE GALAXY. ONE CHAMPION.', description: 'Spiral arms · galactic heart · rotating starfield', details: ['Spiral galaxy|Four luminous arms turn around a warm galactic center.', 'Galactic heart|A peach-colored core lights up the rose-metal title.', 'Starwheel|A field of stars turns slowly with the galaxy.'] },
    eclipse: { name: 'Eclipse Eternal', mark: '◐', color: '#ffd08d', tagline: 'THE MOMENT THE ARENA STOOD STILL.', description: 'Moving eclipse · amber corona · diamond ring', details: ['The eclipse|A dark lunar disk passes across an amber star.', 'Stellar corona|A fine gold rim glows around the occluded light.', 'Diamond ring|A single bright edge glint marks the passage of the moon.'] },
    aurora: { name: 'Aurora Voyager', mark: '≋', color: '#83ffd6', tagline: 'BEYOND THE LAST FRONTIER.', description: 'Aurora curtains · flowing color · polar stars', details: ['Aurora curtains|Three translucent ribbons flow behind the title in green and violet.', 'Polar chrome|Mint, cyan and pale lavender give the letters a shifting shine.', 'Polar stars|Quiet stars twinkle through the moving curtains.'] },
    warp: { name: 'Starlight Hyperdrive', mark: '⋆', color: '#b2dfff', tagline: 'FIRST PLACE. LIGHT SPEED.', description: 'Radial star trails · jump portal · blue-white energy', details: ['Hyperspace|Star trails rush outward from a vanishing point behind the title.', 'Jump portal|Two concentric blue rings open and settle around the plaque.', 'Flight metal|Bright white and electric blue carry the champion’s name.'] }
  };
  const defaults = { preset: 'nebula', shimmer: true, sweep: true, glow: true, spectacle: true, speed: 1, intensity: 1, background: 'dark' };
  const labels = ['Subtle', 'Soft', 'Wild'];
  let state;
  let paused = false;
  let entranceTimer;
  const grid = document.querySelector('#preset-grid');
  for (const [key, signature] of Object.entries(signatures)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'preset'; button.dataset.preset = key;
    button.style.setProperty('--accent', signature.color);
    const mark = document.createElement('span'); mark.className = 'preset-mark'; mark.textContent = signature.mark; mark.setAttribute('aria-hidden', 'true');
    const name = document.createElement('strong'); name.textContent = signature.name;
    const description = document.createElement('small'); description.textContent = signature.description;
    button.append(mark, name, description); grid.append(button);
  }
  const layer = document.querySelector('.vfx-particles');
  for (let i = 0; i < 24; i++) {
    const particle = document.createElement('i');
    particle.style.setProperty('--x', `${(i * 43 % 101)}%`);
    particle.style.setProperty('--delay', `${-(i * .37)}s`);
    particle.style.setProperty('--duration', `${3 + (i % 5) * .6}s`);
    particle.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (12 + i % 6 * 6)}px`);
    particle.style.setProperty('--size', `${2 + i % 4}px`);
    particle.style.setProperty('--angle', `${i * 15}deg`);
    particle.style.setProperty('--y', `${18 + (i * 29 % 71)}%`);
    layer.append(particle);
  }
  function readHash() {
    const params = new URLSearchParams(location.hash.slice(1));
    const preset = Object.hasOwn(signatures, params.get('preset')) ? params.get('preset') : 'nebula';
    const next = { ...defaults, preset, spectacle: signatures[preset].spectacle !== false };
    for (const name of names) if (['0', '1'].includes(params.get(name))) next[name] = params.get(name) === '1';
    for (const [name, min, max, precision] of [['speed', .5, 2, 10], ['intensity', 0, 2, 1]]) {
      const raw = params.get(name); const value = Number(raw);
      if (raw !== null && raw.trim() && Number.isFinite(value)) next[name] = Math.round(Math.min(max, Math.max(min, value)) * precision) / precision;
    }
    if (['dark', 'dusk', 'light'].includes(params.get('background'))) next.background = params.get('background');
    return next;
  }
  function replay() {
    clearTimeout(entranceTimer); effects.classList.remove('entering');
    void effects.offsetWidth;
    effects.classList.add('entering');
    entranceTimer = setTimeout(() => effects.classList.remove('entering'), 1400 / state.speed);
  }
  function render(persist = true) {
    const signature = signatures[state.preset];
    for (const name of names) { form.elements.namedItem(name).checked = state[name]; effects.classList.toggle(`has-${name}`, state[name]); }
    effects.dataset.preset = state.preset;
    effects.style.setProperty('--accent', signature.color);
    form.elements.speed.value = state.speed; form.elements.intensity.value = state.intensity; form.elements.background.value = state.background;
    preview.dataset.background = state.background;
    effects.style.setProperty('--time', 1 / state.speed); effects.style.setProperty('--strength', [.55, 1, 1.5][state.intensity]);
    document.querySelector('#speed-value').value = `${state.speed.toFixed(1)}×`;
    document.querySelector('#intensity-value').value = labels[state.intensity];
    form.elements.speed.setAttribute('aria-valuetext', `${state.speed.toFixed(1)} times`);
    form.elements.intensity.setAttribute('aria-valuetext', labels[state.intensity]);
    document.querySelector('#signature-name').textContent = signature.name;
    document.querySelector('#signature-tagline').textContent = signature.tagline;

    document.querySelector('.preview-top > span').textContent = `${String(Object.keys(signatures).indexOf(state.preset) + 1).padStart(2, '0')} / COSMIC COLLECTION`;
    grid.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === state.preset)));
    document.querySelectorAll('.effect-notes article').forEach((article, i) => { const [title, description] = signature.details[i].split('|'); article.querySelector('h2').textContent = title; article.querySelector('p').textContent = description; });

    const count = names.filter(name => state[name]).length;
    document.querySelector('#active-count').textContent = `${count} ${count === 1 ? 'layer' : 'layers'} active`;
    if (persist) { const params = new URLSearchParams(); for (const name of names) params.set(name, state[name] ? '1' : '0'); for (const name of ['preset', 'speed', 'intensity', 'background']) params.set(name, state[name]); history.replaceState(null, '', `${location.pathname}${location.search}#${params}`); }
  }
  grid.addEventListener('click', event => { const button = event.target.closest('[data-preset]'); if (!button) return; state = { ...defaults, preset: button.dataset.preset, spectacle: signatures[button.dataset.preset].spectacle !== false, speed: state.speed, intensity: state.intensity, background: state.background }; render(); replay(); });
  form.addEventListener('input', ({ target }) => { if (names.includes(target.name)) state[target.name] = target.checked; else if (['speed', 'intensity'].includes(target.name)) state[target.name] = Number(target.value); else if (target.name === 'background') state.background = target.value; render(); });
  form.addEventListener('reset', event => { event.preventDefault(); state = { ...defaults, preset: state.preset, spectacle: signatures[state.preset].spectacle !== false }; render(); replay(); });
  document.querySelector('#replay').addEventListener('click', replay);
  document.querySelector('#pause').addEventListener('click', event => { paused = !paused; effects.classList.toggle('is-paused', paused); event.currentTarget.setAttribute('aria-pressed', String(paused)); event.currentTarget.textContent = paused ? 'Resume motion' : 'Pause motion'; });
  document.addEventListener('visibilitychange', () => effects.classList.toggle('is-hidden', document.hidden));
  window.addEventListener('hashchange', () => { state = readHash(); render(false); });
  state = readHash(); render(); replay();
})();


