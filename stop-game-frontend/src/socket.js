// socket.js
import { io } from 'socket.io-client';

// ✅ CORRIGIR: URL real do seu backend no Render
const BACKEND_URL = import.meta.env.PROD 
    ? 'https://stop-game-backend.onrender.com' // ✅ URL correta do Render
    : 'http://localhost:3001';

console.log('[Socket] Conectando em:', BACKEND_URL, '- Modo:', import.meta.env.PROD ? 'PRODUÇÃO' : 'DESENVOLVIMENTO');

export const socket = io(BACKEND_URL, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true,
    upgrade: true,
    rememberUpgrade: false
});

// Log de conexão
socket.on('connect', () => {
    console.log('Socket.IO CLIENT: Conectado ao servidor');
});

socket.on('disconnect', (reason) => {
    console.log('Socket.IO CLIENT: Desconectado. Motivo:', reason);
});

socket.on('connect_error', (error) => {
    console.error('Socket.IO CLIENT: Erro de conexão:', error);
});