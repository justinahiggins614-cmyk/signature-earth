// JAHaudio — one global read-aloud controller for Signature Earth.
// Rule: play() always stops current audio first. Double-tap never stacks.
window.JAHaudio = (function () {
  'use strict';
  function supported() {
    try { return 'speechSynthesis' in window; } catch (e) { return false; }
  }
  function stop() {
    try { if (supported()) window.speechSynthesis.cancel(); } catch (e) {}
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
  function speak(text) {
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
  // warm up voices on some browsers
  try { if (supported()) window.speechSynthesis.getVoices(); } catch (e) {}
  return { speak: speak, stop: stop, supported: supported };
})();
