// socket.js
import { io } from "https://stop-game-backend.onrender.com";

// Substitua 'SUA_URL_DO_BACKEND_DO_RENDER' pela URL real do seu backend no Render.
// Exemplo: 'https://stop-game-api.onrender.com'
const BACKEND_URL_PROD = "SUA_URL_DO_BACKEND_DO_RENDER"; 

// Define a URL do backend com base no ambiente.
const URL = process.env.NODE_ENV === 'production' ? BACKEND_URL_PROD : "http://localhost:3001";

export const socket = io(URL, {
  autoConnect: true 
});

// Logs para depuração da conexão do Socket.IO no cliente
socket.on('connect', () => {
  console.log('Socket.IO CLIENT: Conectado ao servidor! ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.warn('Socket.IO CLIENT: Desconectado do servidor! Razão:', reason);
});

socket.on('connect_error', (err) => {
  console.error('Socket.IO CLIENT: Erro na conexão:', err.message, err);
});