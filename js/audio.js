// JAHaudio — one global read-aloud controller for Signature Earth.
// Rule: play() always stops current audio first. Double-tap never stacks.
// 2026-10-11 dead-voice fix: window.speechSynthesis may EXIST but be dead
// (notably the Facebook in-app browser: speak() silently does nothing,
// onend/onerror never fire, getVoices() returns [] forever). Never trust it
// directly — all speech goes through SigTTS, which probes aliveness, watches
// every utterance, and falls back to online-audio tiers. Legacy direct tiers
// are kept as a no-SigTTS fallback (used by the Node test harness).

/* === SigTTS dead-voice guard (2026-10-11, full-network read-aloud sweep) ===
   window.speechSynthesis may EXIST but be dead (notably FB in-app browser on
   Android: speak() silently does nothing, onend/onerror never fire,
   getVoices() returns [] forever). Never trust presence — probe aliveness,
   watch every utterance, fall back to online-audio tiers when dead/stalled.
   Controller rule: S.speak() stops current audio first (no stacking);
   S.stop() kills everything. Wire page stop buttons to S.stop().
   INJECT VERBATIM — do not rename the SigTTS namespace. */
(function(){
if(window.SigTTS && window.SigTTS.voiceAlive) return;
var S = window.SigTTS = window.SigTTS || {};
S.TTS_URLS = S.TTS_URLS || [
  function(t){return "https://code.responsivevoice.org/getvoice.php?t="+encodeURIComponent(t)+"&tl=en-US&sv=g2&vn=&pitch=0.5&rate=0.95";},
  function(t){return "https://translate.google.com/translate_tts?ie=UTF-8&q="+encodeURIComponent(t)+"&tl=en&client=tw-ob";},
  function(t){return "https://translate.googleapis.com/translate_tts?ie=UTF-8&q="+encodeURIComponent(t)+"&tl=en&client=tw-ob";}
];
/* Probe: cb(true) = live voice exists, cb(false) = dead/missing.
   Waits up to ~3s for onvoiceschanged (healthy browsers load voices async). */
S.voiceAlive = function(cb){
  var done=false;
  function fin(a){ if(done)return; done=true; try{cb(!!a);}catch(e){} }
  try{
    var ss=window.speechSynthesis;
    if(!ss){ fin(false); return; }
    var v0=null; try{ v0=ss.getVoices(); }catch(e){}
    if(v0 && v0.length){ fin(true); return; }
    var to=setTimeout(function(){ fin(false); },3000);
    var prev=null; try{ prev=ss.onvoiceschanged; }catch(e){}
    ss.onvoiceschanged=function(){
      try{ if(prev) prev.call(ss); }catch(e){}
      if(done) return;
      var v2=null; try{ v2=ss.getVoices(); }catch(e){}
      if(v2 && v2.length){ clearTimeout(to); fin(true); }
    };
    try{ ss.getVoices(); }catch(e){}
  }catch(e){ fin(false); }
};
S._fb={audio:null,stopped:true,timer:null};
S.fbStop=function(){
  var f=S._fb; f.stopped=true;
  if(f.timer){ clearTimeout(f.timer); f.timer=null; }
  if(f.audio){ try{f.audio.pause();}catch(e){} f.audio=null; }
  try{ if(window.speechSynthesis) window.speechSynthesis.cancel(); }catch(e){}
};
/* Online-audio fallback: chunk-by-chunk through the tiers.
   onDone(true)=finished, onDone(false)=failed/stopped. 14s fail-fast/chunk. */
S.fbSpeak=function(text,onDone){
  var f=S._fb; S.fbStop(); f.stopped=false;
  var chunks=String(text).replace(/\s+/g," ").trim().split(/(?<=[.!?;])\s+/).filter(Boolean).slice(0,90);
  if(!chunks.length){ if(onDone)try{onDone(false);}catch(e){} return; }
  var i=0,tier=0;
  function next(){
    if(f.stopped){ if(onDone)try{onDone(false);}catch(e){} return; }
    if(i>=chunks.length){ if(onDone)try{onDone(true);}catch(e){} return; }
    if(tier>=S.TTS_URLS.length){ if(onDone)try{onDone(false);}catch(e){} return; }
    var a=new Audio(); f.audio=a; var settled=false;
    function fin(ok){
      if(settled) return; settled=true;
      if(f.timer){ clearTimeout(f.timer); f.timer=null; }
      try{a.pause();}catch(e){}
      if(f.stopped){ if(onDone)try{onDone(false);}catch(e){} return; }
      if(ok){ i++; tier=0; f.timer=setTimeout(next,220); }
      else { tier++; next(); }
    }
    a.onended=function(){fin(true);};
    a.onerror=function(){fin(false);};
    f.timer=setTimeout(function(){fin(false);},14000);
    var src=""; try{ src=S.TTS_URLS[tier](chunks[i]); }catch(e){ fin(false); return; }
    a.src=src;
    try{ var p=a.play(); if(p&&p.catch)p.catch(function(){fin(false);}); }
    catch(e){ fin(false); }
  }
  next();
};
/* Guarded speak: probes first; dead engine -> straight to fbSpeak.
   Live path: onstart watchdog 6s + absolute budget; stall -> cancel + fallback.
   onDone(true/false) ALWAYS fires exactly once — reset button/UI state there. */
S.speak=function(text,opts,onDone){
  if(typeof opts==="function"){ onDone=opts; opts={}; }
  opts=opts||{};
  S.fbStop(); S._fb.stopped=false;
  S.voiceAlive(function(alive){
    if(S._fb.stopped){ if(onDone)try{onDone(false);}catch(e){} return; }
    if(!alive){ S.fbSpeak(text,onDone); return; }
    try{
      var ss=window.speechSynthesis, u=new SpeechSynthesisUtterance(String(text));
      if(opts.rate)u.rate=opts.rate; if(opts.pitch)u.pitch=opts.pitch; if(opts.lang)u.lang=opts.lang;
      try{
        var vs=ss.getVoices()||[], en=vs.filter(function(v){return v.lang&&/^en/i.test(v.lang);});
        if(en.length) u.voice=en[0];
      }catch(e){}
      var settled=false, started=false;
      var budget=Math.min(120000, 30000+Math.ceil(String(text).length/15)*1000);
      var t1=setTimeout(function(){ if(!started) fin(false); },6000);
      var t2=setTimeout(function(){ fin(false); },budget);
      function fin(ok){
        if(settled) return; settled=true;
        clearTimeout(t1); clearTimeout(t2);
        try{ ss.cancel(); }catch(e){}
        if(ok){ if(onDone)try{onDone(true);}catch(e){} }
        else { S.fbSpeak(text,onDone); }
      }
      u.onstart=function(){ started=true; };
      u.onend=function(){ fin(true); };
      u.onerror=function(){ fin(false); };
      ss.speak(u);
    }catch(e){ S.fbSpeak(text,onDone); }
  });
};
S.stop=function(){ S.fbStop(); };
})();

