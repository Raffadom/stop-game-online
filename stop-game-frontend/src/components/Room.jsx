import React, { useState, useEffect } from "react";
import GameBoard from "./GameBoard";
import Timer from "./Timer";
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';

// Alertas customizados para melhor UX
const Alert = ({ message, type, isVisible, onClose }) => {
  if (!isVisible) return null;

  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  return (
    <div
      className={`fixed top-4 left-1/2 -translate-x-1/2 p-4 rounded-lg shadow-xl text-white font-semibold transition-all duration-300 ease-out z-50 animate-fade-in ${getBackgroundColor()}`}
    >
      <span>{message}</span>
      <button onClick={onClose} className="ml-4 font-bold">
        &times;
      </button>
    </div>
  );
};

export default function Room({
  nickname,
  room,
  userId,
  playersInRoom,
  isAdmin,
  roomThemes,
  setRoomThemes,
  roomDuration,
  setRoomDuration,
  letter,
  roundStarted,
  roundEnded,
  resetRoundFlag,
  stopClickedByMe,
  countdown,
  handleStartRound,
  handleStopRound,
  handleLeaveRoom,
  onResetRound,
  isRoomSaved,
  handleSaveRoom,
}) {
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme : 'light';
  });

  // Estado para os alerts
  const [alertState, setAlertState] = useState({ isVisible: false, message: '', type: '' });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Efeito para esconder o alert após 3 segundos
  useEffect(() => {
    if (alertState.isVisible) {
      const timer = setTimeout(() => {
        setAlertState({ isVisible: false, message: '', type: '' });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [alertState]); // A dependência setAlertState é desnecessária se não for modificada

  const toggleTheme = () => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleShareRoomLink = () => {
    const roomLink = `${window.location.origin}/room/${room}`;
    navigator.clipboard.writeText(roomLink)
      .then(() => {
        setShowCopiedMessage(true);
        setTimeout(() => {
          setShowCopiedMessage(false);
        }, 2000);
      })
      .catch((err) => {
        console.error('Erro ao copiar o link: ', err);
      });
  };

  const handleSaveRoomWithDetails = () => {
    handleSaveRoom(room);
  };

  const handleDurationChange = (e) => {
    setRoomDuration(Number(e.target.value));
  };
  
  const saveButtonText = isRoomSaved ? '✅ Sala Salva' : '💾 Salvar Sala';
  const saveButtonColor = isRoomSaved ? 'bg-green-500 hover:bg-green-600' : 'bg-yellow-500 hover:bg-yellow-600';

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 space-y-8 relative">
      {/* Componente de alerta */}
      <Alert
        message={alertState.message}
        type={alertState.type}
        isVisible={alertState.isVisible}
        onClose={() => setAlertState({ isVisible: false, message: '', type: '' })}
      />

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

      {/* Informações da Sala */}
      <div className="bg-white p-6 rounded-xl shadow w-full flex flex-col space-y-2 dark:bg-gray-800 dark:text-gray-100">
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300 flex items-center flex-wrap gap-2">
          Sala: <span className="font-bold text-blue-600">{room}</span>
          {isRoomSaved && (
            <span className="text-green-500" title="Sala salva">
            </span>
          )}
          <button
            onClick={handleShareRoomLink}
            className="px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition-colors dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            title="Copiar link da sala"
          >
            🔗 Compartilhar
          </button>
          {showCopiedMessage && (
            <span className="ml-2 text-sm text-green-600 font-medium animate-fade-in">
              Link da sala copiado!
            </span>
          )}
          {isAdmin && !roundStarted && !roundEnded && (
            <button
              onClick={handleSaveRoomWithDetails}
              className={`px-3 py-1 text-white rounded-md text-sm transition-colors shadow font-semibold ${saveButtonColor}`}
              title="Salvar configurações da sala"
            >
              {saveButtonText}
            </button>
          )}
        </div>
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300">
          Jogadores:{" "}
          <div className="inline-flex flex-wrap gap-2 ml-2">
            {playersInRoom.map((player) => (
              <span
                key={player.userId}
                className={`
                  px-3 py-1 rounded-full text-sm font-medium
                  ${player.userId === userId
                    ? 'bg-blue-200 text-blue-800 dark:bg-blue-700 dark:text-blue-100'
                    : 'bg-green-200 text-green-800 dark:bg-green-700 dark:text-green-100'
                  }
                  ${player.isCreator ? 'border-2 border-yellow-500 dark:border-yellow-400' : ''}
                `}
              >
                {player.nickname} {player.isCreator && '(Admin)'}
              </span>
            ))}
          </div>
        </div>
        {countdown !== null && countdown > 0 && (
          <div className="text-7xl font-extrabold text-blue-600 animate-pulse text-center">
            {countdown}
          </div>
        )}
        {letter && roundStarted && !roundEnded && (
          <div className="text-lg font-semibold mt-2 text-gray-700 text-center dark:text-gray-300">
            A letra é:{" "}
            <span className="text-3xl font-extrabold text-blue-700">
              {letter}
            </span>
          </div>
        )}
      </div>

      {/* Controles da Rodada */}
      <div className="bg-white p-6 rounded-xl shadow w-full flex flex-col items-center space-y-4 dark:bg-gray-800 dark:text-gray-100">
        {isAdmin && !roundStarted && !roundEnded && countdown === null && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="duration-input" className="text-gray-700 font-medium dark:text-gray-300">Duração (segundos):</label>
              <input
                id="duration-input"
                type="number"
                value={roomDuration}
                onChange={handleDurationChange}
                className="w-24 border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                min={10}
                max={300}
              />
            </div>
            <button
              onClick={handleStartRound}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 font-semibold"
              disabled={roomThemes.length === 0}
            >
              Iniciar Rodada
            </button>
          </div>
        )}

        {roundStarted && countdown === null && (
          <>
            <Timer duration={roomDuration} />
            {!stopClickedByMe && (
              <button
                onClick={handleStopRound}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg shadow-md mt-4 transition-colors duration-200 font-semibold"
              >
                STOP
              </button>
            )}
            {stopClickedByMe && (
              <div className="text-red-600 font-semibold mt-4 text-lg">
                Você clicou em STOP! Aguardando outros jogadores...
              </div>
            )}
          </>
        )}
      </div>

      {/* Componente GameBoard */}
      <div className="bg-white p-6 rounded-xl shadow w-full flex-grow dark:bg-gray-800">
        <GameBoard
          roundStarted={roundStarted}
          roundEnded={roundEnded}
          onResetRound={onResetRound}
          resetRoundFlag={resetRoundFlag}
          letter={letter}
          userId={userId}
          isAdmin={isAdmin}
          roomThemes={roomThemes}
          setRoomThemes={setRoomThemes}
          roomDuration={roomDuration}
          stopClickedByMe={stopClickedByMe}
          handleStopRound={handleStopRound}
          room={room}
          isRoomSaved={isRoomSaved}
          handleSaveRoom={handleSaveRoom}
          alertState={alertState}
          setAlertState={setAlertState}
        />
      </div>

      {/* Botão de Sair da Sala */}
      <div className="mt-6 flex justify-center">
        <button
          onClick={handleLeaveRoom}
          className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow transition-colors duration-200"
        >
          Sair da Sala
        </button>
      </div>
    </div>
  );
}