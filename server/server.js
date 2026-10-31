/**
 * PeerConnect Signaling Server
 * Built with Express.js and Socket.IO
 * Facilitates WebRTC signaling (Offer, Answer, ICE Candidates) and room management.
 */

require('dotenv').config();
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const cors = require('cors');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve the frontend web application statically for mobile browsers and web clients
app.use(express.static(path.join(__dirname, '..', 'renderer')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// In-memory data store for rooms and socket associations
// Room structure: roomId -> { id, creator, participants: [socketId, ...], createdAt }
const rooms = new Map();
// Socket association: socketId -> roomId
const socketToRoom = new Map();

/**
 * Helper to build ICE configuration (STUN/TURN) dynamically
 */
function getIceServerConfiguration() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ];

  // Optional TURN configuration via environment variables
  if (process.env.TURN_URL) {
    const turnConfig = {
      urls: process.env.TURN_URL
    };
    if (process.env.TURN_USERNAME) {
      turnConfig.username = process.env.TURN_USERNAME;
    }
    if (process.env.TURN_CREDENTIAL) {
      turnConfig.credential = process.env.TURN_CREDENTIAL;
    }
    iceServers.push(turnConfig);
    console.log('[ICE] Configured custom TURN server from environment variables.');
  }

  return iceServers;
}

// REST Endpoints
app.get('/status', (req, res) => {
  res.json({
    name: 'PeerConnect Signaling Server',
    status: 'online',
    timestamp: new Date().toISOString(),
    activeRooms: rooms.size
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', activeRooms: rooms.size });
});

app.get('/api/ice-servers', (req, res) => {
  res.json({
    iceServers: getIceServerConfiguration()
  });
});

app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ exists: false, message: 'Room not found' });
  }
  return res.json({
    exists: true,
    roomId: room.id,
    participantCount: room.participants.length,
    isFull: room.participants.length >= 2
  });
});

/**
 * Socket.IO Connection and Signaling Logic
 */
io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Create a new meeting room
  socket.on('create-room', ({ roomId }, callback) => {
    try {
      console.log(`[create-room] Request by ${socket.id} for roomId: ${roomId}`);

      if (!roomId) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Room ID is required.' });
        }
        return;
      }

      // Check if room already exists with participants
      if (rooms.has(roomId)) {
        const existingRoom = rooms.get(roomId);
        if (existingRoom.participants.length > 0) {
          console.warn(`[create-room] Room ${roomId} already exists and is active.`);
          if (typeof callback === 'function') {
            return callback({ success: false, error: 'Meeting ID already active. Please generate a new one.' });
          }
          return;
        }
      }

      // Create room record
      const roomData = {
        id: roomId,
        creator: socket.id,
        participants: [socket.id],
        createdAt: new Date().toISOString()
      };

      rooms.set(roomId, roomData);
      socketToRoom.set(socket.id, roomId);
      socket.join(roomId);

      console.log(`[create-room] Room ${roomId} created by ${socket.id}`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          iceServers: getIceServerConfiguration()
        });
      }
    } catch (err) {
      console.error(`[create-room] Error:`, err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Internal server error while creating room.' });
      }
    }
  });

  // Join an existing meeting room
  socket.on('join-room', ({ roomId }, callback) => {
    try {
      console.log(`[join-room] Request by ${socket.id} to join roomId: ${roomId}`);

      if (!roomId) {
        if (typeof callback === 'function') {
          return callback({ success: false, error: 'Room ID is required.' });
        }
        return;
      }

      const room = rooms.get(roomId);

      // Validate room existence
      if (!room) {
        console.warn(`[join-room] Room ${roomId} does not exist.`);
        if (typeof callback === 'function') {
          return callback({
            success: false,
            error: 'Meeting room not found. Please verify the Meeting ID.'
          });
        }
        return;
      }

      // Validate 2-participant limit
      if (room.participants.length >= 2 && !room.participants.includes(socket.id)) {
        console.warn(`[join-room] Room ${roomId} is full (max 2 participants).`);
        if (typeof callback === 'function') {
          return callback({
            success: false,
            error: 'Meeting room is full (maximum 2 participants allowed).'
          });
        }
        return;
      }

      // Add participant if not already present
      if (!room.participants.includes(socket.id)) {
        room.participants.push(socket.id);
      }

      socketToRoom.set(socket.id, roomId);
      socket.join(roomId);

      console.log(`[join-room] Socket ${socket.id} joined room ${roomId}. Participants: ${room.participants.length}`);

      if (typeof callback === 'function') {
        callback({
          success: true,
          roomId,
          iceServers: getIceServerConfiguration()
        });
      }

      // Notify the other participant in the room that a peer joined
      socket.to(roomId).emit('user-joined', {
        peerId: socket.id
      });
      console.log(`[join-room] Emitted 'user-joined' to room ${roomId}`);
    } catch (err) {
      console.error(`[join-room] Error:`, err);
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Internal server error while joining room.' });
      }
    }
  });

  // Relay WebRTC Offer
  socket.on('offer', ({ roomId, offer }) => {
    console.log(`[offer] Relaying WebRTC offer from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('offer', {
      offer,
      senderId: socket.id
    });
  });

  // Relay WebRTC Answer
  socket.on('answer', ({ roomId, answer }) => {
    console.log(`[answer] Relaying WebRTC answer from ${socket.id} in room ${roomId}`);
    socket.to(roomId).emit('answer', {
      answer,
      senderId: socket.id
    });
  });

  // Relay ICE Candidate
  socket.on('ice-candidate', ({ roomId, candidate }) => {
    // ICE candidates are frequent, so we log lightly
    socket.to(roomId).emit('ice-candidate', {
      candidate,
      senderId: socket.id
    });
  });

  // Handle explicit leave-room
  socket.on('leave-room', ({ roomId }, callback) => {
    handleUserLeave(socket, roomId);
    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // Handle disconnect
  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnected] ID: ${socket.id}, reason: ${reason}`);
    const roomId = socketToRoom.get(socket.id);
    if (roomId) {
      handleUserLeave(socket, roomId);
    }
  });
});

/**
 * Helper to clean up user room presence and notify peers
 */
function handleUserLeave(socket, roomId) {
  const targetRoomId = roomId || socketToRoom.get(socket.id);
  if (!targetRoomId) return;

  socket.leave(targetRoomId);
  socketToRoom.delete(socket.id);

  const room = rooms.get(targetRoomId);
  if (room) {
    room.participants = room.participants.filter(id => id !== socket.id);
    console.log(`[leave-room] Socket ${socket.id} left room ${targetRoomId}. Remaining: ${room.participants.length}`);

    // Notify the other peer
    socket.to(targetRoomId).emit('user-disconnected', {
      peerId: socket.id
    });

    // If no participants left, clean up the room
    if (room.participants.length === 0) {
      rooms.delete(targetRoomId);
      console.log(`[cleanup] Room ${targetRoomId} is empty and has been removed.`);
    }
  }
}

// Start server
server.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`  PeerConnect Signaling Server running on port ${PORT}`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  STUN: Configured (Google public STUN)`);
  console.log(`  TURN: ${process.env.TURN_URL ? 'Configured' : 'None (STUN only)'}`);
  console.log(`===============================================`);
});
