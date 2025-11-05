import { useState, useEffect } from "react";
import { socket as _socket } from "../socket";
import { v4 as uuidv4 } from 'uuid'; // Importe uuid para gerar IDs únicos

// import { SunIcon, MoonIcon } from '@heroicons/react/24/solid'; // Prepared for theme toggle

// As props agora incluem onJoinOrCreateRoom, roomError e isConnected do App.jsx
export default function Home({ onJoinOrCreateRoom, roomError, isConnected, theme, toggleTheme }) {
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

  // ✅ CORRIGIR: A função handleJoin deve passar um objeto com as propriedades corretas
  const handleJoin = () => {
    console.log('handleJoin foi chamado! (Teste de clique)');
    setLocalError(""); // Limpa erro anterior

    const trimmedNickname = nickname ? nickname.trim() : '';
    if (!trimmedNickname) {
      setLocalError("Por favor, digite um nickname.");
      console.log("Nickname vazio/inválido.");
      return;
    }

    const selectedRoom = joinCode ? joinCode.trim() : '';
    const finalRoomName = selectedRoom || trimmedNickname.toLowerCase().replace(/\s/g, '-');

    // ✅ CORRIGIR: Passar objeto com estrutura esperada pelo App.jsx
    const roomData = {
      action: 'join',        // ✅ ADICIONAR: Especificar ação
      roomId: finalRoomName,    // ✅ NOME DA SALA
      nickname: trimmedNickname     // ✅ NICKNAME DO USUÁRIO
    };
    
    console.log('Dados sendo enviados para onJoinOrCreateRoom:', roomData);
    onJoinOrCreateRoom(roomData); // ✅ CORRIGIR: Passar objeto completo
  };

  const _handleCreate = () => {
    console.log('handleCreate foi chamado!');
    
    // ✅ CORRIGIR: Passar objeto com estrutura esperada pelo App.jsx  
    const roomData = {
      action: 'create',      // ✅ ADICIONAR: Especificar ação
      roomId: joinCode,  // ✅ NOME DA SALA
      nickname: nickname     // ✅ NICKNAME DO USUÁRIO
    };
    
    console.log('Dados sendo enviados para onJoinOrCreateRoom:', roomData);
    onJoinOrCreateRoom(roomData); // ✅ CORRIGIR: Passar objeto completo
  };

  return (
    // Container principal: Fundo da página
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4" data-testid="home-container">
      {/* Botão de Tema no canto superior direito */}
      <button
        onClick={toggleTheme}
        className="absolute top-4 right-4 p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 shadow-md transition-colors duration-300 z-10"
        title={theme === 'light' ? 'Mudar para Tema Escuro' : 'Mudar para Tema Claro'}
      >
        {theme === 'light' ? (
          <MoonIcon className="h-4 w-4" />
        ) : (
          <SunIcon className="h-4 w-4" />
        )}
      </button>

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