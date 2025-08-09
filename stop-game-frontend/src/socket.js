// socket.js
import { io } from "socket.io-client";

const BACKEND_URL_PROD = "https://stop-game-backend.onrender.com";

const URL = process.env.NODE_ENV === 'production' ? BACKEND_URL_PROD : "http://localhost:3001";

export const socket = io(URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'], // Prioritize WebSocket, fallback to polling
});

socket.on('connect', () => {
  console.log('Socket.IO CLIENT: Conectado ao servidor! ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.warn('Socket.IO CLIENT: Desconectado do servidor! Razão:', reason);
});

socket.on('connect_error', (err) => {
  console.error('Socket.IO CLIENT: Erro na conexão:', err.message, err);
});

socket.on('reconnect', (attempt) => {
  console.log('Socket.IO CLIENT: Reconectado ao servidor após', attempt, 'tentativas. ID:', socket.id);
});

socket.on('reconnect_attempt', (attempt) => {
  console.log('Socket.IO CLIENT: Tentativa de reconexão número', attempt);
});

socket.on('reconnect_error', (err) => {
  console.error('Socket.IO CLIENT: Erro na reconexão:', err.message, err);
});