/**
 * PeerConnect - Vanilla JavaScript Client & WebRTC Controller
 * Fully featured P2P Video Conferencing implementation.
 */

// Application State
const state = {
  socket: null,
  signalingServerUrl: 'http://localhost:3000',
  currentRoomId: null,
  isInitiator: false,
  peerConnection: null,
  localStream: null,
  remoteStream: null,
  isVirtualMedia: false,
  virtualAnimationId: null,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ],
  iceCandidateQueue: [],
  isMicMuted: false,
  isCameraOff: false,
  callStartTime: null,
  callTimerInterval: null,
  peerRole: 'None'
};

// DOM Elements
const elements = {
  // Views
  homeView: document.getElementById('homeView'),
  meetingView: document.getElementById('meetingView'),
  
  // Header & Status
  signalingStatus: document.getElementById('signalingStatus'),
  signalingStatusText: document.getElementById('signalingStatusText'),
  toastContainer: document.getElementById('toastContainer'),
  
  // Home Action Controls
  btnCreateMeeting: document.getElementById('btnCreateMeeting'),
  joinMeetingForm: document.getElementById('joinMeetingForm'),
  inputMeetingId: document.getElementById('inputMeetingId'),
  btnJoinMeeting: document.getElementById('btnJoinMeeting'),
  mediaPermissionBanner: document.getElementById('mediaPermissionBanner'),
  permissionStatusMsg: document.getElementById('permissionStatusMsg'),
  btnRetryMedia: document.getElementById('btnRetryMedia'),
  
  // Server Config Panel
  btnToggleServerConfig: document.getElementById('btnToggleServerConfig'),
  serverConfigPanel: document.getElementById('serverConfigPanel'),
  inputServerUrl: document.getElementById('inputServerUrl'),
  btnSaveServerUrl: document.getElementById('btnSaveServerUrl'),
  
  // Preview Elements
  previewVideo: document.getElementById('previewVideo'),
  previewVideoOffOverlay: document.getElementById('previewVideoOffOverlay'),
  btnPreviewMic: document.getElementById('btnPreviewMic'),
  btnPreviewCam: document.getElementById('btnPreviewCam'),
  previewAudioMeter: document.getElementById('previewAudioMeter'),
  
  // Meeting Header & Badges
  activeMeetingId: document.getElementById('activeMeetingId'),
  btnCopyMeetingId: document.getElementById('btnCopyMeetingId'),
  connectionStatusBadge: document.getElementById('connectionStatusBadge'),
  connectionStatusText: document.getElementById('connectionStatusText'),
  callDurationTimer: document.getElementById('callDurationTimer'),
  
  // Video Grid Elements
  videoGrid: document.getElementById('videoGrid'),
  localVideoTile: document.getElementById('localVideoTile'),
  localVideo: document.getElementById('localVideo'),
  localVideoOffOverlay: document.getElementById('localVideoOffOverlay'),
  localMutedIndicator: document.getElementById('localMutedIndicator'),
  
  remoteVideoTile: document.getElementById('remoteVideoTile'),
  remoteVideo: document.getElementById('remoteVideo'),
  remoteVideoOffOverlay: document.getElementById('remoteVideoOffOverlay'),
  remoteAudioIndicator: document.getElementById('remoteAudioIndicator'),
  
  // Waiting Overlay
  waitingForPeerCard: document.getElementById('waitingForPeerCard'),
  shareMeetingId: document.getElementById('shareMeetingId'),
  btnWaitingCopyId: document.getElementById('btnWaitingCopyId'),
  
  // Dock Controls
  btnCallMic: document.getElementById('btnCallMic'),
  btnCallCam: document.getElementById('btnCallCam'),
  btnDockCopyId: document.getElementById('btnDockCopyId'),
  btnToggleStats: document.getElementById('btnToggleStats'),
  btnEndCall: document.getElementById('btnEndCall'),
  
  // Diagnostics
  statsModal: document.getElementById('statsModal'),
  btnCloseStats: document.getElementById('btnCloseStats'),
  statIceState: document.getElementById('statIceState'),
  statSignalingState: document.getElementById('statSignalingState'),
  statPeerRole: document.getElementById('statPeerRole'),
  statCandidateType: document.getElementById('statCandidateType'),
  statServerUrl: document.getElementById('statServerUrl')
};

