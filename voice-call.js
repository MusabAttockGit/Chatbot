/**
 * MUSAB AI - COMPLETE Voice Call System
 * Full integration with backend WebSocket, speech recognition, TTS
 */

class VoiceCallSystem {
  constructor() {
    // WebSocket
    this.socket = null;
    this.isConnected = false;
    
    // Media
    this.mediaStream = null;
    this.audioContext = null;
    this.analyser = null;
    this.visualizerAnimationId = null;
    
    // Speech Recognition
    this.recognition = null;
    this.isRecognizing = false;
    
    // Speech Synthesis
    this.synthesis = window.speechSynthesis;
    this.currentUtterance = null;
    
    // Call State
    this.isCallActive = false;
    this.isMuted = false;
    this.isOnHold = false;
    this.isRecording = false;
    this.callStartTime = null;
    this.timerInterval = null;
    
    // Session
    this.sessionId = null;
    this.messageHistory = [];
    
    // Settings
    this.voiceSettings = {
      rate: 1.0,
      pitch: 1.0,
      autoSpeak: true,
      language: 'en-US'
    };
    
    this.init();
  }
  
  // ========== INITIALIZATION ==========
  
  init() {
    console.log('🚀 Initializing Musab AI Voice System...');
    this.setupElements();
    this.setupEventListeners();
    this.initializeSocket();
    this.setupSpeechRecognition();
    this.checkSystemStatus();
    this.loadVoices();
    console.log('✅ System initialized');
  }
  
  setupElements() {
    // Buttons
    this.startCallBtn = document.getElementById('startCallBtn');
    this.endCallBtn = document.getElementById('endCallBtn');
    this.muteBtn = document.getElementById('muteBtn');
    this.holdBtn = document.getElementById('holdBtn');
    this.pushToTalkBtn = document.getElementById('pushToTalkBtn');
    this.settingsBtn = document.getElementById('settingsBtn');
    
    // Status displays
    this.callStatus = document.getElementById('callStatus');
    this.callTimer = document.getElementById('callTimer');
    this.ragStatus = document.getElementById('ragStatus');
    this.micStatus = document.getElementById('micStatus');
    
    // UI states
    this.preCallState = document.getElementById('preCallState');
    this.activeCallState = document.getElementById('activeCallState');
    this.voiceControls = document.getElementById('voiceControls');
    this.conversationPane = document.getElementById('conversationPane');
    this.speakingIndicator = document.getElementById('speakingIndicator');
    
    // Modals
    this.permissionModal = document.getElementById('permissionModal');
    this.settingsModal = document.getElementById('settingsModal');
    
    // Visualizer
    this.visualizerCanvas = document.getElementById('visualizer');
    if (this.visualizerCanvas) {
      this.visualizerCtx = this.visualizerCanvas.getContext('2d');
    }
  }
  
  setupEventListeners() {
    // Call controls
    if (this.startCallBtn) {
      this.startCallBtn.addEventListener('click', () => this.startCall());
    }
    if (this.endCallBtn) {
      this.endCallBtn.addEventListener('click', () => this.endCall());
    }
    if (this.muteBtn) {
      this.muteBtn.addEventListener('click', () => this.toggleMute());
    }
    if (this.holdBtn) {
      this.holdBtn.addEventListener('click', () => this.toggleHold());
    }
    
    // Push to Talk
    if (this.pushToTalkBtn) {
      // Mouse events
      this.pushToTalkBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        this.startRecording();
      });
      this.pushToTalkBtn.addEventListener('mouseup', (e) => {
        e.preventDefault();
        this.stopRecording();
      });
      
