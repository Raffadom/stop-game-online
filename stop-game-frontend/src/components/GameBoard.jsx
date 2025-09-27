import { useEffect, useState, useCallback } from "react";
import { socket } from "../socket";
import Modal from "./Modal";

export default function GameBoard({
  roundStarted,
  roundEnded,
  onReset,
  resetFlag,
  letter,
  isAdmin,
  userId,
  roomThemes,
  setRoomThemes,
  setRoomDuration,
  stopClickedByMe,
  handleStopRound,
  room,
}) {
  // State declarations
  const [answers, setAnswers] = useState([]);
  const [totalPoints, setTotalPoints] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [finalRanking, setFinalRanking] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [canReveal, setCanReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [currentValidated, setCurrentValidated] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [roundScores, setRoundScores] = useState(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [newThemeInput, setNewThemeInput] = useState("");
  const maxThemes = 10;

  // Initialize or update answers array
  useEffect(() => {
    if (!roomThemes) {
      setAnswers([]);
      return;
    }
    const themesChanged =
      JSON.stringify(roomThemes) !== JSON.stringify(answers.map((a) => a.theme));

    if (roomThemes.length > 0) {
      if (themesChanged || answers.length === 0) {
        setAnswers(
          roomThemes.map((theme) => ({
            theme,
            answer: "",
            points: null,
            validated: false,
          }))
        );
      }
    } else {
      setAnswers([]);
    }
  }, [roomThemes]);

  // Reset game state
  useEffect(() => {
    if (resetFlag) {
      setAnswers(
        roomThemes.map((theme) => ({
          theme,
          answer: "",
          points: null,
          validated: false,
        }))
      );
      setTotalPoints(null);
      setShowResults(false);
      setFinalRanking(null);
      setShowModal(false);
      setValidationData(null);
      setCurrentValidated(false);
      setCanReveal(false);
      setRevealed(false);
      setIsValidating(false);
      setRoundScores(null);
      if (onReset) onReset();
    }
  }, [resetFlag, roomThemes, onReset]);

  // Socket event handlers
  useEffect(() => {
    const handleRoundStarted = (data) => {
      setAnswers(
        roomThemes.map((theme) => ({
          theme,
          answer: "",
          points: null,
          validated: false,
        }))
      );
      setTotalPoints(null);
      setShowResults(false);
      setShowModal(false);
      setValidationData(null);
      setCurrentValidated(false);
      setCanReveal(false);
      setRevealed(false);
      setIsValidating(false);
      setRoundScores(null);
      setFinalRanking(null);

      if (onReset) onReset();
    };

    const handleRoundEnded = () => {
      socket.emit("submit_answers", { room, answers });
    };

    const handleStartValidation = (data) => {
      if (!data.current || !data.judgeId) {
        return;
      }
      
      setValidationData(data.current);
      setCanReveal(userId === data.judgeId);
      setShowModal(true);
      setRevealed(false);
      setCurrentValidated(false);
      setIsValidating(false);
      setIsRevealing(false);
    };

    const handleReveal = () => {
      setRevealed(true);
      setIsRevealing(false);
    };

    const handleAnswerValidated = (data) => {
      setValidationData(data.current);
      setRevealed(false);
      setCurrentValidated(false);
      setIsValidating(false);
      setIsRevealing(false);
    };

    const handleValidationComplete = (data) => {
      if (data.myAnswers) {
        const updatedAnswers = [...answers];
        data.myAnswers.forEach((serverAnswer, index) => {
          if (updatedAnswers[index]) {
            updatedAnswers[index] = {
              ...updatedAnswers[index],
              points: serverAnswer.points || 0,
              reason: serverAnswer.reason || '',
              validated: true
            };
          }
        });
        setAnswers(updatedAnswers);
        
        const totalPoints = data.myScore || 0;
        setTotalPoints(totalPoints);
        
        setShowModal(false);
        setValidationData(null);
        setIsValidating(false);
        setIsRevealing(false);
        setCanReveal(false);
        setRevealed(false);
      }
    };

    const handleGameEnded = (ranking) => {
      setFinalRanking(ranking);
      setShowResults(false);
      setShowModal(false);
      setRoundScores(null);
    };

    const handleNewRoundStarted = () => {
      setShowResults(false);
      setRoundScores(null);
      setFinalRanking(null);
      setShowModal(false);
      setValidationData(null);
      handleRoundStarted({});
    };

    const handleTimeUpRoundEnded = () => {
      socket.emit("submit_answers", { room, answers });
    };

    const handleValidationCompleteForPlayer = (data) => {
      if (data.playerId === userId) {
          handleValidationComplete(data);
      }
    };

    // Socket event listeners
    socket.on("round_started", handleRoundStarted);
    socket.on("round_ended", handleRoundEnded);
    socket.on("start_validation", handleStartValidation);
    socket.on("reveal", handleReveal);
    socket.on("answer_validated", handleAnswerValidated);
    socket.on("validation_complete", handleValidationComplete);
    socket.on("game_ended", handleGameEnded);
    socket.on("new_round_started", handleNewRoundStarted);
    socket.on("time_up_round_ended", handleTimeUpRoundEnded);
    socket.on("validation_complete_for_player", handleValidationCompleteForPlayer);

    return () => {
      socket.off("round_started", handleRoundStarted);
      socket.off("round_ended", handleRoundEnded);
      socket.off("start_validation", handleStartValidation);
      socket.off("reveal", handleReveal);
      socket.off("answer_validated", handleAnswerValidated);
      socket.off("validation_complete", handleValidationComplete);
      socket.off("game_ended", handleGameEnded);
      socket.off("new_round_started", handleNewRoundStarted);
      socket.off("time_up_round_ended", handleTimeUpRoundEnded);
      socket.off("validation_complete_for_player", handleValidationCompleteForPlayer);
    };
  }, [answers, userId, room, roomThemes, onReset]);

  const handleAnswerChange = (idx, val) => {
    setAnswers((prev) => {
      const updated = [...prev];
      updated[idx].answer = val;
      return updated;
    });
  };

  const handleAddTheme = () => {
    const newTheme = newThemeInput.trim();
    if (!newTheme || roomThemes.includes(newTheme) || roomThemes.length >= maxThemes) return;
    setRoomThemes([...roomThemes, newTheme]);
    setNewThemeInput("");
  };

  const handleRemoveTheme = (theme) => {
    setRoomThemes(roomThemes.filter((t) => t !== theme));
  };

  const handleRevealAnswer = useCallback(() => {
    if (!room || !canReveal || isRevealing || revealed) {
      return;
    }
    
    setIsRevealing(true);
    socket.emit("reveal", { room });
  }, [room, canReveal, isRevealing, revealed]);

  const handleValidate = useCallback((isValid) => {
    if (!canReveal || !validationData || isValidating) {
      return;
    }

    setIsValidating(true);
    setCurrentValidated(true);
    socket.emit("validate_answer", { valid: isValid, room });
  }, [canReveal, validationData, isValidating, room]);

  const handleNewRound = useCallback(() => {
    if (!room || !isAdmin) return;
    
    socket.emit("new_round", { room });
  }, [room, isAdmin]);

  const handleEndGame = useCallback(() => {
    if (!room || !isAdmin) return;
    
    socket.emit("end_game", { room });
  }, [room, isAdmin]);

  const handleLeaveRoom = useCallback(() => {
    socket.emit("leave_room");
    
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  }, [room]);

  // Componente de resultados da rodada
  const RoundResults = () => {
    if (!roundScores) return null;

    return (
      <div className="space-y-6">
        <h3 className="text-2xl font-bold mb-6 text-center text-blue-700 dark:text-blue-400">
          📊 Resultados da Rodada
        </h3>
        
        {roundScores.map((player, playerIndex) => (
          <div key={player.playerId} className="bg-white p-6 rounded-lg shadow-md dark:bg-gray-800 mb-4">
            <h4 className="text-lg font-bold mb-4 text-purple-700 dark:text-purple-400">
              🎮 {player.nickname}
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-4">
              {player.answers.map((answer, idx) => (
                <div 
                  key={`${player.playerId}-${idx}`}
                  className="bg-gray-50 p-3 rounded shadow-sm dark:bg-gray-700"
                >
                  <div className="font-semibold text-gray-700 dark:text-gray-200 mb-1">
                    {answer.theme}
                  </div>
                  <div className="text-gray-900 dark:text-gray-100 mb-2">
                    {answer.answer || "(Sem resposta)"}
                  </div>
                  <div className={`text-right font-semibold ${
                    answer.points > 0 
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}>
                    {answer.points} pontos
                  </div>
                </div>
              ))}
            </div>

            <div className="text-right text-xl font-bold text-purple-700 dark:text-purple-400">
              Total da Rodada: {player.roundScore} pontos
            </div>
          </div>
        ))}

        <div className="flex justify-center gap-4 mt-8">
          {isAdmin && (
            <>
              <button
                onClick={handleNewRound}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition-colors"
              >
                🔄 Iniciar Nova Rodada
              </button>
              <button
                onClick={handleEndGame}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition-colors"
              >
                🏁 Finalizar Partida
              </button>
            </>
          )}
          <button
            onClick={handleLeaveRoom}
            className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition-colors"
          >
            🚪 Sair da Sala
          </button>
        </div>
      </div>
    );
  };

  const ValidationModal = () => {
    if (!validationData) return null;

    return (
      <Modal onClose={() => setShowModal(false)} showClose={false}>
        <div className="bg-white p-6 rounded-xl dark:bg-gray-800 dark:text-gray-100 space-y-6">
          <h4 className="text-2xl text-center font-bold text-blue-700 dark:text-blue-400">
            🔍 Validando Resposta
          </h4>
          
          <div className="text-center space-y-2">
            <div className="text-lg font-semibold">
              👤 Jogador: <span className="text-blue-600">{validationData.playerNickname}</span>
            </div>
            <div className="text-lg font-semibold">
              📋 Tema: <span className="text-purple-600">{validationData.theme}</span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Jogador {(validationData.currentPlayerIndex || 0) + 1} de {validationData.totalPlayers || 0} | 
              Tema {(validationData.themeIndex || 0) + 1} de {validationData.totalThemes || 0}
            </div>
          </div>

          {revealed ? (
            <>
              <div className="text-center text-2xl font-bold text-gray-900 dark:text-gray-50 p-4 bg-gray-100 dark:bg-gray-700 rounded">
                💭 Resposta: <span className="text-blue-600">
                  {validationData.answer || "(Sem resposta)"}
                </span>
              </div>
              
              {canReveal && !isValidating && !currentValidated && (
                <div className="flex justify-center space-x-4 mt-6">
                  <button
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors disabled:opacity-50"
                    disabled={!validationData.answer || validationData.answer.trim().length === 0}
                    onClick={() => handleValidate(true)}
                  >
                    ✅ Confirmar como Correta
                  </button>
                  <button
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
                    onClick={() => handleValidate(false)}
                  >
                    ❌ Confirmar como Incorreta
                  </button>
                </div>
              )}
              
              {(isValidating || currentValidated) && (
                <div className="text-center text-gray-600 dark:text-gray-400">
                  ⏳ Processando validação...
                </div>
              )}
            </>
          ) : (
            <div className="text-center mt-6">
              {canReveal && !isRevealing ? (
                <button
                  onClick={handleRevealAnswer}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg shadow-md font-semibold transition-colors"
                >
                  👁️ Mostrar Resposta
                </button>
              ) : (
                <p className="text-gray-700 dark:text-gray-300 text-lg">
                  {isRevealing ? "⏳ Revelando..." : "⏱️ Aguardando o juiz revelar a resposta..."}
                </p>
              )}
            </div>
          )}
        </div>
      </Modal>
    );
  };

  // Ranking Final
  const FinalRanking = () => (
    <section className="bg-white p-6 rounded-xl shadow-lg dark:bg-gray-800">
      <h3 className="text-3xl font-bold text-center text-blue-700 dark:text-blue-400 mb-6">
        🏆 Ranking Final da Partida 🏆
      </h3>
      <ol className="space-y-3">
        {finalRanking.map((p, idx) => (
          <li
            key={p.playerId}
            className={`flex justify-between items-center p-4 rounded-lg ${
              idx === 0
                ? "bg-yellow-400 text-gray-900 font-bold"
                : idx === 1
                ? "bg-gray-300 text-gray-800 font-semibold"
                : idx === 2
                ? "bg-orange-300 text-gray-800 font-semibold"
                : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
            }`}
          >
            <span className="flex items-center gap-2">
              {idx === 0 && "🥇"}
              {idx === 1 && "🥈"} 
              {idx === 2 && "🥉"}
              {idx > 2 && `${idx + 1}.`}
              {p.nickname}
            </span>
            <span className="text-2xl font-bold">{p.totalScore || 0} pts</span>
          </li>
        ))}
      </ol>
      <div className="text-center mt-8">
        <button
          onClick={handleLeaveRoom}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md transition-colors"
        >
          🏠 Voltar ao Lobby
        </button>
      </div>
    </section>
  );

  // Render principal
  return (
    <div className="container mx-auto px-4 py-4 flex flex-col space-y-6">
      {/* Letter Display */}
      {letter && roundStarted && !roundEnded && (
        <div className="text-3xl text-center font-bold text-blue-700 mb-4 select-none dark:text-blue-400">
          Letra da rodada: <span className="text-5xl">{letter}</span>
        </div>
      )}

      {/* Mostrar ranking final se existir */}
      {finalRanking ? (
        <FinalRanking />
      ) : showResults && roundScores ? (
        /* Mostrar resultados da rodada */
        <RoundResults />
      ) : (
        <>
          {/* Theme Management */}
          {isAdmin && !roundStarted && !roundEnded && (
            <section className="bg-gray-50 p-4 rounded border dark:bg-gray-700 dark:border-gray-600">
              <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-100">
                🎯 Gerenciar Temas
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Novo Tema"
                  className="flex-grow p-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50"
                  value={newThemeInput}
                  onChange={(e) => setNewThemeInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTheme()}
                />
                <button
                  disabled={roomThemes.length >= maxThemes}
                  onClick={handleAddTheme}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow transition disabled:opacity-50"
                >
                  ➕ Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {roomThemes.map((theme) => (
                  <span
                    key={theme}
                    className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-medium flex items-center dark:bg-blue-700 dark:text-blue-100"
                  >
                    {theme}
                    <button
                      onClick={() => handleRemoveTheme(theme)}
                      className="ml-2 text-blue-600 hover:text-blue-900 font-bold dark:text-blue-300 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Answers Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {answers.map((a, i) => (
              <div
                key={`${a.theme}-${i}`}
                className="bg-gray-50 p-4 rounded shadow-sm dark:bg-gray-700"
              >
                <label className="block text-gray-700 font-semibold mb-1 dark:text-gray-100">
                  {a.theme}
                </label>
                <input
                  type="text"
                  disabled={!roundStarted || roundEnded}
                  placeholder="Sua resposta"
                  className="w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50 disabled:bg-gray-200 dark:disabled:bg-gray-600"
                  value={a.answer}
                  onChange={(e) => handleAnswerChange(i, e.target.value)}
                />
                {a.points !== null && (
                  <div className={`text-right font-semibold mt-1 ${
                    a.points > 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {a.points} pontos
                  </div>
                )}
              </div>
            ))}
          </section>

          {/* STOP Button */}
          {roundStarted && !roundEnded && !stopClickedByMe && (
            <div className="text-center mt-4">
              <button
                onClick={handleStopRound}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-md transition-colors animate-pulse"
              >
                🛑 STOP!
              </button>
            </div>
          )}

          {stopClickedByMe && roundStarted && !roundEnded && (
            <div className="text-center text-red-600 font-bold text-lg dark:text-red-400">
              🛑 Você clicou em STOP! Aguardando outros jogadores...
            </div>
          )}
        </>
      )}

      {/* Validation Modal */}
      {showModal && validationData && <ValidationModal />}

      {/* Botões de controle - aparecem após validação completa */}
      {totalPoints !== null && (
        <div className="mt-6 flex flex-col items-center space-y-4">
          {isAdmin && (
            <div className="flex space-x-4">
              <button
                onClick={() => socket.emit('new_round', { room })}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
              >
                🔄 Nova Rodada
              </button>
              <button
                onClick={() => socket.emit('end_game', { room })}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
              >
                🏁 Encerrar Partida
              </button>
            </div>
          )}
          
          <button
            onClick={() => {
              socket.emit('leave_room');
              window.location.reload();
            }}
            className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg shadow transition-colors"
          >
            🚪 Sair da Sala
          </button>
        </div>
      )}
    </div>
  );
}