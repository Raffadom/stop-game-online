import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket";
import Modal from "./Modal";

export default function GameBoard({
  roundStarted,
  roundEnded,
  onResetRound,
  resetRoundFlag,
  letter,
  isAdmin,
  userId,
  roomThemes,
  setRoomThemes,
  roomDuration,
  stopClickedByMe,
  handleStopRound,
  room,
  isRoomSaved,
  handleSaveRoom,
  alertState,
  setAlertState,
}) {
  const [answers, setAnswers] = useState([]);
  const [totalPoints, setTotalPoints] = useState(null);
  const [newTheme, setNewTheme] = useState("");
  
  // Estados para validação
  const [showModal, setShowModal] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [canReveal, setCanReveal] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [roundScore, setRoundScore] = useState(null);
  const [showRoundResult, setShowRoundResult] = useState(false);
  const [isRoundActive, setIsRoundActive] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [currentValidated, setCurrentValidated] = useState(false);
  const [roundScores, setRoundScores] = useState(null);
  const [finalRanking, setFinalRanking] = useState(null);
  
  const maxThemes = 20;

  // Temas padrão
  const defaultThemes = [
    "Nome", "Cidade", "País", "Marca", "Cor", "Animal", "CEP", "Objeto", "Fruta", "Filmes/Séries", "Dor"
  ];

  // CORREÇÃO: Definir função updateAnswersWithThemes sem dependências circulares
  const updateAnswersWithThemes = useCallback((themes) => {
    if (themes && themes.length > 0) {
      console.log('[GameBoard] Atualizando respostas com temas:', themes);
      setAnswers(themes.map(theme => ({ 
        theme, 
        answer: "", 
        points: null, 
        reason: "", 
        validated: false 
      })));
    }
  }, []); // CORREÇÃO: Sem dependências para evitar loops

  // CORREÇÃO: Inicializar temas apenas uma vez
  useEffect(() => {
    if (isAdmin && (!roomThemes || roomThemes.length === 0) && setRoomThemes && room) {
      console.log('[GameBoard] Admin inicializando temas padrão para sala:', room);
      setRoomThemes(defaultThemes);
      socket.emit("update_themes", { room, themes: defaultThemes });
    }
  }, [isAdmin, room]); // CORREÇÃO: Remover setRoomThemes das dependências

  // CORREÇÃO: Solicitar configuração apenas na primeira vez
  useEffect(() => {
    if (room && (!roomThemes || roomThemes.length === 0)) {
      console.log('[GameBoard] Solicitando configuração da sala:', room);
      socket.emit("get_room_config", { room });
    }
  }, [room]); // CORREÇÃO: Apenas room como dependência

  // CORREÇÃO: Inicializar respostas apenas quando roomThemes mudar significativamente
  useEffect(() => {
    if (roomThemes && roomThemes.length > 0 && answers.length === 0) {
      console.log('[GameBoard] Inicializando respostas pela primeira vez');
      updateAnswersWithThemes(roomThemes);
    }
  }, [roomThemes, updateAnswersWithThemes]); // CORREÇÃO: Adicionar answers.length === 0

  const handleRevealAnswer = useCallback(() => {
    if (!canReveal || isRevealing) return;
    
    setIsRevealing(true);
    socket.emit("reveal_answer", { room });
  }, [canReveal, isRevealing, room]);

  // CORREÇÃO: Função para enviar respostas
  const submitAnswers = useCallback(() => {
    if (!answers || answers.length === 0) {
      console.log('[GameBoard] Nenhuma resposta para enviar');
      return;
    }

    const answersToSubmit = answers.map(a => ({
      theme: a.theme,
      answer: a.answer || ""
    }));

    console.log('[GameBoard] Enviando respostas:', answersToSubmit);
    socket.emit("submit_answers", { room, answers: answersToSubmit });
  }, [answers, room]);

  // CORREÇÃO: Enviar respostas apenas uma vez quando rodada terminar
  const [answersSubmitted, setAnswersSubmitted] = useState(false);
  
  useEffect(() => {
    if (roundEnded && answers.length > 0 && !answersSubmitted) {
      console.log('[GameBoard] Rodada terminou - enviando respostas automaticamente');
      submitAnswers();
      setAnswersSubmitted(true);
    }
    
    // Reset quando nova rodada começar
    if (roundStarted && !roundEnded) {
      setAnswersSubmitted(false);
    }
  }, [roundEnded, submitAnswers, answers.length, answersSubmitted, roundStarted]);

  // CORREÇÃO: Função para clicar STOP
  const handleStopClick = useCallback(() => {
    console.log('[GameBoard] Usuário clicou STOP - enviando respostas');
    submitAnswers();
    setAnswersSubmitted(true);
    if (handleStopRound) {
      handleStopRound();
    }
  }, [submitAnswers, handleStopRound]);

  // CORREÇÃO: Socket listeners sem dependências circulares
  useEffect(() => {
    const handleRoundStarted = (data) => {
      console.log('[GameBoard] Rodada iniciada com letra:', data.letter);
      setIsRoundActive(true);
      setRevealed(false);
      setCanReveal(false);
      setIsRevealing(false);
      setShowRoundResult(false);
      setRoundScore(0);
      setAnswersSubmitted(false); // CORREÇÃO: Reset flag
      
      // CORREÇÃO: Resetar respostas para nova rodada
      if (roomThemes && roomThemes.length > 0) {
        console.log('[GameBoard] Resetando respostas para nova rodada');
        updateAnswersWithThemes(roomThemes);
      }
    };

    const handleRoundEnded = () => {
      console.log('[GameBoard] Rodada finalizada');
      setIsRoundActive(false);
      setCanReveal(true);
    };

    const handleTimeUpRoundEnded = () => {
      console.log('[GameBoard] ⏰ Tempo esgotado - rodada finalizada');
      
      // CORREÇÃO: Enviar respostas imediatamente quando tempo esgotar
      if (answers.length > 0 && !answersSubmitted) {
        console.log('[GameBoard] ⏰ Enviando respostas devido ao tempo esgotado');
        submitAnswers();
        setAnswersSubmitted(true);
      }
      
      setRoundScore(0);
      setShowRoundResult(false);
      setIsRevealing(false);
      setCanReveal(false);
      setRevealed(false);
      setIsRoundActive(false); // CORREÇÃO: Marcar rodada como inativa
    };

    const handleNewRoundStarted = () => {
      console.log('[GameBoard] Nova rodada iniciada - resetando estados');
      
      // CORREÇÃO: Resetar completamente o array de respostas
      if (roomThemes && roomThemes.length > 0) {
        console.log('[GameBoard] Resetando respostas para temas:', roomThemes);
        setAnswers(roomThemes.map(theme => ({ 
          theme, 
          answer: "", 
          points: null, 
          reason: "", 
          validated: false 
        })));
      } else {
        setAnswers([]);
      }
      
      // Resetar todos os estados de validação e pontuação
      setRevealed(false);
      setCanReveal(false);
      setIsRevealing(false);
      setShowRoundResult(false);
      setRoundScore(null); // CORREÇÃO: null em vez de 0
      setTotalPoints(null); // CORREÇÃO: Manter total points para não perder histórico
      setIsRoundActive(false);
      setValidationData(null);
      setIsValidating(false);
      setShowModal(false);
      setAnswersSubmitted(false);
      setCurrentValidated(false);
      
      console.log('[GameBoard] Estados resetados para nova rodada');
    };

    const handleRoomConfig = (config) => {
      console.log('[GameBoard] Configuração da sala recebida:', config);
      if (config.themes && config.themes.length > 0 && setRoomThemes) {
        console.log('[GameBoard] Definindo temas da configuração:', config.themes);
        setRoomThemes(config.themes);
        // Não chamar updateAnswersWithThemes aqui - será chamado pelo useEffect
      }
    };

    const handleStartValidation = (data) => {
      console.log('[GameBoard] 🎯 start_validation received:', data);
      console.log('[GameBoard] - Current user ID:', userId);
      console.log('[GameBoard] - Judge ID:', data.judgeId);
      console.log('[GameBoard] - Is judge:', userId === data.judgeId);
      
      if (data.current) {
        setValidationData(data.current);
        setIsValidating(false); // CORREÇÃO: Reset estado
        setCurrentValidated(false); // CORREÇÃO: Reset estado
        setRevealed(false); // CORREÇÃO: Reset revealed
        
        if (userId === data.judgeId) {
          console.log('[GameBoard] 👨‍⚖️ User is judge - showing modal');
          setShowModal(true);
          setCanReveal(true);
        } else {
          console.log('[GameBoard] 👥 User is not judge - waiting for validation');
          setShowModal(false);
          setCanReveal(false);
        }
      } else {
        console.error('[GameBoard] ❌ start_validation received without current data');
      }
    };

    const handleAnswerValidated = (data) => {
      console.log('[GameBoard] Próxima resposta para validar:', data.current);
      if (data.current) {
        setValidationData(data.current);
        setCurrentValidated(false); // CORREÇÃO: Reset para permitir nova validação
        setIsValidating(false); // CORREÇÃO: Reset estado de validação
        setRevealed(false); // CORREÇÃO: Reset revealed para próxima resposta
      }
    };

    const handleValidationComplete = (data) => {
      console.log('[GameBoard] Validation complete data received:', data);
      
      if (data.myAnswers && data.roundComplete) {
        const updatedAnswers = [...answers];
        
        data.myAnswers.forEach((serverAnswer) => {
          const answerIndex = updatedAnswers.findIndex(a => a.theme === serverAnswer.theme);
          if (answerIndex !== -1) {
            updatedAnswers[answerIndex] = {
              ...updatedAnswers[answerIndex],
              answer: serverAnswer.answer || updatedAnswers[answerIndex].answer,
              points: serverAnswer.points || 0,
              reason: serverAnswer.reason || '',
              validated: true
            };
          }
        });
        
        setAnswers(updatedAnswers);
        
        const roundPoints = data.myScore || 0;
        const totalPoints = data.myTotalScore || 0;
        
        setTotalPoints(totalPoints);  
        setRoundScore(roundPoints);
        setShowRoundResult(true);
        
        setShowModal(false);
        setValidationData(null);
        setIsValidating(false);
        setIsRevealing(false);
        setCanReveal(false);
        setRevealed(false);
      }
    };

    const handleValidationCompleteForPlayer = (data) => {
      console.log('[GameBoard] Validation complete for specific player:', data);
      if (data.playerId === userId) {
        handleValidationComplete(data);
      }
    };

    const handleThemesUpdated = (data) => {
      console.log('[GameBoard] Temas atualizados:', data.themes);
      if (data.themes && data.themes.length > 0 && setRoomThemes) {
        setRoomThemes(data.themes);
        // updateAnswersWithThemes será chamado pelo useEffect
      }
    };

    const handleReveal = () => {
      console.log('[GameBoard] Revelar respostas ativado');
      setRevealed(true);
      setIsRevealing(false); // CORREÇÃO: Parar o loading
    };

    const handleNoAnswersToValidate = () => {
      console.log('[GameBoard] 📋 Não há respostas para validar');
      setShowRoundResult(true);
      setRoundScore(0);
      setIsValidating(false);
      setShowModal(false);
      
      if (setAlertState) {
        setAlertState({
          isVisible: true,
          message: "Nenhum jogador enviou respostas para validar.",
          type: "info"
        });
      }
    };

    const handleGameEnded = (ranking) => {
      console.log('[GameBoard] 🏁 Jogo encerrado - ranking final:', ranking);
      setFinalRanking(ranking);
      setShowRoundResult(false);
      setShowResults(false);
      setRoundScores(null);
      
      // Reset todos os estados do jogo
      setIsValidating(false);
      setShowModal(false);
      setValidationData(null);
      setIsRevealing(false);
      setCanReveal(false);
      setRevealed(false);
      setIsRoundActive(false);
      setAnswersSubmitted(false);
    };

    // Socket listeners
    socket.on("round_started", handleRoundStarted);
    socket.on("round_ended", handleRoundEnded);
    socket.on("time_up_round_ended", handleTimeUpRoundEnded);
    socket.on("new_round_started", handleNewRoundStarted);
    socket.on("room_config", handleRoomConfig);
    socket.on("start_validation", handleStartValidation);
    socket.on("answer_validated", handleAnswerValidated);
    socket.on("validation_complete", handleValidationComplete);
    socket.on("validation_complete_for_player", handleValidationCompleteForPlayer);
    socket.on("themes_updated", handleThemesUpdated);
    socket.on("reveal", handleReveal);
    socket.on("no_answers_to_validate", handleNoAnswersToValidate);
    socket.on("game_ended", handleGameEnded); // CORREÇÃO: Adicionar listener

    return () => {
      socket.off("round_started", handleRoundStarted);
      socket.off("round_ended", handleRoundEnded);
      socket.off("time_up_round_ended", handleTimeUpRoundEnded);
      socket.off("new_round_started", handleNewRoundStarted);
      socket.off("room_config", handleRoomConfig);
      socket.off("start_validation", handleStartValidation);
      socket.off("answer_validated", handleAnswerValidated);
      socket.off("validation_complete", handleValidationComplete);
      socket.off("validation_complete_for_player", handleValidationCompleteForPlayer);
      socket.off("themes_updated", handleThemesUpdated);
      socket.off("reveal", handleReveal);
      socket.off("no_answers_to_validate", handleNoAnswersToValidate);
      socket.off("game_ended", handleGameEnded); // CORREÇÃO: Remover listener
    };
  }, [userId, answers, setRoomThemes, setAlertState, roomThemes, updateAnswersWithThemes]);

  // CORREÇÃO: Funções com controle de múltiplos cliques
  const handleNewRound = useCallback(() => {
    if (!room || !isAdmin) {
      console.log('[GameBoard] Cannot start new round - not admin or no room');
      return;
    }
    
    console.log('[GameBoard] Solicitando nova rodada...');
    setShowRoundResult(false);
    setRoundScore(null);
    
    // Resetar respostas localmente
    if (roomThemes && roomThemes.length > 0) {
      setAnswers(roomThemes.map(theme => ({ 
        theme, 
        answer: "", 
        points: null, 
        reason: "", 
        validated: false 
      })));
    }
    
    socket.emit("new_round", { room });
  }, [room, isAdmin, roomThemes]);

  const handleEndGame = useCallback(() => {
    if (!room || !isAdmin) {
      console.log('[GameBoard] Cannot end game - not admin or no room');
      return;
    }
    
    console.log('[GameBoard] Solicitando fim de jogo...');
    setShowRoundResult(false);
    setRoundScore(null);
    
    socket.emit("end_game", { room });
  }, [room, isAdmin]);

  const handleLeaveRoom = useCallback(() => {
    console.log('[GameBoard] Saindo da sala...');
    socket.emit("leave_room");
    
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
  }, []);

  // CORREÇÃO: Componente de ranking final melhorado
  const FinalRanking = () => (
    <section className="bg-white p-6 rounded-xl shadow-lg dark:bg-gray-800" data-testid="final-ranking">
      <h3 className="text-3xl font-bold text-center text-blue-700 dark:text-blue-400 mb-6" data-testid="final-ranking-title">
        🏆 Ranking Final da Partida 🏆
      </h3>
      
      {finalRanking && finalRanking.length > 0 ? (
        <ol className="space-y-3" data-testid="ranking-list">
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
              data-testid={`ranking-item-${idx}`}
            >
              <span className="flex items-center gap-2" data-testid={`ranking-player-${idx}`}>
                {idx === 0 && "🥇"}
                {idx === 1 && "🥈"} 
                {idx === 2 && "🥉"}
                {idx > 2 && `${idx + 1}.`}
                {p.nickname}
              </span>
              <span className="text-2xl font-bold" data-testid={`ranking-score-${idx}`}>
                {p.totalScore || 0} pts
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="text-center text-gray-600 dark:text-gray-400">
          <p>Nenhum dado de ranking disponível</p>
        </div>
      )}
      
      <div className="text-center mt-8 space-y-4" data-testid="final-ranking-actions">
        {isAdmin && (
          <button
            onClick={handleNewRound}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition-colors mr-4"
            data-testid="new-game-btn"
          >
            🔄 Novo Jogo
          </button>
        )}
        <button
          onClick={handleLeaveRoom}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md transition-colors"
          data-testid="back-to-lobby-btn"
        >
          🏠 Voltar ao Lobby
        </button>
      </div>
    </section>
  );

  // CORREÇÃO: Adicionar função handleAddTheme que estava faltando
  const handleAddTheme = () => {
    if (!newTheme.trim() || !roomThemes || roomThemes.includes(newTheme.trim())) return;
    
    const updatedThemes = [...roomThemes, newTheme.trim()];
    if (setRoomThemes) setRoomThemes(updatedThemes);
    setNewTheme("");
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  };

  // CORREÇÃO: Adicionar função handleRemoveTheme que estava faltando
  const handleRemoveTheme = (index) => {
    if (!roomThemes) return;
    const updatedThemes = roomThemes.filter((_, i) => i !== index);
    if (setRoomThemes) setRoomThemes(updatedThemes);
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  };

  const handleAnswerChange = (index, value) => {
    const newAnswers = [...answers];
    newAnswers[index].answer = value;
    setAnswers(newAnswers);
  };

  const handleValidate = useCallback((isValid) => {
    if (!canReveal || !validationData || isValidating || currentValidated) {
      console.log('[GameBoard] Validation blocked:', { canReveal, validationData: !!validationData, isValidating, currentValidated });
      return;
    }

    console.log('[GameBoard] Validating answer:', isValid, 'for:', validationData.answer);
    setIsValidating(true);
    setCurrentValidated(true);
    socket.emit("validate_answer", { valid: isValid, room });
  }, [canReveal, validationData, isValidating, room, currentValidated]);

  // CORREÇÃO: Adicionar componente ValidationModal que estava faltando
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
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
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
      ) : (
        <>
          {/* Theme Management */}
          {isAdmin && !roundStarted && !roundEnded && !finalRanking && (
            <section className="bg-gray-50 p-4 rounded border dark:bg-gray-700 dark:border-gray-600">
              <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-100">
                🎯 Gerenciar Temas
              </h3>
              <div className="flex flex-col sm:flex-row gap-2 mb-3">
                <input
                  type="text"
                  placeholder="Novo Tema"
                  className="flex-grow p-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50"
                  value={newTheme}
                  onChange={(e) => setNewTheme(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTheme()}
                />
                <button
                  disabled={!roomThemes || roomThemes.length >= maxThemes}
                  onClick={handleAddTheme}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded shadow transition disabled:opacity-50"
                >
                  ➕ Adicionar
                </button>
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto mb-4">
                {roomThemes && roomThemes.map((theme, index) => (
                  <span
                    key={theme}
                    className="bg-blue-100 text-blue-800 rounded-full px-3 py-1 text-sm font-medium flex items-center dark:bg-blue-700 dark:text-blue-100"
                  >
                    <span>{theme}</span>
                    <button
                      onClick={() => handleRemoveTheme(index)}
                      className="ml-2 text-blue-600 hover:text-blue-900 font-bold dark:text-blue-300 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              
              <div className="text-sm text-gray-600 dark:text-gray-400">
                Total: {roomThemes ? roomThemes.length : 0}/{maxThemes} temas
              </div>
            </section>
          )}

          {/* Answers Grid */}
          {!finalRanking && (
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
                      a.points === 100 ? 'text-green-600' :        
                      a.points === 50 ? 'text-orange-500' :        
                      'text-red-600'                               
                    }`}>
                      {a.points} pontos
                    </div>
                  )}
                </div>
              ))}
            </section>
          )}

          {/* STOP Button */}
          {roundStarted && !roundEnded && !stopClickedByMe && !finalRanking && (
            <div className="text-center mt-4">
              <button
                onClick={handleStopClick}
                className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 rounded-lg font-bold text-lg shadow-md transition-colors animate-pulse"
              >
                🛑 STOP!
              </button>
            </div>
          )}

          {stopClickedByMe && roundStarted && !roundEnded && !finalRanking && (
            <div className="text-center text-red-600 font-bold text-lg dark:text-red-400">
              🛑 Você clicou em STOP! Aguardando outros jogadores...
            </div>
          )}

          {/* Validation Modal */}
          {showModal && validationData && <ValidationModal />}

          {/* Botões de controle */}
          {totalPoints !== null && !finalRanking && (
            <div className="mt-6 flex flex-col items-center space-y-4">
              {isAdmin && (
                <div className="flex space-x-4">
                  <button
                    onClick={handleNewRound}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
                  >
                    🔄 Nova Rodada
                  </button>
                  <button
                    onClick={handleEndGame}
                    className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-lg shadow-md font-semibold transition-colors"
                  >
                    🏁 Encerrar Partida
                  </button>
                </div>
              )}
              
              <button
                onClick={handleLeaveRoom}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg shadow transition-colors"
              >
                🚪 Sair da Sala
              </button>
            </div>
          )}

          {/* Resultado da Rodada */}
          {showRoundResult && roundScore !== null && !finalRanking && (
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900 dark:to-green-900 p-6 rounded-xl border-2 border-blue-200 dark:border-blue-700 text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="bg-blue-500 text-white rounded-full p-2 mr-3">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  🎯 Resultado da Rodada
                </h3>
              </div>
              
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6">
                <div className="text-4xl font-bold text-green-600 dark:text-green-400 mb-2">
                  +{roundScore} pontos
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-lg">
                  Pontos conquistados nesta rodada
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Ranking Final */}
      {finalRanking && <FinalRanking />}
    </div>
  );
}

socket.on('new_round', async ({ room }) => {
    try {
        console.log(`[Socket.io] Starting new round for room ${room}`);
        
        const config = roomConfigs[room];
        if (!config) {
            console.log(`[Socket.io] No config found for room ${room}`);
            return;
        }

        // CORREÇÃO: Limpar respostas antigas do gameState
        if (gameState.has(room)) {
            const roomState = gameState.get(room);
            roomState.answers.clear(); // CORREÇÃO: Limpar respostas
            roomState.currentValidation = null;
            roomState.playerScores = roomState.playerScores || new Map(); // Manter scores totais
            console.log(`[Socket.io] Cleared previous answers for room ${room}`);
        } else {
            initializeRoomState(room);
        }

        // Reset room config for new round
        config.roundActive = false;
        config.roundEnded = false;
        config.stopClickedByMe = null;
        config.currentLetter = null;

        await saveRoomConfigToFirestore(room, config);

        // Emitir evento de nova rodada
        io.to(room).emit("new_round_started");
        emitRoomConfig(room, config);
        
        console.log(`[Socket.io] New round initiated for room ${room}`);
    } catch (error) {
        console.error('[Socket.io] Error in new_round:', error);
    }
});