window.JAHaudio = (function () {
  'use strict';
  function supported() {
    try { return 'speechSynthesis' in window; } catch (e) { return false; }
  }
  function stop() {
    try { if (window.SigTTS) window.SigTTS.stop(); } catch (e) {}
    try { if (window.__jahAudioEl) { window.__jahAudioEl.pause(); window.__jahAudioEl = null; } } catch (e) {}
    try { if (supported()) window.speechSynthesis.cancel(); } catch (e) {}
  }
  /* Keep earth's existing online tier preference (Google TTS first) for fallback. */
  if (window.SigTTS) {
    window.SigTTS.TTS_URLS = [
      function(t){return "https://translate.google.com/translate_tts?ie=UTF-8&q="+encodeURIComponent(t)+"&tl=en&client=tw-ob";},
      function(t){return "https://translate.googleapis.com/translate_tts?ie=UTF-8&q="+encodeURIComponent(t)+"&tl=en&client=tw-ob";},
      function(t){return "https://code.responsivevoice.org/getvoice.php?t="+encodeURIComponent(t)+"&tl=en-US&sv=g2&vn=&pitch=0.5&rate=0.95";}
    ];
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
    if (!text) return false;
    stop();
    /* SigTTS: probe-before-trust + watchdog on every utterance + online fallback. */
    try {
      if (window.SigTTS) { window.SigTTS.speak(String(text), {rate:1, pitch:1}, function(){}); return true; }
    } catch (e) {}
    /* legacy path (no SigTTS — e.g. Node test harness): GTTS audio, then speechSynthesis. */
    try { if (window.__jahAudioEl) { window.__jahAudioEl.pause(); window.__jahAudioEl = null; } } catch (e) {}
    return speakGTTS(text, function () { speakSS(text); });
  }
  // warm up voices on some browsers
  try { if (supported()) window.speechSynthesis.getVoices(); } catch (e) {}
  return { speak: speak, stop: stop, supported: supported };
})();
