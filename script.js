
// script.js — GitHub Pages build
const CONFIG = {
  DATA_URL: "https://script.google.com/macros/s/AKfycbx5NTGC8Wjco6Y0Nm3dHFgJ1AiEBEj9pPyS7pRcdx2aoCKluCE-hEGu6Zi4m6_hmiap5w/exec",
  REFRESH_MS: 30000,
  ROLL_MS: 2000,
  STEP_MS: 55
};
const DEMO = false;

let clackOn = true;
let audioCtx, clackBus;
let prevValues = [];
let firstLoad = true;
let isAnimating = false;
let pendingTimers = [];
let audioWasEverRunning = false; // per capire se l'audio ha mai funzionato

const list      = document.getElementById("list");
const clackBtn  = document.getElementById("clackBtn");
const ambBtn    = document.getElementById("ambBtn");     // non usato più (pulsante ambient)
const hint      = document.getElementById("hint");
const ambientEl = document.getElementById("ambient");    // non usato più (audio ambient)

function showError(msg){
  let el = document.getElementById("err");
  if(!el){
    el = document.createElement("div");
    el.id="err";
    el.style.position="fixed";
    el.style.left="8px"; el.style.right="8px"; el.style.bottom="8px";
    el.style.background="#b00020"; el.style.color="#fff";
    el.style.padding="10px 12px"; el.style.borderRadius="10px";
    el.style.fontFamily="ui-monospace"; el.style.fontSize="12px";
    el.style.zIndex="9999";
    document.body.appendChild(el);
  }
  el.textContent = "ERRORE DATI: " + msg;
}

function tryInitAudio(resume=false){
  try{
    if (!audioCtx){
      audioCtx = new (window.AudioContext||window.webkitAudioContext)();
      clackBus = audioCtx.createGain();
      clackBus.gain.value = 1.0;
      clackBus.connect(audioCtx.destination);
    } else if (resume && audioCtx.state === "suspended"){
      audioCtx.resume();
    }
  }catch(e){}
}
function ensureAudioAlive(){ tryInitAudio(true); }

function playClack(){
  if (!clackOn || !audioCtx) return;
  ensureAudioAlive();
  const dur = 0.045;
  const n   = Math.floor(audioCtx.sampleRate * dur);
  const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
  const ch  = buf.getChannelData(0);
  for (let i=0;i<n;i++){
    const t=i/n; const env=Math.exp(-35*t);
    ch[i]=(Math.random()*2-1)*env;
  }
  const src = audioCtx.createBufferSource(); src.buffer = buf;
  const bp = audioCtx.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1900; bp.Q.value=9;
  const hp = audioCtx.createBiquadFilter(); hp.type="highpass";  hp.frequency.value=450;  hp.Q.value=0.7;
  const g  = audioCtx.createGain(); g.gain.value = 1.0;
  src.connect(bp).connect(hp).connect(g).connect(clackBus);
  src.start();
}

function updateButtons(){
  if (clackBtn){
    clackBtn.setAttribute("aria-pressed", String(clackOn));
    clackBtn.textContent = clackOn ? "Audio CLACK ON" : "Audio CLACK OFF";
  }
  updateAudioHint();
}

// Messaggio per quando l'audio è sospeso da iOS / browser
function updateAudioHint(){
  if (!hint) return;

  // Se l'utente ha spento il clack manualmente, non mostriamo niente
  if (!clackOn){
    hint.style.display = "none";
    return;
  }

  // Nessun AudioContext ancora creato o mai attivato: messaggio base
  if (!audioCtx){
    hint.style.display = "block";
    hint.textContent = "Tocca lo schermo per attivare l'audio del clack.";
    return;
  }

  if (audioCtx.state === "running"){
    // L'audio è attivo
    audioWasEverRunning = true;
    hint.style.display = "none";
    return;
  }

  // Audio non running (suspended, interrupted, ecc.)
  hint.style.display = "block";
  if (audioWasEverRunning){
    // Era già partito e iOS lo ha sospeso
    hint.textContent = "Audio sospeso da iOS — tocca lo schermo per riattivare il clack.";
  } else {
    // Non è mai partito davvero
    hint.textContent = "Tocca lo schermo per attivare l'audio del clack.";
  }
}

function formatPrice(v){
  return Number(v||0).toLocaleString("it-IT",{
    minimumFractionDigits:2,
    maximumFractionDigits:2
  });
}
function toChars(str){
  const width=Math.max(4,Math.min(7,str.length));
  return (" ".repeat(Math.max(0,width-str.length))+str).split("");
}
function schedule(fn,delay){
  const id=setTimeout(fn,delay);
  pendingTimers.push(id);
  return id;
}
function clearPending(){
  pendingTimers.forEach(id=>clearTimeout(id));
  pendingTimers=[];
}

function rollDigits(tileEl, finalChar, durationMs, startDelay){
  if (finalChar === "," || finalChar === " "){
    return schedule(()=>{
      tileEl.textContent = finalChar === "," ? "," : "";
    }, startDelay);
  }
  const charset = "0123456789";
  schedule(()=>{
    const start = performance.now();
    function step(){
      const elapsed = performance.now() - start;
      if (elapsed < durationMs){
        const idx = Math.floor(elapsed/CONFIG.STEP_MS) % charset.length;
        tileEl.textContent = charset[idx];
        playClack();
        requestAnimationFrame(step);
      }else{
        tileEl.textContent = finalChar;
        playClack();
      }
    }
    step();
  }, startDelay);
}

