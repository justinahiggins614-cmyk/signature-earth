// JAHaudio — one global read-aloud controller for Signature Earth.
// Rule: play() always stops current audio first. Double-tap never stacks.
window.JAHaudio = (function () {
  'use strict';
  function supported() {
    try { return 'speechSynthesis' in window; } catch (e) { return false; }
  }
  function stop() {
    try { if (supported()) window.speechSynthesis.cancel(); } catch (e) {}
    try { if (window.__jahAudioEl) { window.__jahAudioEl.pause(); window.__jahAudioEl = null; } } catch (e) {}
  }
  function pickVoice() {
    try {
      var vs = window.speechSynthesis.getVoices() || [];
      for (var i = 0; i < vs.length; i++) {
        if (/en[-_]US/i.test(vs[i].lang) && /female|samantha|zira|google us english/i.test(vs[i].name)) return vs[i];
      }
      for (var j = 0; j < vs.length; j++) { if (/^en/i.test(vs[j].lang)) return vs[j]; }
    } catch (e) {}
    return null;
  }
  function speakGTTS(text, onFail) {
    // Tier 1: Google TTS via audio element (works in Facebook in-app browser, no key).
    try {
      stop();
      var a = new Audio();
      var chunk = String(text).slice(0, 200);
      a.src = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent(chunk) + '&tl=en&client=tw-ob';
      a.onerror = function () { if (onFail) onFail(); };
      window.__jahAudioEl = a;
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function () { if (onFail) onFail(); });
      return true;
    } catch (e) { if (onFail) onFail(); return false; }
  }
  function speakSS(text) {
    stop();
    if (!text || !supported()) return false;
    try {
      var u = new SpeechSynthesisUtterance(String(text).slice(0, 1200));
      u.rate = 1; u.pitch = 1;
      var v = pickVoice();
      if (v) u.voice = v;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  function speak(text) {
    // Tiered: Google TTS audio first, speechSynthesis fallback.
    if (!text) return false;
    try { if (window.__jahAudioEl) { window.__jahAudioEl.pause(); window.__jahAudioEl = null; } } catch (e) {}
    return speakGTTS(text, function () { speakSS(text); });
  }
  // warm up voices on some browsers
  try { if (supported()) window.speechSynthesis.getVoices(); } catch (e) {}
  return { speak: speak, stop: stop, supported: supported };
})();
