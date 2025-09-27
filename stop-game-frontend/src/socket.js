// socket.js
import { io } from "socket.io-client";

const URL = process.env.NODE_ENV === 'production'
  ? 'https://your-production-url.com'
  : 'http://localhost:3001';

export const socket = io(URL, {
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
});

socket.on("connect", () => {
  console.log("Socket.IO CLIENT: Conectado ao servidor! ID:", socket.id);
});

socket.on("disconnect", () => {
  console.log("Socket.IO CLIENT: Desconectado do servidor!");
});

socket.on("connect_error", (error) => {
  console.error("Socket.IO CLIENT: Erro na conexão:", error);
});