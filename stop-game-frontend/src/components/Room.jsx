import React, { useState } from "react"; // <--- Importe useState
import GameBoard from "./GameBoard";
import Timer from "./Timer";

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
}) {
  // NOVO ESTADO: Para controlar a visibilidade da mensagem de "copiado"
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  // NOVA FUNÇÃO: Para lidar com a cópia e mostrar a mensagem
  const handleShareRoomLink = () => {
    const roomLink = `${window.location.origin}/room/${room}`;
    navigator.clipboard.writeText(roomLink)
      .then(() => {
        setShowCopiedMessage(true); // Exibe a mensagem
        setTimeout(() => {
          setShowCopiedMessage(false); // Esconde a mensagem após 2 segundos
        }, 2000);
      })
      .catch((err) => {
        console.error('Erro ao copiar o link: ', err);
        // Opcional: Adicionar algum feedback de erro para o usuário
      });
  };

  return (
    <div className="flex flex-col min-h-screen max-w-5xl mx-auto px-4 py-6 space-y-8">
      {/* Informações da Sala */}
      <div className="bg-white p-6 rounded-xl shadow w-full flex flex-col space-y-2">
        <div className="text-lg font-semibold text-gray-700">
          Sala: <span className="font-bold text-blue-600">{room}</span>
          <button
            // CHAMAR A NOVA FUNÇÃO AQUI
            onClick={handleShareRoomLink}
            className="ml-4 px-3 py-1 bg-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-300 transition-colors"
            title="Copiar link da sala"
          >
            🔗 Compartilhar
          </button>
          {/* MENSAGEM DE FEEDBACK */}
          {showCopiedMessage && (
            <span className="ml-2 text-sm text-green-600 font-medium animate-fade-in">
              Link da sala copiado!
            </span>
          )}
        </div>
        <div className="text-lg font-semibold text-gray-700">
          Jogadores:{" "}
          <span className="font-bold">
            {playersInRoom.map((p) => p.nickname).join(", ")}
          </span>
        </div>
        {/* Contagem Regressiva para iniciar a rodada */}
        {countdown !== null && countdown > 0 && (
          <div className="text-7xl font-extrabold text-blue-600 animate-pulse text-center">
            {countdown}
          </div>
        )}
        {/* Exibe a letra somente quando a rodada está ativa */}
        {letter && roundStarted && !roundEnded && (
          <div className="text-lg font-semibold mt-2 text-gray-700 text-center">
            A letra é:{" "}
            <span className="text-3xl font-extrabold text-blue-700">
              {letter}
            </span>
          </div>
        )}
      </div>

      {/* ... (o restante do seu componente Room.jsx permanece o mesmo) ... */}

      {/* Controles da Rodada */}
      <div className="bg-white p-6 rounded-xl shadow w-full flex flex-col items-center space-y-4">
        {isAdmin && !roundStarted && !roundEnded && countdown === null && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2">
              <label htmlFor="duration-input" className="text-gray-700 font-medium">Duração (segundos):</label>
              <input
                id="duration-input"
                type="number"
                value={roomDuration}
                onChange={(e) => setRoomDuration(Number(e.target.value))}
                className="w-24 border border-gray-300 p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-green-400"
                min={10}
                max={300}
              />
            </div>
            <button
              onClick={handleStartRound}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg shadow-md transition-colors duration-200 font-semibold"
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
      <div className="bg-white p-6 rounded-xl shadow w-full flex-grow">
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