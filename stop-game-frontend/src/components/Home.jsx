import { useState, useEffect } from "react";
import { socket } from "../socket";
import { v4 as uuidv4 } from 'uuid'; // Importe uuid para gerar IDs únicos

// As props agora incluem onJoinOrCreateRoom, roomError e isConnected do App.jsx
export default function Home({ onJoinOrCreateRoom, roomError, isConnected }) {
  const [nickname, setNickname] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [localError, setLocalError] = useState(""); // Para erros de validação locais

  // useEffect para gerar ou recuperar o userId ao carregar o componente
  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem('userId', storedUserId);
    }
    // O userId é gerenciado no App.jsx, então não precisamos setá-lo aqui no Home.
    // A prop `onJoinOrCreateRoom` do App.jsx já vai ter acesso ao userId correto.
  }, []);

  const handleJoin = () => {
    console.log("handleJoin foi chamado! (Teste de clique)");
    setLocalError(""); // Limpa erro anterior

    const trimmedNickname = nickname ? nickname.trim() : '';
    if (!trimmedNickname) {
      setLocalError("Por favor, digite um nickname.");
      console.log("Nickname vazio/inválido.");
      return;
    }

    const selectedRoom = joinCode ? joinCode.trim() : '';
    const finalRoomName = selectedRoom || trimmedNickname.toLowerCase().replace(/\s/g, '-');

    onJoinOrCreateRoom(finalRoomName, trimmedNickname);
    console.log(`Emitindo join_room para: ${finalRoomName}, ${trimmedNickname}`);
  };

  return (
    // Container principal: Fundo da página
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4" data-testid="home-container">
      {/* Caixa do formulário */}
      <div className="max-w-md mx-auto bg-white p-8 rounded-2xl shadow-xl space-y-6 border border-gray-200 dark:bg-gray-800 dark:border-gray-700" data-testid="home-form-container">
        <h1 className="text-3xl font-extrabold text-center text-blue-700 dark:text-blue-400" data-testid="game-title">
          Stop (Adedonha)
        </h1>

        <div className="space-y-4" data-testid="form-inputs">
          <input
            type="text"
            placeholder="Seu Nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" 
            maxLength={15}
            data-testid="nickname-input"
          />

          <input
            type="text"
            placeholder="Código da Sala (opcional)"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 text-lg dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100" 
            maxLength={8}
            data-testid="room-code-input"
          />

          {(localError || roomError) && (
            <p className="text-red-500 text-sm text-center dark:text-red-400" data-testid="error-message">
              {localError || roomError}
            </p>
          )}
        </div>

        <button
          onClick={handleJoin}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-lg font-semibold text-xl shadow-md transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={!isConnected || !nickname || nickname.trim() === ''}
          data-testid="join-create-room-btn"
        >
          {isConnected ? 'Entrar ou Criar Sala' : 'Conectando...'}
        </button>

        <p className="text-center text-gray-500 text-sm mt-4 dark:text-gray-400" data-testid="help-text">
          Deixe o campo "Código da Sala" vazio para criar uma nova sala.
        </p>
      </div>
    </div>
  );
}