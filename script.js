lucide.createIcons();

const chatPane = document.getElementById(chatPane);
const messageInput = document.getElementById(messageInput);
const sendBtn = document.getElementById(sendBtn);
const orb = document.getElementById(orb);
const callStatus = document.getElementById(callStatus);
const liveTranscript = document.getElementById(liveTranscript);
const micBtn = document.getElementById(micBtn);
const callImages = document.getElementById(callImages);

let isCallMode = false;
let isListening = false;
let recognition;
let audioPlayer = new Audio();

 ---- Voice Setup (Web Speech API) ----
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
  recognition.continuous = false;  Stop after one sentence for turn-taking
  recognition.interimResults = true;
  recognition.lang = 'en-IE';  Irish English Input

  recognition.onstart = () = {
    isListening = true;
    callStatus.textContent = LISTENING...;
    callStatus.classList.add(text-cyan-400);
    micBtn.innerHTML = 'i data-lucide=mic class=w-8 h-8i';
    micBtn.classList.replace(bg-red-50020, bg-cyan-50020);
    micBtn.classList.replace(text-red-500, text-cyan-500);
    micBtn.classList.replace(border-red-500, border-cyan-500);
    lucide.createIcons();
  };

  recognition.onresult = (event) = {
    const transcript = event.results[0][0].transcript;
    liveTranscript.textContent = transcript;
    if (event.results[0].isFinal) {
      sendMessage(transcript, true);
    }
  };

  recognition.onend = () = {
    isListening = false;
    if(isCallMode && !audioPlayer.paused) {
       Don't restart mic if bot is talking
    } else if (isCallMode) {
       Automatically restart listening if in call mode (optional, mostly user presses button)
      callStatus.textContent = TAP MIC TO SPEAK;
      callStatus.classList.remove(text-cyan-400);
      micBtn.innerHTML = 'i data-lucide=mic-off class=w-8 h-8i';
      micBtn.classList.replace(bg-cyan-50020, bg-red-50020);
      micBtn.classList.replace(text-cyan-500, text-red-500);
      micBtn.classList.replace(border-cyan-500, border-red-500);
      lucide.createIcons();
    }
  };
} else {
  alert(Voice not supported in this browser. Use Chrome.);
}

 ---- Core Functions ----

function switchMode(mode) {
  document.querySelectorAll('.nav-btn').forEach(b = b.classList.remove('active'));
  event.currentTarget.classList.add('active');

  const chatUI = document.getElementById('chatInterface');
  const callUI = document.getElementById('callInterface');

  if (mode === 'call') {
    isCallMode = true;
    chatUI.classList.add('hidden');
    callUI.classList.remove('hidden');
    gsap.fromTo(callUI, {opacity0, scale0.9}, {opacity1, scale1, duration0.5});
  } else {
    isCallMode = false;
    recognition.stop();
    audioPlayer.pause();
    callUI.classList.add('hidden');
    chatUI.classList.remove('hidden');
  }
}

async function sendMessage(text, fromVoice = false) {
  if (!text.trim()) return;

  if (!fromVoice) {
    appendMessage('user', text);
    messageInput.value = '';
  }

   Animation state for call mode
  if (fromVoice) {
    callStatus.textContent = THINKING...;
    orb.classList.add(animate-pulse);
  } else {
    appendMessage('bot', '...', true);  Loading bubble
  }

  try {
    const res = await fetch('apichat', {
      method 'POST',
      body JSON.stringify({ message text, voice_mode fromVoice })
    });
    const data = await res.json();

    if (fromVoice) {
       Handle Call Mode Response
      callStatus.textContent = SPEAKING...;
      liveTranscript.textContent = data.answer;
      
       Play Audio
      if (data.audio_url) {
        audioPlayer.src = data.audio_url;
        audioPlayer.play();
        orb.classList.add(orb-talking);
        audioPlayer.onended = () = {
          orb.classList.remove(orb-talking);
          callStatus.textContent = TAP MIC TO REPLY;
        };
      }
      
       Show Images in Call UI
      callImages.innerHTML = ;
      if (data.images && data.images.length  0) {
        data.images.forEach(img = {
          const imgEl = document.createElement(img);
          imgEl.src = img;
          imgEl.className = h-32 rounded-xl border border-white20 shadow-lg object-cover;
          callImages.appendChild(imgEl);
          gsap.from(imgEl, {y 50, opacity 0});
        });
      }

    } else {
       Handle Chat Mode Response
      document.querySelector(.loading-bubble).remove();
      appendMessage('bot', data.answer, false, data.images);
    }

  } catch (e) {
    console.error(e);
  }
}

function appendMessage(role, text, isLoading = false, images = []) {
  const tpl = document.getElementById(role === 'user'  'tpl-user'  'tpl-bot');
  const clone = tpl.content.cloneNode(true);
  
  const contentDiv = clone.querySelector('.content');
  contentDiv.innerHTML = text.replace(ng, 'br');
  
  if (isLoading) {
    contentDiv.innerHTML = `div class=flex gap-2div class=w-2 h-2 bg-cyan-400 rounded-full animate-bouncedivdiv class=w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-75divdiv class=w-2 h-2 bg-cyan-400 rounded-full animate-bounce delay-150divdiv`;
    clone.querySelector('.glass-msg').classList.add('loading-bubble');
  }

   Add images if any
  if (images && images.length  0) {
    const imgContainer = clone.querySelector('.images-container');
    images.forEach(src = {
      const img = document.createElement('img');
      img.src = src;
      img.className = h-40 rounded-lg cursor-pointer hoverscale-105 transition border border-white10;
      img.onclick = () = window.open(src, '_blank');
      imgContainer.appendChild(img);
    });
  }

  chatPane.appendChild(clone);
  chatPane.scrollTop = chatPane.scrollHeight;
  gsap.from(chatPane.lastElementChild, {y 20, opacity 0, duration 0.3});
}

 ---- Event Listeners ----
sendBtn.addEventListener('click', () = sendMessage(messageInput.value));
messageInput.addEventListener('keypress', (e) = {
  if (e.key === 'Enter') sendMessage(messageInput.value);
});

micBtn.addEventListener('click', () = {
  if (isListening) recognition.stop();
  else recognition.start();
});