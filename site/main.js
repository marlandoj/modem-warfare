// Modem Warfare landing page: scroll reveals and the player's fullscreen control.
(function () {
	'use strict';

	// Reveal on entry (IntersectionObserver only, no scroll listeners).
	const items = document.querySelectorAll('.reveal');
	if ('IntersectionObserver' in window) {
		const io = new IntersectionObserver((entries) => {
			for (const e of entries) {
				if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
			}
		}, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
		items.forEach((el, i) => { el.style.transitionDelay = (i % 4) * 70 + 'ms'; io.observe(el); });
	} else {
		items.forEach((el) => el.classList.add('in'));
	}

	// Fullscreen: real Fullscreen API where it exists, otherwise (iPhone Safari)
	// a fixed full-viewport stage. Either way the player letterboxes inside.
	const stage = document.getElementById('stage');
	const btn = document.getElementById('fs-btn');
	const frame = document.getElementById('game');
	const canNative = !!(stage.requestFullscreen || stage.webkitRequestFullscreen);
	let exitBtn = null;

	function nativeActive() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
	function pseudoActive() { return stage.classList.contains('pseudo-fs'); }
	function sync() { btn.setAttribute('aria-pressed', String(nativeActive() || pseudoActive())); }

	function pseudo(on) {
		stage.classList.toggle('pseudo-fs', on);
		document.body.classList.toggle('pseudo-fs-on', on);
		if (on && !exitBtn) {
			exitBtn = document.createElement('button');
			exitBtn.type = 'button';
			exitBtn.className = 'exit-fs';
			exitBtn.textContent = 'Exit fullscreen';
			exitBtn.addEventListener('click', () => pseudo(false));
			document.body.appendChild(exitBtn);
		} else if (!on && exitBtn) {
			exitBtn.remove();
			exitBtn = null;
		}
		sync();
	}

	btn.addEventListener('click', () => {
		if (nativeActive()) {
			(document.exitFullscreen || document.webkitExitFullscreen).call(document);
			return;
		}
		if (pseudoActive()) { pseudo(false); return; }
		if (canNative) {
			const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
			Promise.resolve(req.call(stage)).catch(() => pseudo(true));
		} else {
			pseudo(true);
		}
		frame.focus();
	});
	document.addEventListener('fullscreenchange', sync);
	document.addEventListener('webkitfullscreenchange', sync);
	document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pseudoActive()) pseudo(false); });

	// "Play now" brings the player into view and hands it keyboard focus.
	const cta = document.getElementById('cta-play');
	cta.addEventListener('click', (e) => {
		e.preventDefault();
		document.getElementById('player').scrollIntoView({ behavior: 'smooth', block: 'center' });
		setTimeout(() => frame.focus(), 400);
	});
}());