// ====================================================
// INITIALIZATION
// ====================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('[PeerConnect] Initializing desktop renderer...');

  // Read environment configuration via Electron Preload if present
  if (window.electronAPI && typeof window.electronAPI.getServerConfig === 'function') {
    try {
      const config = await window.electronAPI.getServerConfig();
      if (config && config.serverUrl) {
        state.signalingServerUrl = config.serverUrl;
        elements.inputServerUrl.value = config.serverUrl;
        elements.statServerUrl.textContent = config.serverUrl;
        console.log(`[PeerConnect] Received signaling server URL from Electron: ${config.serverUrl}`);
      }
    } catch (err) {
      console.warn('[PeerConnect] Failed reading config from electronAPI:', err);
    }
  } else if (window.location && window.location.protocol.startsWith('http')) {
    // When opened in a mobile/web browser, automatically connect to the serving host
    state.signalingServerUrl = window.location.origin;
    elements.inputServerUrl.value = window.location.origin;
    elements.statServerUrl.textContent = window.location.origin;
    console.log(`[PeerConnect] Auto-configured signaling server URL for mobile/browser: ${window.location.origin}`);
  }

  // Bind UI Events
  registerEventHandlers();

  // Start local media stream for green room preview
  await initializeLocalMedia();

  // Connect to the signaling server
  connectSignalingServer();
});

/**
 * Register all UI click and input event handlers
 */
function registerEventHandlers() {
  // Home view interactions
  elements.btnCreateMeeting.addEventListener('click', handleCreateMeeting);
  elements.joinMeetingForm.addEventListener('submit', handleJoinMeeting);
  elements.btnRetryMedia.addEventListener('click', () => {
    initializeLocalMedia(true, true);
  });

  // Server settings toggle
  elements.btnToggleServerConfig.addEventListener('click', () => {
    elements.serverConfigPanel.classList.toggle('hidden');
  });

  elements.btnSaveServerUrl.addEventListener('click', () => {
    const newUrl = elements.inputServerUrl.value.trim();
    if (newUrl) {
      state.signalingServerUrl = newUrl;
      elements.statServerUrl.textContent = newUrl;
      showToast(`Reconnecting to ${newUrl}...`, 'info');
      connectSignalingServer();
    }
  });

  // Green Room Preview Controls
  elements.btnPreviewMic.addEventListener('click', toggleMicrophone);
  elements.btnPreviewCam.addEventListener('click', toggleCamera);

  // In-Call Controls
  elements.btnCallMic.addEventListener('click', toggleMicrophone);
  elements.btnCallCam.addEventListener('click', toggleCamera);
  elements.btnEndCall.addEventListener('click', () => endCall(true));

  // Copy Meeting ID buttons
  elements.btnCopyMeetingId.addEventListener('click', copyMeetingIdToClipboard);
  elements.btnWaitingCopyId.addEventListener('click', copyMeetingIdToClipboard);
  elements.btnDockCopyId.addEventListener('click', copyMeetingIdToClipboard);

  // Stats Diagnostics Popover
  elements.btnToggleStats.addEventListener('click', () => {
    elements.statsModal.classList.toggle('hidden');
  });
  elements.btnCloseStats.addEventListener('click', () => {
    elements.statsModal.classList.add('hidden');
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Avoid triggering shortcuts while typing inside inputs
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

    if (e.key === 'm' || e.key === 'M') {
      toggleMicrophone();
    } else if (e.key === 'v' || e.key === 'V') {
      toggleCamera();
    } else if (e.key === 'Escape') {
      elements.statsModal.classList.add('hidden');
    }
  });
}

// ====================================================
// MEDIA DEVICE HANDLING (WEBCAM & MICROPHONE)
// ====================================================

/**
 * Create a virtual test video track using an HTML5 Canvas.
 * Essential for testing multiple instances on a single Windows machine,
 * where the physical webcam cannot be shared across multiple processes.
 */
