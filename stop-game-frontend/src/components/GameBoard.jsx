import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket";
import Modal from "./Modal";

function GameBoard({
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
  const [answersSubmitted, setAnswersSubmitted] = useState(false);
  
  const maxThemes = 20;

  // Temas padrão
  const defaultThemes = [
    "Nome", "Cidade", "País", "Marca", "Cor", "Animal"
  ];

  // ✅ Função para atualizar respostas com temas
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
  }, []);

  // ✅ Função para enviar respostas
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

  // ✅ Função para clicar STOP
  const handleStopClick = useCallback(() => {
    console.log('[GameBoard] Usuário clicou STOP - enviando respostas');
    submitAnswers();
    setAnswersSubmitted(true);
    if (handleStopRound) {
      handleStopRound();
    }
  }, [submitAnswers, handleStopRound]);

  // ✅ Função para revelar resposta
  const handleRevealAnswer = useCallback(() => {
    if (!canReveal || isRevealing) return;
    
    setIsRevealing(true);
    socket.emit("reveal_answer", { room });
  }, [canReveal, isRevealing, room]);

  // ✅ Funções de gerenciamento de sala
  const handleNewRound = useCallback(() => {
    if (!room || !isAdmin) {
      console.log('[GameBoard] Cannot start new round - not admin or no room');
      return;
    }
    
    console.log('[GameBoard] Solicitando nova rodada...');
    setShowRoundResult(false);
    setRoundScore(null);
    
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

  // ✅ Estados para gerenciar sala (mover para cima, antes dos handlers duplicados)
  const [duration, setDuration] = useState(60);
  const [isSaved, setIsSaved] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // ✅ Função para salvar sala
  const handleSaveRoomConfig = useCallback(() => {
    if (!room || !isAdmin) {
      console.log('[GameBoard] Cannot save room - not admin or no room');
      return;
    }
    
    console.log('[GameBoard] Salvando configuração da sala...', {
      room,
      themes: roomThemes,
      duration: roomDuration || duration // ✅ Usar roomDuration se disponível
    });
    
    socket.emit("save_room", { 
      room, 
      roomName: room,
      duration: roomDuration || duration // ✅ Incluir duração no salvamento
    });
  }, [room, isAdmin, roomThemes, roomDuration, duration]);

  // ✅ Funções de gerenciamento de temas (corrigir para marcar como alterado)
  const handleAddTheme = useCallback(() => {
    if (!newTheme.trim() || !roomThemes || roomThemes.includes(newTheme.trim())) return;
    
    const updatedThemes = [...roomThemes, newTheme.trim()];
    if (setRoomThemes) setRoomThemes(updatedThemes);
    setNewTheme("");
    setHasUnsavedChanges(true); // ✅ Marcar como alterado
    setIsSaved(false); // ✅ Não está mais salva
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  }, [newTheme, roomThemes, setRoomThemes, room]);

  const handleRemoveTheme = useCallback((index) => {
    if (!roomThemes) return;
    const updatedThemes = roomThemes.filter((_, i) => i !== index);
    if (setRoomThemes) setRoomThemes(updatedThemes);
    setHasUnsavedChanges(true); // ✅ Marcar como alterado
    setIsSaved(false); // ✅ Não está mais salva
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  }, [roomThemes, setRoomThemes, room]);

  const handleAnswerChange = useCallback((index, value) => {
    const newAnswers = [...answers];
    newAnswers[index].answer = value;
    setAnswers(newAnswers);
  }, [answers]);

  // ✅ Adicionar função handleValidate que está faltando
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

  // ✅ CORRIGIR: Inicializar respostas quando temas mudarem
  useEffect(() => {
    if (roomThemes && roomThemes.length > 0) {
      console.log('[GameBoard] Atualizando respostas com temas:', roomThemes);
      // ✅ SEMPRE atualizar quando temas mudarem, não só quando answers.length === 0
      setAnswers(roomThemes.map(theme => ({ 
        theme, 
        answer: "", 
        points: null, 
        reason: "", 
        validated: false 
      })));
    }
  }, [roomThemes]); // ✅ REMOVER answers.length da dependência

  // ✅ CORRIGIR: Preservar respostas quando temas são atualizados
  useEffect(() => {
    if (roomThemes && roomThemes.length > 0 && answers.length > 0) {
      console.log('[GameBoard] Preservando respostas existentes ao atualizar temas');
      
      setAnswers(prevAnswers => {
        const newAnswers = roomThemes.map(theme => {
          // ✅ Procurar resposta existente para este tema
          const existingAnswer = prevAnswers.find(a => a.theme === theme);
          
          if (existingAnswer) {
            // ✅ Manter resposta existente
            return existingAnswer;
          } else {
            // ✅ Criar nova resposta vazia para tema novo
            return {
              theme,
              answer: "",
              points: null,
              reason: "",
              validated: false
            };
          }
        });
        
        return newAnswers;
      });
    }
  }, [roomThemes, answers.length]);

  // ✅ ADICIONAR: Escutar mudanças na duração do roomDuration (props)
  useEffect(() => {
    if (typeof roomDuration === 'number' && roomDuration !== duration) {
      console.log('[GameBoard] Duração alterada pelo Timer:', roomDuration);
      setDuration(roomDuration);
      setHasUnsavedChanges(true); // ✅ Marcar como alterado
      setIsSaved(false); // ✅ Não está mais salva
    }
  }, [roomDuration, duration]);

  // ✅ Socket listeners existente...
  useEffect(() => {
    console.log('[GameBoard] Configurando event listeners');

    const handleRoomConfig = (config) => {
      console.log('[GameBoard] Configuração da sala recebida:', config);
      
      if (config.themes && config.themes.length > 0 && setRoomThemes) {
        console.log('[GameBoard] Aplicando temas da configuração recebida:', config.themes);
        setRoomThemes(config.themes);
      }
      
      // ✅ Atualizar duração
      if (typeof config.duration === 'number') {
        setDuration(config.duration);
      }
      
      // ✅ Atualizar status de salva
      setIsSaved(config.isSaved || false);
      setHasUnsavedChanges(false); // ✅ Resetar mudanças não salvas
    };

    const handleThemesUpdated = ({ themes: newThemes }) => {
      console.log('[GameBoard] Temas atualizados recebidos:', newThemes);
      if (setRoomThemes) {
        setRoomThemes(newThemes);
      }
      setHasUnsavedChanges(true); // ✅ Marcar como alterado
      setIsSaved(false); // ✅ Não está mais salva
    };

    // ✅ Handler para quando sala é salva
    const handleRoomSaved = () => {
      console.log('[GameBoard] Sala salva com sucesso!');
      setIsSaved(true);
      setHasUnsavedChanges(false);
    };

    // ✅ REMOVER handleDurationUpdated - não precisamos mais
    // A duração é controlada pelo Timer component

    const handleRoundStarted = (data) => {
      console.log('[GameBoard] Rodada iniciada com letra:', data.letter);
      setIsRoundActive(true);
      setRevealed(false);
      setCanReveal(false);
      setIsRevealing(false);
      setShowRoundResult(false);
      setRoundScore(0);
      setAnswersSubmitted(false);
      
      // ✅ Usar callback para evitar dependência de roomThemes
      setAnswers(prevAnswers => {
        if (roomThemes && roomThemes.length > 0) {
          console.log('[GameBoard] Resetando respostas para nova rodada');
          return roomThemes.map(theme => ({ 
            theme, 
            answer: "", 
            points: null, 
            reason: "", 
            validated: false 
          }));
        }
        return prevAnswers;
      });
    };

    const handleRoundEnded = () => {
      console.log('[GameBoard] Rodada finalizada');
      setIsRoundActive(false);
      setCanReveal(true);
    };

    const handleTimeUpRoundEnded = () => {
      console.log('[GameBoard] ⏰ Tempo esgotado - rodada finalizada');
      
      // ✅ Usar callback para evitar dependência
      setAnswers(prevAnswers => {
        if (prevAnswers.length > 0 && !answersSubmitted) {
          console.log('[GameBoard] ⏰ Enviando respostas devido ao tempo esgotado');
          const answersToSubmit = prevAnswers.map(a => ({
            theme: a.theme,
            answer: a.answer || ""
          }));
          socket.emit("submit_answers", { room, answers: answersToSubmit });
          setAnswersSubmitted(true);
        }
        return prevAnswers;
      });
      
      setRoundScore(0);
      setShowRoundResult(false);
      setIsRevealing(false);
      setCanReveal(false);
      setRevealed(false);
      setIsRoundActive(false);
    };

    const handleNewRoundStarted = () => {
      console.log('[GameBoard] Nova rodada iniciada - resetando estados');
      
      // ✅ Usar callback para evitar dependência
      setAnswers(prevAnswers => {
        if (roomThemes && roomThemes.length > 0) {
          console.log('[GameBoard] Resetando respostas para temas:', roomThemes);
          return roomThemes.map(theme => ({ 
            theme, 
            answer: "", 
            points: null, 
            reason: "", 
            validated: false 
          }));
        }
        return [];
      });
      
      setRevealed(false);
      setCanReveal(false);
      setIsRevealing(false);
      setShowRoundResult(false);
      setRoundScore(null);
      setIsRoundActive(false);
      setValidationData(null);
      setIsValidating(false);
      setShowModal(false);
      setAnswersSubmitted(false);
      setCurrentValidated(false);
    };

    const handleStartValidation = (data) => {
      console.log('[GameBoard] Validation started:', data);
      setValidationData(data);
      setShowModal(true);
      setCanReveal(false);
      setRevealed(false);
      setIsRevealing(false);
      setCurrentValidated(false);
    };

    const handleReveal = (data) => {
      console.log('[GameBoard] Answer revealed:', data);
      setRevealed(true);
      setCanReveal(true);
      setIsRevealing(false);
    };

    const handleAnswerValidated = (data) => {
      console.log('[GameBoard] Answer validated:', data);
      setIsValidating(false);
      setCurrentValidated(false);
    };

    const handleValidationComplete = (data) => {
      console.log('[GameBoard] Validation complete:', data);
      setShowModal(false);
      setValidationData(null);
      setCanReveal(false);
      setRevealed(false);
    };

    const handleValidationCompleteForPlayer = (data) => {
      console.log('[GameBoard] Validation complete for player:', data);
      
      if (data.myAnswers && Array.isArray(data.myAnswers)) {
        setAnswers(prevAnswers => {
          return prevAnswers.map(answer => {
            const validatedAnswer = data.myAnswers.find(va => va.theme === answer.theme);
            if (validatedAnswer) {
              return {
                ...answer,
                points: validatedAnswer.points,
                reason: validatedAnswer.reason,
                validated: true
              };
            }
            return answer;
          });
        });
      }
      
      if (typeof data.myScore === 'number') {
        setRoundScore(data.myScore);
        setShowRoundResult(true);
      }
      
      if (typeof data.myTotalScore === 'number') {
        setTotalPoints(data.myTotalScore);
      }
    };

    const handleGameEnded = (ranking) => {
      console.log('[GameBoard] Game ended with ranking:', ranking);
      setFinalRanking(ranking);
      setIsRoundActive(false);
    };

    const handleNoAnswersToValidate = () => {
      console.log('[GameBoard] No answers to validate');
      setShowModal(false);
      setValidationData(null);
    };

    // ✅ Registrar listeners
    socket.on('room_config', handleRoomConfig);
    socket.on('themes_updated', handleThemesUpdated);
    socket.on('room_saved_success', handleRoomSaved);
    // socket.on('duration_updated', handleDurationUpdated); // ✅ REMOVER
    socket.on("round_started", handleRoundStarted);
    socket.on("round_ended", handleRoundEnded);
    socket.on("time_up_round_ended", handleTimeUpRoundEnded);
    socket.on("new_round_started", handleNewRoundStarted);
    socket.on("start_validation", handleStartValidation);
    socket.on("reveal", handleReveal);
    socket.on("answer_validated", handleAnswerValidated);
    socket.on("validation_complete", handleValidationComplete);
    socket.on("validation_complete_for_player", handleValidationCompleteForPlayer);
    socket.on("game_ended", handleGameEnded);
    socket.on("no_answers_to_validate", handleNoAnswersToValidate);

    // ✅ Cleanup
    return () => {
      socket.off('room_config', handleRoomConfig);
      socket.off('themes_updated', handleThemesUpdated);
      socket.off('room_saved_success', handleRoomSaved);
      // socket.off('duration_updated', handleDurationUpdated); // ✅ REMOVER
      socket.off("round_started", handleRoundStarted);
      socket.off("round_ended", handleRoundEnded);
      socket.off("time_up_round_ended", handleTimeUpRoundEnded);
      socket.off("new_round_started", handleNewRoundStarted);
      socket.off("start_validation", handleStartValidation);
      socket.off("reveal", handleReveal);
      socket.off("answer_validated", handleAnswerValidated);
      socket.off("validation_complete", handleValidationComplete);
      socket.off("validation_complete_for_player", handleValidationCompleteForPlayer);
      socket.off("game_ended", handleGameEnded);
      socket.off("no_answers_to_validate", handleNoAnswersToValidate);
    };
  }, [room, setRoomThemes]);

  // ✅ useEffect separado para solicitar configuração inicial
  useEffect(() => {
    if (room) {
      console.log('[GameBoard] Solicitando configuração inicial da sala:', room);
      socket.emit('get_room_config', { room });
    }
  }, [room]); // ✅ Executar apenas quando 'room' mudar

  // ...existing code do resto do componente

  // ✅ Componentes
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

  const FinalRanking = () => (
    <section className="bg-white p-6 rounded-xl shadow-lg dark:bg-gray-800">
      <h3 className="text-3xl font-bold text-center text-blue-700 dark:text-blue-400 mb-6">
        🏆 Ranking Final da Partida 🏆
      </h3>
      
      {finalRanking && finalRanking.length > 0 ? (
        <ol className="space-y-3">
          {finalRanking.map((p, idx) => (
            <li
              key={p.playerId}
              className={`flex justify-between items-center p-4 rounded-lg ${
                idx === 0 ? "bg-yellow-400 text-gray-900 font-bold" :
                idx === 1 ? "bg-gray-300 text-gray-800 font-semibold" :
                idx === 2 ? "bg-orange-300 text-gray-800 font-semibold" :
                "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-100"
              }`}
            >
              <span className="flex items-center gap-2">
                {idx === 0 && "🥇"}
                {idx === 1 && "🥈"} 
                {idx === 2 && "🥉"}
                {idx > 2 && `${idx + 1}.`}
                {p.nickname}
              </span>
              <span className="text-2xl font-bold">
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
      
      <div className="text-center mt-8 space-y-4">
        {isAdmin && (
          <button
            onClick={handleNewRound}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-semibold shadow-md transition-colors mr-4"
          >
            🔄 Novo Jogo
          </button>
        )}
        <button
          onClick={handleLeaveRoom}
          className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-lg font-semibold shadow-md transition-colors"
        >
          🏠 Voltar ao Lobby
        </button>
      </div>
    </section>
  );

  // ✅ Render principal
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      {letter && roundStarted && !roundEnded && (
        <div className="text-3xl text-center font-bold text-blue-700 mb-4 select-none dark:text-blue-400">
          Letra da rodada: <span className="text-5xl">{letter}</span>
        </div>
      )}

      {finalRanking ? (
        <FinalRanking />
      ) : (
        <>
          {/* Theme Management */}
          {isAdmin && !roundStarted && !roundEnded && !finalRanking && (
            <section className="bg-gray-50 p-4 rounded border dark:bg-gray-700 dark:border-gray-600 mb-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-100">
                  🎯 Gerenciar Temas
                </h3>
                
                {/* Status da Sala */}
                <div className="flex items-center gap-2">
                  {isSaved && !hasUnsavedChanges ? (
                    <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium dark:bg-green-800 dark:text-green-100">
                      💾 Sala Salva
                    </span>
                  ) : (
                    <button
                      onClick={handleSaveRoomConfig}
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg shadow transition font-medium"
                    >
                      💾 Salvar Sala
                    </button>
                  )}
                  
                  {/* Indicador de mudanças não salvas */}
                  {hasUnsavedChanges && (
                    <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium dark:bg-orange-800 dark:text-orange-100">
                      ⚠️ Alterações não salvas
                    </span>
                  )}
                </div>
              </div>

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

      {finalRanking && <FinalRanking />}
    </div>
  );
};

export default GameBoard;