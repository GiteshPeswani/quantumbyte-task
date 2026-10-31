# PeerConnect — Peer-to-Peer Video Conferencing Desktop Application

A production-grade, Google Meet-inspired peer-to-peer (P2P) desktop video conferencing application built with **Electron.js**, **WebRTC**, **Vanilla JavaScript**, **HTML5/CSS3**, and a **Node.js + Express + Socket.IO** signaling server.

Audio and video media streams flow **directly between peers** using encrypted WebRTC peer connections. The signaling server is used exclusively to exchange session descriptions (SDP Offer/Answer) and ICE candidates.

---

## 1. Architecture Overview

```
                      +-----------------------------+
                      |   Express + Socket.IO       |
                      |   Signaling Server (:3000)  |
                      +--------------+--------------+
                                     ^
                    Signaling Only   |   Signaling Only
                 (Offer/Answer/ICE)  |  (Offer/Answer/ICE)
                                     v
+--------------------------+                   +--------------------------+
|  Peer A (Electron App)   | <===============> |  Peer B (Electron App)   |
|  - BrowserWindow         |      Direct       |  - BrowserWindow         |
|  - Preload IPC Bridge    |    P2P WebRTC     |  - Preload IPC Bridge    |
|  - Vanilla JS WebRTC     |   Audio & Video   |  - Vanilla JS WebRTC     |
+--------------------------+                   +--------------------------+
              \                                     /
               \                                   /
                \---> [ Google STUN Servers ] <---/
                      [ (Optional) TURN Relays ]
```

### Key Technical Pillars:
- **Electron Desktop Shell**: Secure `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, and camera/microphone permission handlers.
- **Vanilla Frontend**: Clean, modular vanilla JS, HTML5 semantic layout, and modern CSS3 dark theme inspired by Google Meet. Strictly zero frontend frameworks.
- **WebRTC Native APIs**: Direct browser-level WebRTC (`RTCPeerConnection`, `getUserMedia`, `createOffer`, `createAnswer`, `setLocalDescription`, `setRemoteDescription`, `addIceCandidate`).
- **Asynchronous ICE Handling**: Intelligent queuing mechanism to buffer ICE candidates arriving prior to remote description completion, eliminating candidate loss.
- **Socket.IO Signaling**: Real-time room management supporting up to 2 participants per room, automatic cleanup, and error reporting.

---

## 2. Project Structure

```
peer-connect/
│
├── electron/
│   ├── main.js             # Electron main process (lifecycle, permissions, IPC)
│   └── preload.js          # Secure context bridge (contextIsolation)
│
├── server/
│   └── server.js           # Express.js + Socket.IO signaling server
│
├── renderer/
│   ├── index.html          # Application structure (Lobby & Meeting screens)
│   ├── style.css           # Google Meet-inspired dark theme UI styles
│   ├── renderer.js         # WebRTC engine and frontend client logic
│   └── lib/
│       └── socket.io.js    # Self-contained Socket.IO client library
│
├── .env.example            # Environment variables template (STUN/TURN/Port)
├── .gitignore              # Git ignore rules
├── package.json            # Scripts and dependencies
└── README.md               # Complete documentation
```

---

## 3. Prerequisites

- **Node.js**: `v18.x` or higher (tested on Node.js 18+ and 20+)
- **npm**: `v9.x` or higher
- A working webcam and microphone (or virtual devices like OBS Virtual Camera).

---

## 4. Installation

Clone or navigate to the repository directory and install dependencies:

```bash
cd peer-connect
npm install
```

---

## 5. Starting the Application

You can start the entire application (both the signaling server and the Electron desktop app) with a single command, or start the server and client separately.

### Option A: Run Both Together (Recommended)
This command automatically boots the Express/Socket.IO signaling server and launches the Electron desktop app once the server is ready:

```bash
npm start
```

### Option B: Run Server and Electron Separately
In Terminal 1 (Start the Signaling Server):
```bash
npm run server
```
*The signaling server starts on `http://localhost:3000`.*

In Terminal 2 (Launch the Electron Desktop App):
```bash
npm run electron
```

---

## 6. How Two Different Users Connect

To test one-to-one peer-to-peer video calling:

### Scenario 1: Testing on a Single Computer (Two Instances)
1. Start the signaling server:
   ```bash
   npm run server
   ```
2. Open **Instance 1** in a new terminal:
   ```bash
   npm run electron
   ```
3. Open **Instance 2** in another terminal:
   ```bash
   npm run electron
   ```
4. On **Instance 1**:
   - Preview your camera in the green room.
   - Click **"New Meeting"**.
   - A unique Meeting ID (e.g. `pc-a1b2-c3d4`) will be generated.
   - Click the **"Copy Meeting ID"** button.
5. On **Instance 2**:
   - Paste the copied Meeting ID into the **"Enter Meeting ID"** input box.
   - Click **"Join"**.