function createVirtualVideoTrack(label = 'Peer User') {
  if (state.virtualAnimationId) {
    cancelAnimationFrame(state.virtualAnimationId);
    state.virtualAnimationId = null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  let angle = 0;

  function renderFrame() {
    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#1c1f26');
    grad.addColorStop(1, '#0e1014');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Dynamic grid overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Avatar center
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2 - 25;

    // Outer animated glow ring
    ctx.beginPath();
    ctx.arc(centerX, centerY, 52 + Math.sin(angle) * 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(26, 115, 232, 0.2)';
    ctx.fill();

    // Inner avatar circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 44, 0, Math.PI * 2);
    ctx.fillStyle = '#1a73e8';
    ctx.fill();

    // Avatar initials
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P2P', centerX, centerY);

    // Label
    ctx.fillStyle = '#e8eaed';
    ctx.font = '600 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, centerX, centerY + 65);

    // Virtual badge
    ctx.fillStyle = '#fbbc04';
    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('Virtual Test Camera (Hardware in use)', centerX, centerY + 88);

    angle += 0.04;
    state.virtualAnimationId = requestAnimationFrame(renderFrame);
  }
  renderFrame();

  const stream = canvas.captureStream(30);
  const track = stream.getVideoTracks()[0];
  return track;
}

/**
 * Create a virtual test audio track using Web Audio API (silent stream)
 */
function createVirtualAudioTrack() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContextClass();
    const dest = audioCtx.createMediaStreamDestination();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0; // Muted tone to prevent noise
    osc.connect(gain);
    gain.connect(dest);
    osc.start();
    return dest.stream.getAudioTracks()[0];
  } catch (e) {
    console.warn('[Media] Web Audio virtual track failed, using silent stream:', e);
    return null;
  }
}

/**
 * Attach stream to local preview and state
 */
function setLocalStream(stream, isVirtual = false) {
  // If previous stream had active tracks, stop them if hardware
  if (state.localStream && state.localStream !== stream && !state.isVirtualMedia) {
    state.localStream.getTracks().forEach(t => t.stop());
  }

  state.localStream = stream;
  state.isVirtualMedia = isVirtual;

  // Mirror physical webcam for natural mirror self-view, but keep virtual camera unmirrored for readable text
  if (isVirtual) {
    elements.previewVideo.classList.remove('mirrored');
    elements.localVideo.classList.remove('mirrored');
  } else {
    elements.previewVideo.classList.add('mirrored');
    elements.localVideo.classList.add('mirrored');
  }

  // Attach to Preview Video
  elements.previewVideo.srcObject = stream;
  elements.previewVideo.onloadedmetadata = () => {
    elements.previewVideo.play().catch(console.error);
  };

  updateMediaButtonStates();
}

/**
 * Acquire local media stream using navigator.mediaDevices.getUserMedia
 * Includes intelligent automatic fallback to virtual camera when hardware
 * is already in use by another instance or application on Windows.
 */
async function initializeLocalMedia(allowFallback = true, isManualRetry = false) {
  try {
    updatePermissionStatus('Requesting camera & microphone access...', 'info');

    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Hardware access succeeded!
    setLocalStream(stream, false);
    updatePermissionStatus('Camera & Microphone connected successfully.', 'success', false);
    if (isManualRetry) {
      showToast('Hardware camera connected successfully!', 'success');
    }
    return true;
  } catch (error) {
    console.warn('[Media] getUserMedia hardware error:', error);
    let errorMsg = 'Failed to access camera and microphone.';

    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      errorMsg = 'Permission denied. Please grant camera and microphone access in Windows Settings.';
    } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      errorMsg = 'No camera or microphone hardware found on this PC.';
    } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      errorMsg = 'Camera is in use by another application or window.';
    }

    if (allowFallback) {
      console.log('[Media] Hardware camera unavailable. Activating virtual test media stream...');
      
      // Attempt to acquire real microphone if only video is locked
      let audioTrack = null;
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioTrack = audioStream.getAudioTracks()[0];
        console.log('[Media] Physical microphone connected.');
      } catch (audioErr) {
        console.log('[Media] Physical microphone unavailable, generating virtual audio.');
        audioTrack = createVirtualAudioTrack();
      }

      // Generate virtual video track
      const videoTrack = createVirtualVideoTrack('PeerConnect User');
      const tracks = [videoTrack];
      if (audioTrack) tracks.push(audioTrack);
      const fallbackStream = new MediaStream(tracks);

      setLocalStream(fallbackStream, true);
      updatePermissionStatus(
        `${errorMsg} Virtual camera activated for testing.`,
        'warning',
        true
      );
      showToast('Virtual camera activated (hardware in use). You can create or join meetings now!', 'info');
      return true;
    }

    updatePermissionStatus(errorMsg, 'error', true);
    showToast(errorMsg, 'error');
    return false;
  }
}