function render(data){
  try{
    if(!data||!Array.isArray(data.items)) throw new Error("JSON senza items[]");
  }catch(e){
    showError(e.message);
    return;
  }
  isAnimating = true;
  clearPending();

  const items = data.items || [];
  const frag  = document.createDocumentFragment();
  const localPrev = prevValues.slice();

  items.forEach((item, i) => {
    const card  = document.createElement("div");
    card.className="card";

    const name  = document.createElement("div");
    name.className="name";
    name.textContent=item.name||"";

    const delta = document.createElement("div");
    delta.className="delta";

    const d = Number(item.change||0);
    const span = document.createElement("span");
    span.className = d>0 ? "up" : d<0 ? "down" : "flat";
    const sign = d===0 ? "±" : (d>0?"+":"−");
    span.textContent = `${sign}${Math.abs(d).toFixed(1)}%`;
    delta.appendChild(span);

    const sep   = document.createElement("div");
    sep.className="sep";

    const priceWrap = document.createElement("div");
    priceWrap.className="price";

    const tiles = document.createElement("div");
    tiles.className="tiles";

    const priceStr = formatPrice(item.price);
    const prevStr  = localPrev[i];
    const curr     = toChars(priceStr);

    curr.forEach(()=>{
      const t=document.createElement("div");
      t.className="tile";
      tiles.appendChild(t);
    });

    priceWrap.appendChild(tiles);
    card.appendChild(name);
    card.appendChild(delta);
    card.appendChild(sep);
    card.appendChild(priceWrap);
    frag.appendChild(card);

    const changed  = firstLoad || priceStr !== (prevStr ?? "");
    const duration = changed ? CONFIG.ROLL_MS : 0;

    curr.forEach((ch,k)=>{
      const el = tiles.children[k];
      if (duration>0){
        const delay=k*40;
        rollDigits(el, ch, duration - delay, delay);
      } else {
        el.textContent = ch === "," ? "," : (ch === " " ? "" : ch);
      }
    });

    prevValues[i] = priceStr;
  });

  list.innerHTML = "";
  list.appendChild(frag);

  const maxTiles = Math.max(...items.map(it => toChars(formatPrice(it.price)).length), 0);
  const maxDuration = CONFIG.ROLL_MS + maxTiles*40 + 50;
  schedule(()=>{
    isAnimating=false;
    firstLoad=false;
  }, maxDuration);
}

async function fetchData(){
  const res = await fetch(CONFIG.DATA_URL, { cache:"no-store" });
  if (!res.ok) throw new Error("HTTP "+res.status);
  return await res.json();
}
async function tick(){
  if (isAnimating) return;
  try{
    const data = await fetchData();
    render(data);
  }catch(e){
    showError(String(e));
  }
}

// ----------------------------------------------------
// Flap periodico ogni 2 minuti
// Ruota le cifre a schermo con la stessa animazione
// ----------------------------------------------------
function periodicFlap(){
  if (isAnimating || firstLoad) return;
  if (!list) return;

  const cards = list.querySelectorAll(".card");
  if (!cards.length) return;

  let maxCols = 0;

  cards.forEach(card => {
    const tiles = card.querySelectorAll(".tiles .tile");
    if (tiles.length > maxCols) maxCols = tiles.length;
  });

  if (maxCols === 0) return;

  isAnimating = true;

  cards.forEach(card => {
    const tiles = card.querySelectorAll(".tiles .tile");

    tiles.forEach((tile, colIndex) => {
      const current = tile.textContent || " ";
      const finalChar = current === "" ? " " : current;
      const duration = CONFIG.ROLL_MS;
      const delay = colIndex * 40;

      rollDigits(tile, finalChar, duration - delay, delay);
    });
  });

  const maxDuration = CONFIG.ROLL_MS + maxCols * 40 + 50;
  schedule(()=>{
    isAnimating = false;
  }, maxDuration);
}

// ----------------------------
// Inizializzazione pagina
// ----------------------------
document.addEventListener("DOMContentLoaded", ()=>{
  // 1) Spegniamo ed eliminiamo qualsiasi audio di sottofondo
  try{
    document.querySelectorAll("audio").forEach(a => {
      try { a.pause(); } catch(e){}
      try { a.currentTime = 0; } catch(e){}
      a.removeAttribute("src");
      try { a.load(); } catch(e){}
      if (a.parentElement) {
        a.parentElement.removeChild(a);
      }
    });
  }catch(e){}

  // 2) Nascondiamo qualsiasi pulsante che contenga "Ambient"
  try{
    document.querySelectorAll("button, .btn, .toggle").forEach(el => {
      if (el.textContent && /ambient/i.test(el.textContent)) {
        el.style.display = "none";
      }
    });
  }catch(e){}

  // 3) Inizializziamo solo il clack
  tryInitAudio();
  updateButtons();
  updateAudioHint();

  // 4) Teniamo vivo l'audio context e aggiorniamo l'hint periodicamente
  setInterval(()=>{
    tryInitAudio(true);
    updateAudioHint();
  }, 25000);

  // 5) Aggiornamento prezzi da Google Sheet
  tick();
  setInterval(()=>tick(), CONFIG.REFRESH_MS);

  // 6) Ogni 2 minuti: animazione flap anche senza cambi prezzo
  setInterval(()=>periodicFlap(), 120000);
});

// ogni tocco/click prova a riattivare l'audio e aggiorna il messaggio
["touchstart","click"].forEach(evt=>{
  document.addEventListener(evt, ()=>{
    tryInitAudio(true);
    updateAudioHint();
  }, { passive:true });
});

document.addEventListener("visibilitychange", ()=>{
  if (document.visibilityState === "visible"){
    tryInitAudio(true);
    updateAudioHint();
  }
});

if (clackBtn){
  clackBtn.addEventListener("click", ()=>{
    clackOn=!clackOn;
    tryInitAudio(true);
    updateButtons();
  });
}

// nessun listener per ambBtn: audio ambient eliminato