6. Both instances will immediately negotiate WebRTC peer connections:
   - Status transitions from `Waiting for peer...` → `Connecting...` → `Connected (P2P)`.
   - Audio and video streams flow directly between the two windows.

---

### Scenario 2: Connecting Two Separate Computers Over a Local Network (LAN)
1. Identify the local IP address of Computer 1 (e.g. `192.168.1.50`).
2. On Computer 1:
   - Start the signaling server:
     ```bash
     npm run server
     ```
3. On Computer 2 (or in `.env` / in the app's "Server Settings" toggle):
   - Set the signaling server URL to `http://192.168.1.50:3000`.
4. Peer A clicks **"New Meeting"** on Computer 1.
5. Peer B enters the Meeting ID on Computer 2 and clicks **"Join"**.
6. Direct P2P video stream will be established across the LAN via STUN/host candidates.

---

## 7. Controls & Keyboard Shortcuts

| Control | Action | Keyboard Shortcut |
| :--- | :--- | :---: |
| **Microphone Button** | Mutes or unmutes your microphone | <kbd>M</kbd> |
| **Camera Button** | Enables or disables your webcam | <kbd>V</kbd> |
| **Copy Meeting ID** | Copies the active room ID to clipboard | — |
| **Diagnostics Button** | Opens WebRTC stats & ICE candidate monitor | — |
| **End Call Button** | Gracefully disconnects, stops media, returns to lobby | <kbd>Esc</kbd> *(closes modals)* |

---

## 8. WebRTC Signaling Flow Details

```
User A (Creator)              Signaling Server (:3000)              User B (Joiner)
       |                                |                                  |
       |--- create-room { roomId } ---->|                                  |
       |<-- ack { success: true } ------|                                  |
       |                                |                                  |
       |                                |<--- join-room { roomId } --------|
       |                                |--- ack { success: true } ------->|
       |<-- user-joined { peerId } -----|                                  |
       |                                |                                  |
   (Creates Offer)                      |                                  |
       |--- offer { sdp } ------------->|                                  |
       |                                |--- offer { sdp } --------------->|
       |                                |                            (Sets Remote SDP)
       |                                |                            (Creates Answer)
       |                                |<-- answer { sdp } ---------------|
       |<-- answer { sdp } -------------|                                  |
(Sets Remote SDP)                       |                                  |
       |                                |                                  |
       |<====== (Exchange ICE Candidates via 'ice-candidate' event) ======>|
       |                                |                                  |
       |===================================================================|
       |                DIRECT P2P MEDIA (Audio & Video)                   |
       |===================================================================|
```

### ICE Candidate Buffering Mechanism
In real-world networks, STUN ICE candidates frequently arrive from the signaling server *before* `setRemoteDescription()` has completed. PeerConnect solves this by:
1. Checking `pc.remoteDescription && pc.remoteDescription.type`.
2. Buffering any early candidates into `state.iceCandidateQueue`.
3. Draining the queue sequentially immediately after `setRemoteDescription` resolves.

---

## 9. Network Limitations & TURN Server Configuration

### Why STUN Is Not Always Sufficient
WebRTC uses **STUN (Session Traversal Utilities for NAT)** to discover a client's public IP address and port. STUN succeeds on:
- Open networks
- Full-cone NAT
- Address-restricted / port-restricted cone NAT

However, when one or both peers are behind **Symmetric NAT** (common in corporate firewalls, mobile 4G/5G networks, and restrictive university Wi-Fi), port mappings change dynamically for each remote destination. In this situation, direct P2P connections will fail to establish (`connectionState: 'failed'`).

### Configuring a TURN Relay Server
A **TURN (Traversal Using Relays around NAT)** server provides an encrypted relay fallback when direct peer connection is impossible.

PeerConnect supports dynamic TURN configuration via environment variables.

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
2. Specify your TURN credentials:
   ```env
   TURN_URL=turn:your-turn-server.com:3478?transport=udp
   TURN_USERNAME=myUser
   TURN_CREDENTIAL=mySecretPassword
   ```
3. Restart the signaling server (`npm run server`). PeerConnect will automatically distribute the TURN configuration to connecting peers upon room creation and join.

---

## 10. Security & Hardening

- **Electron Security**:
  - `contextIsolation: true` is strictly enforced.
  - `nodeIntegration: false` ensures renderer code cannot execute arbitrary Node.js scripts.
  - Sandboxed IPC bridge via `electron/preload.js`.
  - Media permissions dynamically granted through `session.defaultSession.setPermissionRequestHandler`.
- **Content Security Policy (CSP)**:
  - Enforced in `renderer/index.html` to prevent cross-site scripting (XSS).
- **In-Memory Ephemeral Rooms**:
  - No database storage. Room IDs and participant sockets are stored only in memory and destroyed immediately once all participants leave.