/**
 * Update media status banner on home screen
 */
function updatePermissionStatus(message, type = 'info', showRetry = false) {
  elements.permissionStatusMsg.textContent = message;
  elements.mediaPermissionBanner.className = `permission-banner ${type}`;
  if (elements.btnRetryMedia) {
    elements.btnRetryMedia.classList.toggle('hidden', !showRetry);
  }
}

/**
 * Toggle Microphone Audio Track
 */
function toggleMicrophone() {
  if (!state.localStream) return;

  const audioTracks = state.localStream.getAudioTracks();
  if (audioTracks.length === 0) return;

  state.isMicMuted = !state.isMicMuted;
  audioTracks.forEach(track => {
    track.enabled = !state.isMicMuted;
  });

  updateMediaButtonStates();
  showToast(state.isMicMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
}

/**
 * Toggle Camera Video Track
 */
function toggleCamera() {
  if (!state.localStream) return;

  const videoTracks = state.localStream.getVideoTracks();
  if (videoTracks.length === 0) return;

  state.isCameraOff = !state.isCameraOff;
  videoTracks.forEach(track => {
    track.enabled = !state.isCameraOff;
  });

  updateMediaButtonStates();
  showToast(state.isCameraOff ? 'Camera turned off' : 'Camera turned on', 'info');
}

/**
 * Sync UI control buttons and overlay states for mic/cam
 */
function updateMediaButtonStates() {
  // Sync Preview Buttons
  updateButtonIconState(elements.btnPreviewMic, state.isMicMuted);
  updateButtonIconState(elements.btnPreviewCam, state.isCameraOff);

  // Sync Meeting Dock Buttons
  updateButtonIconState(elements.btnCallMic, state.isMicMuted);
  updateButtonIconState(elements.btnCallCam, state.isCameraOff);

  // Sync Video Off Overlays
  elements.previewVideoOffOverlay.classList.toggle('hidden', !state.isCameraOff);
  elements.localVideoOffOverlay.classList.toggle('hidden', !state.isCameraOff);

  // Sync Local Muted indicator badge
  elements.localMutedIndicator.classList.toggle('hidden', !state.isMicMuted);

  // Sync audio label
  elements.previewAudioMeter.textContent = state.isMicMuted ? 'Microphone muted' : 'Microphone active';
}

function updateButtonIconState(btn, isOff) {
  if (!btn) return;
  const iconOn = btn.querySelector('.icon-on');
  const iconOff = btn.querySelector('.icon-off');

  if (isOff) {
    btn.classList.add('off');
    if (iconOn) iconOn.classList.add('hidden');
    if (iconOff) iconOff.classList.remove('hidden');
  } else {
    btn.classList.remove('off');
    if (iconOn) iconOn.classList.remove('hidden');
    if (iconOff) iconOff.classList.add('hidden');
  }
}

// ====================================================
// SIGNALING SERVER (SOCKET.IO) CONNECTION
// ====================================================

function connectSignalingServer() {
  if (state.socket) {
    state.socket.disconnect();
  }

  updateSignalingStatus('connecting', 'Connecting to server...');

  try {
    state.socket = io(state.signalingServerUrl, {
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000
    });

    state.socket.on('connect', () => {
      console.log(`[Socket] Connected to signaling server with ID: ${state.socket.id}`);
      updateSignalingStatus('online', 'Signaling: Connected');
    });

    state.socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
      updateSignalingStatus('offline', 'Signaling: Offline');
    });

    state.socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected from signaling server (${reason})`);
      updateSignalingStatus('offline', 'Signaling: Disconnected');
    });

    // Handle incoming WebRTC signaling events
    registerSignalingEvents();
  } catch (err) {
    console.error('[Socket] Initialization error:', err);
    updateSignalingStatus('offline', 'Signaling: Connection Failed');
  }
}

function updateSignalingStatus(status, text) {
  elements.signalingStatus.className = `signaling-badge ${status}`;
  elements.signalingStatusText.textContent = text;
}

/**
 * Register WebRTC signaling handlers from Socket.IO
 */
function registerSignalingEvents() {
  if (!state.socket) return;

  // Peer joined the room (received by Creator / Initiator)
  state.socket.on('user-joined', async ({ peerId }) => {
    console.log(`[Signaling] Peer ${peerId} joined the meeting. Initiating WebRTC offer...`);
    showToast('Participant joined the meeting!', 'info');
    
    // Creator initiates the call
    await startCallAsInitiator();
  });

  // WebRTC Offer received (received by Joiner)
  state.socket.on('offer', async ({ offer, senderId }) => {
    console.log(`[Signaling] Received WebRTC offer from ${senderId}`);
    await handleReceivedOffer(offer);
  });

  // WebRTC Answer received (received by Creator)
  state.socket.on('answer', async ({ answer, senderId }) => {
    console.log(`[Signaling] Received WebRTC answer from ${senderId}`);
    await handleReceivedAnswer(answer);
  });

  // ICE Candidate received
  state.socket.on('ice-candidate', async ({ candidate, senderId }) => {
    await handleReceivedIceCandidate(candidate);
  });

  // Peer disconnected
  state.socket.on('user-disconnected', ({ peerId }) => {
    console.log(`[Signaling] Peer ${peerId} disconnected.`);
    handlePeerDisconnection();
  });
}

// ====================================================
// ROOM CREATION & JOINING WORKFLOW
// ====================================================

/**
 * Handle "New Meeting" click
 */
async function handleCreateMeeting() {
  const mediaReady = await ensureMediaStreamReady();
  if (!mediaReady) return;
  if (!ensureSocketReady()) return;

  // Generate unique room ID formatted like: pc-xxxx-xxxx
  const roomId = generateRoomId();
  state.isInitiator = true;
  state.peerRole = 'Caller (Initiator)';
  elements.statPeerRole.textContent = state.peerRole;

  console.log(`[Room] Creating room: ${roomId}`);

  state.socket.emit('create-room', { roomId }, (response) => {
    if (response && response.success) {
      state.currentRoomId = response.roomId;
      if (response.iceServers) {
        state.iceServers = response.iceServers;
      }
      enterMeetingRoom(response.roomId);
      showToast('Meeting created! Share ID to invite a peer.', 'success');
    } else {
      const errMsg = response?.error || 'Failed to create meeting room.';
      showToast(errMsg, 'error');
    }
  });
}

/**
 * Handle "Join Meeting" form submission
 */
async function handleJoinMeeting(e) {
  e.preventDefault();
  const mediaReady = await ensureMediaStreamReady();
  if (!mediaReady) return;
  if (!ensureSocketReady()) return;

  const rawInput = elements.inputMeetingId.value.trim();
  if (!rawInput) {
    showToast('Please enter a valid Meeting ID.', 'error');
    return;
  }

  const roomId = rawInput.toLowerCase();
  state.isInitiator = false;
  state.peerRole = 'Callee (Receiver)';
  elements.statPeerRole.textContent = state.peerRole;

  console.log(`[Room] Requesting to join room: ${roomId}`);

  state.socket.emit('join-room', { roomId }, (response) => {
    if (response && response.success) {
      state.currentRoomId = response.roomId;
      if (response.iceServers) {
        state.iceServers = response.iceServers;
      }
      enterMeetingRoom(response.roomId);
      showToast('Joined meeting successfully.', 'success');
    } else {
      const errMsg = response?.error || 'Failed to join meeting room.';
      showToast(errMsg, 'error');
    }
  });
}

/**
 * Transition from Home View to Meeting View
 */
function enterMeetingRoom(roomId) {
  // Update Meeting ID displays
  elements.activeMeetingId.textContent = roomId;
  elements.shareMeetingId.textContent = roomId;

  // Transfer local stream to active meeting video element
  if (state.localStream) {
    if (state.isVirtualMedia) {
      elements.localVideo.classList.remove('mirrored');
    } else {
      elements.localVideo.classList.add('mirrored');
    }
    elements.localVideo.srcObject = state.localStream;
    elements.localVideo.play().catch(console.error);
  }

  // Switch visible screen
  elements.homeView.classList.remove('active');
  elements.meetingView.classList.add('active');

  // Initial meeting UI states
  elements.waitingForPeerCard.classList.remove('hidden');
  elements.remoteVideoTile.classList.add('hidden');
  elements.videoGrid.className = 'video-grid single-peer';
  updateConnectionBadge('waiting', 'Waiting for peer...');
}

// ====================================================
// WEBRTC PEER CONNECTION IMPLEMENTATION
// ====================================================

/**
 * Create and configure RTCPeerConnection instance
 */
function createPeerConnection() {
  if (state.peerConnection) {
    console.log('[WebRTC] Closing existing peer connection...');
    state.peerConnection.close();
    state.peerConnection = null;
  }

  console.log('[WebRTC] Creating RTCPeerConnection with ICE servers:', state.iceServers);

  const pc = new RTCPeerConnection({
    iceServers: state.iceServers,
    iceCandidatePoolSize: 10
  });

  state.iceCandidateQueue = [];

  // 1. Add local media tracks to connection
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => {
      console.log(`[WebRTC] Adding local track: ${track.kind} (${track.id})`);
      pc.addTrack(track, state.localStream);
    });
  } else {
    console.warn('[WebRTC] No local media stream available to add tracks!');
  }

  // 2. Handle remote stream tracks (ontrack)
  pc.ontrack = (event) => {
    console.log(`[WebRTC] Received remote track: ${event.track.kind}`);

    if (event.streams && event.streams[0]) {
      state.remoteStream = event.streams[0];
      elements.remoteVideo.srcObject = state.remoteStream;
    } else {
      if (!state.remoteStream) {
        state.remoteStream = new MediaStream();
        elements.remoteVideo.srcObject = state.remoteStream;
      }
      state.remoteStream.addTrack(event.track);
    }

    // Monitor track mute states
    event.track.onmute = () => {
      console.log(`[WebRTC] Remote track muted: ${event.track.kind}`);
      if (event.track.kind === 'video') {
        elements.remoteVideoOffOverlay.classList.remove('hidden');
      }
    };

    event.track.onunmute = () => {
      console.log(`[WebRTC] Remote track unmuted: ${event.track.kind}`);
      if (event.track.kind === 'video') {
        elements.remoteVideoOffOverlay.classList.add('hidden');
      }
    };
  };

  // 3. Handle local ICE candidates (onicecandidate)
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      // Diagnostic tracking of candidate type (host, srflx/STUN, relay/TURN)
      const candType = event.candidate.type || 'unknown';
      elements.statCandidateType.textContent = candType.toUpperCase();

      state.socket.emit('ice-candidate', {
        roomId: state.currentRoomId,
        candidate: event.candidate
      });
    } else {
      console.log('[WebRTC] All local ICE candidates gathered.');
    }
  };

  // 4. Connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`[WebRTC] Connection state: ${pc.connectionState}`);
    handleConnectionStateChange(pc.connectionState);
  };

  // 5. ICE connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log(`[WebRTC] ICE connection state: ${pc.iceConnectionState}`);
    elements.statIceState.textContent = pc.iceConnectionState;
  };

  // 6. Signaling state changes
  pc.onsignalingstatechange = () => {
    console.log(`[WebRTC] Signaling state: ${pc.signalingState}`);
    elements.statSignalingState.textContent = pc.signalingState;
  };

  state.peerConnection = pc;
  return pc;
}

/**
 * Caller flow: Create WebRTC Offer and send via signaling server
 */
async function startCallAsInitiator() {
  try {
    updateConnectionBadge('connecting', 'Connecting...');
    const pc = createPeerConnection();

    // Create SDP Offer
    console.log('[WebRTC] Creating offer...');
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });

    console.log('[WebRTC] Setting local description (Offer)...');
    await pc.setLocalDescription(offer);

    // Send offer to peer through signaling server
    console.log('[WebRTC] Emitting offer to signaling server...');
    state.socket.emit('offer', {
      roomId: state.currentRoomId,
      offer: pc.localDescription
    });

    // Prepare UI for active peer
    prepareUiForPeerConnection();
  } catch (error) {
    console.error('[WebRTC] Error initiating call offer:', error);
    showToast('Failed to create WebRTC connection offer.', 'error');
  }
}

/**
 * Callee flow: Handle received WebRTC Offer, create SDP Answer and reply
 */
async function handleReceivedOffer(offer) {
  try {
    updateConnectionBadge('connecting', 'Connecting...');
    const pc = createPeerConnection();

    console.log('[WebRTC] Setting remote description from received offer...');
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Drain any ICE candidates received before remote description was ready
    await drainQueuedIceCandidates();

    console.log('[WebRTC] Creating answer...');
    const answer = await pc.createAnswer();

    console.log('[WebRTC] Setting local description (Answer)...');
    await pc.setLocalDescription(answer);

    console.log('[WebRTC] Emitting answer to signaling server...');
    state.socket.emit('answer', {
      roomId: state.currentRoomId,
      answer: pc.localDescription
    });

    // Prepare UI for active peer
    prepareUiForPeerConnection();
  } catch (error) {
    console.error('[WebRTC] Error handling received offer:', error);
    showToast('Failed to process connection offer.', 'error');
  }
}

/**
 * Caller flow: Handle received WebRTC Answer from peer
 */
async function handleReceivedAnswer(answer) {
  try {
    if (!state.peerConnection) {
      console.warn('[WebRTC] Received answer but RTCPeerConnection is null.');
      return;
    }

    console.log('[WebRTC] Setting remote description from received answer...');
    await state.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));

    // Drain queued candidates if any
    await drainQueuedIceCandidates();
  } catch (error) {
    console.error('[WebRTC] Error handling received answer:', error);
    showToast('Failed to establish peer connection.', 'error');
  }
}

/**
 * Asynchronous ICE Candidate handler with queuing support
 */
async function handleReceivedIceCandidate(candidate) {
  try {
    if (!candidate) return;

    const pc = state.peerConnection;

    // Check if remote description is set and ready
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      // Queue candidate for processing once remote description is set
      console.log('[WebRTC] Queuing ICE candidate (remote description not ready yet)');
      state.iceCandidateQueue.push(candidate);
    }
  } catch (error) {
    console.error('[WebRTC] Error adding received ICE candidate:', error);
  }
}

/**
 * Drain and apply all queued ICE candidates
 */
async function drainQueuedIceCandidates() {
  if (!state.peerConnection || state.iceCandidateQueue.length === 0) return;

  console.log(`[WebRTC] Draining ${state.iceCandidateQueue.length} queued ICE candidates...`);
  while (state.iceCandidateQueue.length > 0) {
    const candidate = state.iceCandidateQueue.shift();
    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] Error applying queued candidate:', err);
    }
  }
}

/**
 * Handle connection state transitions
 */
function handleConnectionStateChange(connectionState) {
  switch (connectionState) {
    case 'connected':
      updateConnectionBadge('connected', 'Connected (P2P)');
      showToast('Peer-to-peer connection established!', 'success');
      startCallTimer();
      break;

    case 'connecting':
      updateConnectionBadge('connecting', 'Connecting...');
      break;

    case 'disconnected':
      updateConnectionBadge('waiting', 'Reconnecting...');
      showToast('Connection interrupted. Reconnecting...', 'info');
      break;

    case 'failed':
      updateConnectionBadge('disconnected', 'Connection Failed');
      showToast('P2P connection failed. A TURN server may be required on this network.', 'error');
      break;

    case 'closed':
      updateConnectionBadge('disconnected', 'Closed');
      break;
  }
}

/**
 * Adjust UI elements when a peer connects
 */
function prepareUiForPeerConnection() {
  elements.waitingForPeerCard.classList.add('hidden');
  elements.remoteVideoTile.classList.remove('hidden');
  elements.videoGrid.className = 'video-grid two-peers';
}

/**
 * Handle remote participant leaving or disconnecting
 */
function handlePeerDisconnection() {
  showToast('Remote participant left the meeting.', 'info');

  // Close peer connection
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }

  // Clear remote video
  if (elements.remoteVideo.srcObject) {
    elements.remoteVideo.srcObject = null;
  }
  state.remoteStream = null;

  // Reset timer
  stopCallTimer();

  // Reset UI back to waiting state
  elements.remoteVideoTile.classList.add('hidden');
  elements.waitingForPeerCard.classList.remove('hidden');
  elements.videoGrid.className = 'video-grid single-peer';
  updateConnectionBadge('waiting', 'Waiting for peer...');
}

// ====================================================
// CALL TERMINATION & CLEANUP
// ====================================================

/**
 * End Call / Leave Meeting
 */
function endCall(notifyServer = true) {
  console.log('[Call] Ending call and resetting application state...');

  // 1. Notify signaling server
  if (notifyServer && state.socket && state.currentRoomId) {
    state.socket.emit('leave-room', { roomId: state.currentRoomId });
  }

  // 2. Close WebRTC RTCPeerConnection
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }

  // 3. Clear remote streams
  if (elements.remoteVideo.srcObject) {
    elements.remoteVideo.srcObject = null;
  }
  state.remoteStream = null;

  // 4. Reset timer
  stopCallTimer();

  // 5. Reset state flags
  state.currentRoomId = null;
  state.isInitiator = false;
  state.peerRole = 'None';
  elements.statPeerRole.textContent = 'None';
  elements.statIceState.textContent = 'new';
  elements.statSignalingState.textContent = 'stable';

  // 6. Transition back to Home Screen
  elements.meetingView.classList.remove('active');
  elements.homeView.classList.add('active');

  // 7. Ensure local preview video is active
  if (state.localStream) {
    elements.previewVideo.srcObject = state.localStream;
    elements.previewVideo.play().catch(console.error);
  }

  elements.statsModal.classList.add('hidden');
  showToast('Call ended.', 'info');
}

// ====================================================
// TIMER & STATUS UTILITIES
// ====================================================

function startCallTimer() {
  stopCallTimer();
  state.callStartTime = Date.now();
  elements.callDurationTimer.textContent = '00:00';

  state.callTimerInterval = setInterval(() => {
    const elapsedSeconds = Math.floor((Date.now() - state.callStartTime) / 1000);
    const minutes = Math.floor(elapsedSeconds / 60).toString().padStart(2, '0');
    const seconds = (elapsedSeconds % 60).toString().padStart(2, '0');
    elements.callDurationTimer.textContent = `${minutes}:${seconds}`;
  }, 1000);
}

function stopCallTimer() {
  if (state.callTimerInterval) {
    clearInterval(state.callTimerInterval);
    state.callTimerInterval = null;
  }
  elements.callDurationTimer.textContent = '00:00';
}

function updateConnectionBadge(statusClass, text) {
  elements.connectionStatusBadge.className = `connection-status-badge ${statusClass}`;
  elements.connectionStatusText.textContent = text;
}

// ====================================================
// CLIPBOARD & TOAST NOTIFICATION HELPERS
// ====================================================

async function copyMeetingIdToClipboard() {
  if (!state.currentRoomId) return;

  const textToCopy = state.currentRoomId;
  let copied = false;

  // Try Electron IPC bridge first
  if (window.electronAPI && typeof window.electronAPI.copyToClipboard === 'function') {
    try {
      copied = await window.electronAPI.copyToClipboard(textToCopy);
    } catch (err) {
      console.warn('Electron copy error:', err);
    }
  }

  // Fallback to Web standard API
  if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(textToCopy);
      copied = true;
    } catch (err) {
      console.warn('Clipboard writeText error:', err);
    }
  }

  if (copied) {
    showToast(`Copied Meeting ID: ${textToCopy}`, 'success');
  } else {
    showToast('Failed to copy. Please manually select the Meeting ID.', 'error');
  }
}

/**
 * Display toast notification at top-right
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  // Auto remove after 3.5 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(40px)';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3500);
}

// ====================================================
// HELPER UTILITIES
// ====================================================

function generateRoomId() {
  const part1 = Math.random().toString(36).substring(2, 6);
  const part2 = Math.random().toString(36).substring(2, 6);
  return `pc-${part1}-${part2}`;
}

async function ensureMediaStreamReady() {
  if (!state.localStream) {
    const success = await initializeLocalMedia(true);
    if (!success) {
      showToast('Camera and microphone access is required to make a call.', 'error');
      return false;
    }
  }
  return true;
}

function ensureSocketReady() {
  if (!state.socket || !state.socket.connected) {
    showToast('Signaling server is not connected. Please check server status.', 'error');
    return false;
  }
  return true;
}