      // Touch events for mobile
      this.pushToTalkBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.startRecording();
      });
      this.pushToTalkBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        this.stopRecording();
      });
      
      // Prevent context menu
      this.pushToTalkBtn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
      });
    }
    
    // Modals
    const grantBtn = document.getElementById('grantPermissionBtn');
    if (grantBtn) {
      grantBtn.addEventListener('click', () => {
        this.permissionModal.classList.add('hidden');
        this.requestMicrophonePermission();
      });
    }
    
    const cancelBtn = document.getElementById('cancelPermissionBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        this.permissionModal.classList.add('hidden');
        this.updateStatus('Microphone access denied', 'inactive');
      });
    }
    
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => {
        this.settingsModal.classList.remove('hidden');
      });
    }
    
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    if (closeSettingsBtn) {
      closeSettingsBtn.addEventListener('click', () => {
        this.settingsModal.classList.add('hidden');
      });
    }
    
    // Settings controls
    const voiceSpeed = document.getElementById('voiceSpeed');
    if (voiceSpeed) {
      voiceSpeed.addEventListener('input', (e) => {
        this.voiceSettings.rate = parseFloat(e.target.value);
        const speedValue = document.getElementById('speedValue');
        if (speedValue) speedValue.textContent = e.target.value;
      });
    }
    
    const voicePitch = document.getElementById('voicePitch');
    if (voicePitch) {
      voicePitch.addEventListener('input', (e) => {
        this.voiceSettings.pitch = parseFloat(e.target.value);
        const pitchValue = document.getElementById('pitchValue');
        if (pitchValue) pitchValue.textContent = e.target.value;
      });
    }
    
    const autoSpeak = document.getElementById('autoSpeak');
    if (autoSpeak) {
      autoSpeak.addEventListener('change', (e) => {
        this.voiceSettings.autoSpeak = e.target.checked;
      });
    }
  }
  
  // ========== WEBSOCKET ==========
  
  initializeSocket() {
    try {
      console.log('🔌 Connecting to WebSocket...');
      
      this.socket = io({
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
        timeout: 20000,
        transports: ['websocket', 'polling']
      });
      
      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.sessionId = this.socket.id;
        this.updateRAGStatus('Connected', true);
      });
      
      this.socket.on('disconnect', (reason) => {
        console.log('❌ WebSocket disconnected:', reason);
        this.isConnected = false;
        this.updateRAGStatus('Disconnected', false);
      });
      
      this.socket.on('connection_status', (data) => {
        console.log('📡 Connection status:', data);
        this.sessionId = data.session_id;
      });
      
      this.socket.on('voice_response', (data) => {
        console.log('🎤 Received voice response');
        this.handleVoiceResponse(data);
      });
      
      this.socket.on('error', (error) => {
        console.error('❌ Socket error:', error);
        this.addMessage('assistant', 'Sorry, there was an error processing your request.');
      });
      
      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        this.updateRAGStatus('Connection error', false);
      });
      
      // Keep-alive ping
      setInterval(() => {
        if (this.isConnected && this.socket) {
          this.socket.emit('ping');
        }
      }, 30000);
      
    } catch (error) {
      console.error('❌ Socket initialization failed:', error);
      this.updateRAGStatus('Failed to connect', false);
    }
  }
  
  // ========== SPEECH RECOGNITION ==========
  
  setupSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('⚠️ Speech recognition not supported in this browser');
      this.updateMicStatus('Not supported', false);
      return;
    }
    
    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = this.voiceSettings.language;
      this.recognition.maxAlternatives = 1;
      
      this.recognition.onstart = () => {
        console.log('🎤 Speech recognition started');
        this.isRecognizing = true;
      };
      
      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        const confidence = event.results[0][0].confidence;
        console.log(`🎤 Recognized (${(confidence * 100).toFixed(0)}%): ${transcript}`);
        this.handleSpeechInput(transcript);
      };
      
      this.recognition.onerror = (event) => {
        console.error('❌ Speech recognition error:', event.error);
        
        if (event.error === 'not-allowed' || event.error === 'permission-denied') {
          this.updateMicStatus('Permission denied', false);
          this.permissionModal.classList.remove('hidden');
        } else if (event.error === 'no-speech') {
          console.log('⚠️ No speech detected');
        } else if (event.error === 'network') {
          this.addMessage('assistant', 'Network error. Please check your connection.');
        }
        
        this.stopRecordingUI();
      };
      
      this.recognition.onend = () => {
        console.log('🎤 Speech recognition ended');
        this.isRecognizing = false;
        this.stopRecordingUI();
      };
      
      console.log('✅ Speech recognition initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize speech recognition:', error);
    }
  }
  
  // ========== MICROPHONE ==========
  
  async requestMicrophonePermission() {
    try {
      console.log('🎤 Requesting microphone permission...');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      });
      
      this.mediaStream = stream;
      this.updateMicStatus('Connected', true);
      console.log('✅ Microphone access granted');
      
      // Setup audio visualization
      this.setupAudioVisualization(stream);
      
      return true;
      
    } catch (error) {
      console.error('❌ Microphone permission denied:', error);
      this.updateMicStatus('Permission denied', false);
      
      // Show helpful message
      this.addMessage('assistant', 
        'I need microphone access to hear you. Please allow microphone access in your browser settings.'
      );
      
      return false;
    }
  }
  
  setupAudioVisualization(stream) {
    if (!this.visualizerCanvas) return;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;
      
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyser);
      
      console.log('✅ Audio visualization setup');
      this.visualizeAudio();
      
    } catch (error) {
      console.error('❌ Audio visualization error:', error);
    }
  }
  
  visualizeAudio() {
    if (!this.visualizerCanvas || !this.analyser) return;
    
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = this.visualizerCanvas;
    const ctx = this.visualizerCtx;
    const width = canvas.width;
    const height = canvas.height;
    
    const draw = () => {
      if (!this.isCallActive) return;
      
      this.visualizerAnimationId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);
      
      // Clear with fade effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.3)';
      ctx.fillRect(0, 0, width, height);
      
      // Draw frequency bars
      const barWidth = (width / bufferLength) * 2.5;
      let x = 0;
      
      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * height * 0.8;
        
        // Gradient
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(0.5, '#60a5fa');
        gradient.addColorStop(1, '#93c5fd');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        
        x += barWidth + 1;
      }
    };
    
    draw();
  }
  
  // ========== CALL MANAGEMENT ==========
  
  async startCall() {
    console.log('📞 Starting call...');
    
    // Check microphone
    if (!this.mediaStream) {
      this.permissionModal.classList.remove('hidden');
      const granted = await this.requestMicrophonePermission();
      if (!granted) return;
    }
    
    // Check socket
    if (!this.isConnected) {
      this.addMessage('assistant', 'Connecting to server... Please wait.');
      setTimeout(() => this.startCall(), 2000);
      return;
    }
    
    this.isCallActive = true;
    this.callStartTime = Date.now();
    
    // Update UI
    this.preCallState.classList.add('hidden');
    this.activeCallState.classList.remove('hidden');
    this.startCallBtn.classList.add('hidden');
    this.endCallBtn.classList.remove('hidden');
    this.voiceControls.classList.remove('hidden');
    this.callTimer.classList.remove('hidden');
    
    // Start timer
    this.startTimer();
    
    // Update status
    this.updateStatus('Call active', 'active');
    
    // Welcome message
    const welcome = "Hello! I'm Musab AI, your Irish immigration assistant. How can I help you today?";
    this.addMessage('assistant', welcome);
    
    if (this.voiceSettings.autoSpeak) {
      setTimeout(() => this.speak(welcome), 500);
    }
    
    console.log('✅ Call started');
  }
  
  endCall() {
    console.log('📞 Ending call...');
    
    this.isCallActive = false;
    
    // Stop all audio
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    if (this.visualizerAnimationId) {
      cancelAnimationFrame(this.visualizerAnimationId);
    }
    
    if (this.recognition && this.isRecognizing) {
      this.recognition.stop();
    }
    
    this.synthesis.cancel();
    
    // Stop timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    // Update UI
    this.activeCallState.classList.add('hidden');
    this.preCallState.classList.remove('hidden');
    this.endCallBtn.classList.add('hidden');
    this.startCallBtn.classList.remove('hidden');
    this.voiceControls.classList.add('hidden');
    this.callTimer.classList.add('hidden');
    
    // Clear conversation
    this.conversationPane.innerHTML = '';
    this.callTimer.textContent = '00:00';
    this.messageHistory = [];
    
    // Reset states
    this.isMuted = false;
    this.isOnHold = false;
    
    // Update status
    this.updateStatus('Call ended', 'inactive');
    this.updateMicStatus('Not connected', false);
    
    console.log('✅ Call ended');
  }
  
  toggleMute() {
    this.isMuted = !this.isMuted;
    
    if (this.mediaStream) {
      this.mediaStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });
    }
    
    const icon = this.muteBtn.querySelector('i');
    const text = this.muteBtn.querySelector('span');
    
    if (this.isMuted) {
      icon.setAttribute('data-lucide', 'mic-off');
      text.textContent = 'Unmute';
      this.muteBtn.style.background = 'rgba(239, 68, 68, 0.2)';
      this.muteBtn.style.color = '#ef4444';
      console.log('🔇 Muted');
    } else {
      icon.setAttribute('data-lucide', 'mic');
      text.textContent = 'Mute';
      this.muteBtn.style.background = '';
      this.muteBtn.style.color = '';
      console.log('🔊 Unmuted');
    }
    
    lucide.createIcons();
  }
  
  toggleHold() {
    this.isOnHold = !this.isOnHold;
    
    const icon = this.holdBtn.querySelector('i');
    const text = this.holdBtn.querySelector('span');
    
    if (this.isOnHold) {
      icon.setAttribute('data-lucide', 'play');
      text.textContent = 'Resume';
      this.holdBtn.style.background = 'rgba(251, 191, 36, 0.2)';
      this.addMessage('assistant', 'Call on hold. Click Resume when ready.');
      console.log('⏸️ Call on hold');
    } else {
      icon.setAttribute('data-lucide', 'pause');
      text.textContent = 'Hold';
      this.holdBtn.style.background = '';
      console.log('▶️ Call resumed');
    }
    
    lucide.createIcons();
  }
  
  // ========== RECORDING ==========
  
  startRecording() {
    if (!this.isCallActive || this.isMuted || this.isOnHold || this.isRecording) {
      console.log('⚠️ Cannot start recording');
      return;
    }
    
    if (!this.recognition) {
      this.addMessage('assistant', 'Speech recognition not available in this browser. Try Chrome or Edge.');
      return;
    }
    
    console.log('🎤 Starting recording...');
    this.isRecording = true;
    
    // Show speaking indicator
    this.speakingIndicator.classList.remove('hidden');
    this.pushToTalkBtn.classList.add('recording');
    
    // Start speech recognition
    try {
      this.recognition.start();
    } catch (error) {
      console.error('❌ Recognition start error:', error);
      if (error.name === 'InvalidStateError') {
        // Already running, stop and restart
        this.recognition.stop();
        setTimeout(() => {
          try {
            this.recognition.start();
          } catch (e) {
            console.error('❌ Retry failed:', e);
          }
        }, 100);
      }
    }
  }
  
  stopRecording() {
    if (!this.isRecording) return;
    
    console.log('🎤 Stopping recording...');
    
    if (this.recognition && this.isRecognizing) {
      this.recognition.stop();
    }
    
    this.stopRecordingUI();
  }
  
  stopRecordingUI() {
    this.isRecording = false;
    this.speakingIndicator.classList.add('hidden');
    this.pushToTalkBtn.classList.remove('recording');
  }
  
  // ========== MESSAGE HANDLING ==========
  
  handleSpeechInput(text) {
    if (!text || !text.trim()) {
      console.log('⚠️ Empty speech input');
      return;
    }
    
    console.log('💬 Processing speech input:', text);
    
    // Add user message
    this.addMessage('user', text);
    
    // Send to backend via WebSocket
    if (this.socket && this.isConnected) {
      this.socket.emit('voice_input', {
        text: text,
        session_id: this.sessionId,
        timestamp: new Date().toISOString()
      });
      
      // Show loading
      this.addMessage('assistant', 
        '<div class="loading-dots"><span></span><span></span><span></span></div>',
        'loading'
      );
      
      console.log('📤 Sent to server');
      
    } else {
      console.error('❌ Socket not connected');
      this.addMessage('assistant', 'Not connected to server. Please refresh the page.');
    }
  }
  
  handleVoiceResponse(data) {
    console.log('📥 Received response:', data);
    
    // Remove loading message
    const loadingMsg = this.conversationPane.querySelector('.loading');
    if (loadingMsg) {
      loadingMsg.parentElement.remove();
    }
    
    // Add assistant message
    this.addMessage('assistant', data.text);
    
    // Update status
    if (data.used_rag) {
      this.updateStatus('📚 Answer from documents', 'active');
    } else {
      this.updateStatus('🤖 General knowledge', 'active');
    }
    
    // Speak response
    if (this.voiceSettings.autoSpeak) {
      setTimeout(() => this.speak(data.text), 300);
    }
  }
  
  addMessage(role, text, className = '') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role} ${className}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.innerHTML = text;
    
    const timestamp = document.createElement('div');
    timestamp.className = 'message-time';
    timestamp.textContent = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    bubble.appendChild(timestamp);
    
    messageDiv.appendChild(bubble);
    this.conversationPane.appendChild(messageDiv);
    
    // Store in history
    this.messageHistory.push({ role, text, time: new Date() });
    
    // Scroll to bottom with smooth animation
    setTimeout(() => {
      this.conversationPane.scrollTo({
        top: this.conversationPane.scrollHeight,
        behavior: 'smooth'
      });
    }, 100);
  }
  
  // ========== TEXT-TO-SPEECH ==========
  
  loadVoices() {
    // Load available voices
    if ('speechSynthesis' in window) {
      const loadVoicesWhenReady = () => {
        const voices = this.synthesis.getVoices();
        if (voices.length > 0) {
          console.log(`✅ Loaded ${voices.length} voices`);
        } else {
          setTimeout(loadVoicesWhenReady, 100);
        }
      };
      
      if (this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = loadVoicesWhenReady;
      }
      
      loadVoicesWhenReady();
    }
  }
  
  speak(text) {
    if (!('speechSynthesis' in window)) {
      console.error('❌ Text-to-speech not supported');
      return;
    }
    
    // Cancel any ongoing speech
    this.synthesis.cancel();
    
    // Clean text
    const cleanText = text
      .replace(/<[^>]*>/g, '') // Remove HTML
      .replace(/\*\*/g, '') // Remove markdown
      .replace(/```[\s\S]*?```/g, ''); // Remove code blocks
    
    if (!cleanText.trim()) return;
    
    console.log('🔊 Speaking:', cleanText.substring(0, 50) + '...');
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = this.voiceSettings.rate;
    utterance.pitch = this.voiceSettings.pitch;
    utterance.volume = 1.0;
    utterance.lang = this.voiceSettings.language;
    
    // Select best voice
    const voices = this.synthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.startsWith('en') && 
      (voice.name.includes('Female') || voice.name.includes('Samantha'))
    ) || voices.find(voice => voice.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      console.log('🎤 Using voice:', preferredVoice.name);
    }
    
    utterance.onstart = () => {
      console.log('🔊 Speech started');
    };
    
    utterance.onend = () => {
      console.log('🔊 Speech ended');
    };
    
    utterance.onerror = (event) => {
      console.error('❌ Speech error:', event.error);
    };
    
    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);
  }
  
  // ========== TIMER ==========
  
  startTimer() {
    this.timerInterval = setInterval(() => {
      if (!this.callStartTime) return;
      
      const elapsed = Date.now() - this.callStartTime;
      const minutes = Math.floor(elapsed / 60000);
      const seconds = Math.floor((elapsed % 60000) / 1000);
      
      this.callTimer.textContent = 
        `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
  }
  
  // ========== STATUS UPDATES ==========
  
  updateStatus(message, state) {
    if (!this.callStatus) return;
    
    const dot = this.callStatus.querySelector('.status-dot');
    const text = this.callStatus.querySelector('span');
    
    if (text) text.textContent = message;
    
    if (dot) {
      if (state === 'active') {
        dot.className = 'status-dot bg-green-500';
      } else {
        dot.className = 'status-dot bg-slate-500';
      }
    }
  }
  
  updateRAGStatus(message, isConnected) {
    if (!this.ragStatus) return;
    
    const dot = this.ragStatus.querySelector('.w-2');
    const text = this.ragStatus.querySelector('span');
    
    if (text) text.textContent = `RAG: ${message}`;
    if (dot) {
      dot.className = `w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-slate-500'}`;
    }
  }
  
  updateMicStatus(message, isConnected) {
    if (!this.micStatus) return;
    
    const dot = this.micStatus.querySelector('.w-2');
    const text = this.micStatus.querySelector('span');
    
    if (text) text.textContent = `Microphone: ${message}`;
    if (dot) {
      dot.className = `w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`;
    }
  }
  
  // ========== SYSTEM CHECK ==========
  
  async checkSystemStatus() {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      
      console.log('📊 System health:', data);
      
      if (data.rag_ready) {
        this.updateRAGStatus(`Ready (${data.vector_count || 0} docs)`, true);
      } else {
        this.updateRAGStatus('Not ready', false);
      }
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      this.updateRAGStatus('Error', false);
    }
  }
}

// ========== INITIALIZE ON PAGE LOAD ==========

let voiceSystem;

document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Page loaded, initializing voice system...');
  
  try {
    voiceSystem = new VoiceCallSystem();
    window.voiceSystem = voiceSystem; // For debugging
    console.log('✅ Voice system ready');
  } catch (error) {
    console.error('❌ Failed to initialize:', error);
  }
});

// Add CSS for message timestamps
const style = document.createElement('style');
style.textContent = `
  .message-time {
    font-size: 0.7rem;
    opacity: 0.5;
    margin-top: 4px;
    text-align: right;
  }
`;
document.head.appendChild(style);