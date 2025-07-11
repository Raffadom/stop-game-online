// socket.js
import { io } from "socket.io-client";

// Define a URL do backend com base no ambiente.
// Em desenvolvimento (local), conecta-se a http://localhost:3001.
// Em produção, o 'undefined' fará com que o socket.io tente se conectar ao mesmo host
// de onde o frontend foi servido.
const URL = process.env.NODE_ENV === 'production' ? undefined : "http://localhost:3001";

export const socket = io(URL, {
  autoConnect: true // <--- CORREÇÃO AQUI: Habilita a conexão automática ao carregar.
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