// socket.js
import { io } from 'socket.io-client';

// Configuração para produção e desenvolvimento
const getSocketUrl = () => {
  // Se estiver em produção (build), usar a URL do backend no Render
  if (import.meta.env.PROD) {
    return 'https://stop-game-backend.onrender.com';
  }
  
  // Se estiver em desenvolvimento, usar localhost
  return 'http://localhost:3001';
};

export const socket = io(getSocketUrl(), {
  transports: ['websocket', 'polling'],
  timeout: 20000,
  forceNew: true
});

socket.on('connect', () => {
  console.log('Socket.IO CLIENT: Conectado ao servidor! ID:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('Socket.IO CLIENT: Erro na conexão:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('Socket.IO CLIENT: Desconectado. Motivo:', reason);
});