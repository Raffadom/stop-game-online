// socket.js
import { io } from 'socket.io-client';

const serverURL = 'http://localhost:3001';
export const socket = io(serverURL, {
  autoConnect: false, // ✅ Não conectar automaticamente
});

// ✅ ADICIONAR: Função para conectar com userId
export const connectWithUserId = (userId, nickname) => {
  console.log('[Socket] Conectando com userId:', userId, 'nickname:', nickname);
  
  // ✅ Armazenar userId no socket antes de conectar
  socket.userId = userId;
  socket.nickname = nickname;
  
  // ✅ Conectar ao servidor
  socket.connect();
  
  // ✅ Enviar identificação assim que conectar
  socket.on('connect', () => {
    console.log('[Socket] Conectado! Enviando identificação...');
    socket.emit('identify', { userId, nickname });
  });
};

// ✅ Event listeners para debug
socket.on('connect', () => {
  console.log('Socket.IO CLIENT: Conectado ao servidor! ID:', socket.id);
  console.log('Socket.IO CLIENT: UserId armazenado:', socket.userId);
});

socket.on('disconnect', (reason) => {
  console.log('Socket.IO CLIENT: Desconectado. Motivo:', reason);
});

socket.on('error', (error) => {
  console.error('Socket.IO CLIENT: Erro:', error);
});