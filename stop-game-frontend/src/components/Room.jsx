import React, { useState, useEffect } from "react";
import GameBoard from "./GameBoard";
import Timer from "./Timer";
import { SunIcon, MoonIcon } from '@heroicons/react/24/solid';

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
  // --- NOVAS PROPS ---
  isRoomSaved,
  handleSaveRoom,
}) {
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme : 'light';
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

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

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 space-y-8 relative">
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
        <div className="text-lg font-semibold text-gray-700 dark:text-gray-300 flex items-center flex-wrap gap-2"> {/* Adicionado flex items-center flex-wrap gap-2 */}
          Sala: <span className="font-bold text-blue-600">{room}</span>
          {isRoomSaved && ( // Ícone da sala salva
            <span className="text-green-500" title="Sala salva">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 inline-block align-middle">
                <path fillRule="evenodd" d="M10.788 3.212c.44-.914 1.83-.914 2.27 0l.953 1.977.842 1.75a1.125 1.125 0 011.666 1.077l-.546 2.73a1.125 1.125 0 00.334 1.125l2.148 2.148a1.125 1.125 0 01.124 1.574l-1.6 2.401a1.125 1.125 0 01-1.423.423l-2.401-1.6a1.125 1.125 0 00-1.574-.124l-2.148 2.148a1.125 1.125 0 01-1.125.334l-2.73-.546a1.125 1.125 0 01-1.077-1.666l1.75-.842 1.977-.953a1.125 1.125 0 000-2.27l-1.977-.953-1.75-.842a1.125 1.125 0 01-1.077-1.666l.546-2.73a1.125 1.125 0 00-.334-1.125L3.212 7.84a1.125 1.125 0 01-.124-1.574l1.6-2.401a1.125 1.125 0 011.423-.423l2.401 1.6a1.125 1.125 0 001.574.124l2.148-2.148a1.125 1.125 0 011.125-.334l2.73.546a1.125 1.125 0 011.077 1.666l-1.75.842-1.977.953z" clipRule="evenodd" />
              </svg>
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
          {/* Botão Salvar Sala (visível apenas para admin e fora de rodada ativa) */}
          {isAdmin && !roundStarted && !roundEnded && (
              <button
                  onClick={handleSaveRoom}
                  className="px-3 py-1 bg-yellow-500 text-white rounded-md text-sm hover:bg-yellow-600 transition-colors shadow"
                  title="Salvar configurações da sala"
              >
                  💾 Salvar Sala
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
        {/* Contagem Regressiva para iniciar a rodada */}
        {countdown !== null && countdown > 0 && (
          <div className="text-7xl font-extrabold text-blue-600 animate-pulse text-center">
            {countdown}
          </div>
        )}
        {/* Exibe a letra somente quando a rodada está ativa */}
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
                onChange={(e) => setRoomDuration(Number(e.target.value))}
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

        {/* Timer da rodada ativa */}
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
