import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket";
import Modal from "./Modal"; // ✅ CORRIGIR: Descomentar import do Modal

function GameBoard({
  roundStarted,
  roundEnded,
  _onResetRound,
  _resetRoundFlag,
  letter,
  isAdmin,
  userId,
  roomThemes,
  setRoomThemes,
  roomDuration,
  stopClickedByMe,
  handleStopRound,
  room,
  _isRoomSaved,
  _handleSaveRoom,
  _alertState,
  setAlertState,
  validationState, // ✅ NOVO: Receber estado de validação
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
  const [_revealed, setRevealed] = useState(false);
  const [roundScore, setRoundScore] = useState(null);
  const [showRoundResult, setShowRoundResult] = useState(false);
  const [_isRoundActive, setIsRoundActive] = useState(false);
  const [_showResults, _setShowResults] = useState(false);
  const [currentValidated, setCurrentValidated] = useState(false);
  const [_roundScores, _setRoundScores] = useState(null);
  const [finalRanking, setFinalRanking] = useState(null);
  const [answersSubmitted, setAnswersSubmitted] = useState(false);
  
  // ✅ Estados para gerenciar sala
  const [duration, setDuration] = useState(60);
  const [isSaved, setIsSaved] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // ✅ ADICIONAR: Estado para mostrar botão de retomar validação
  const [showResumeButton, setShowResumeButton] = useState(false);

  const maxThemes = 20;

  // Temas padrão (não utilizados diretamente no momento)
  const _defaultThemes = [
    "Nome", "Cidade", "País", "Marca", "Cor", "Animal"
  ];

  // ✅ Função para atualizar respostas com temas (preparada para uso futuro)
  const _updateAnswersWithThemes = useCallback((themes) => {
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

  // ✅ Função para revelar resposta (preparada para uso futuro)
  const _handleRevealAnswer = useCallback(() => {
    console.log('[GameBoard] 🔍 Revelando resposta...', { canReveal, isRevealing, room });
    
    if (isRevealing) {
      console.log('[GameBoard] ❌ Já está revelando - ignorando');
      return;
    }
    
    setIsRevealing(true);
    console.log('[GameBoard] 📤 Emitindo reveal_answer para sala:', room);
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
      // ✅ CORRIGIR: Adicionar parênteses na função map
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

  // ✅ Função para salvar sala
  const handleSaveRoomConfig = useCallback(() => {
    if (!room || !isAdmin) {
      console.log('[GameBoard] Cannot save room - not admin or no room');
      return;
    }
    
    console.log('[GameBoard] Salvando configuração da sala...', {
      room,
      themes: roomThemes,
      duration: roomDuration || duration
    });
    
    socket.emit("save_room", { 
      room, 
      roomName: room,
      duration: roomDuration || duration
    });
  }, [room, isAdmin, roomThemes, roomDuration, duration]);

  // ✅ Funções de gerenciamento de temas
  const handleAddTheme = useCallback(() => {
    if (!newTheme.trim() || !roomThemes || roomThemes.includes(newTheme.trim())) return;
    
    const updatedThemes = [...roomThemes, newTheme.trim()];
    if (setRoomThemes) setRoomThemes(updatedThemes);
    setNewTheme("");
    setHasUnsavedChanges(true);
    setIsSaved(false);
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  }, [newTheme, roomThemes, setRoomThemes, room]);

  const handleRemoveTheme = useCallback((index) => {
    if (!roomThemes) return;
    const updatedThemes = roomThemes.filter((_, i) => i !== index);
    if (setRoomThemes) setRoomThemes(updatedThemes);
    setHasUnsavedChanges(true);
    setIsSaved(false);
    
    socket.emit("update_themes", { room, themes: updatedThemes });
  }, [roomThemes, setRoomThemes, room]);

  const handleAnswerChange = useCallback((index, value) => {
    const newAnswers = [...answers];
    newAnswers[index].answer = value;
    setAnswers(newAnswers);
  }, [answers]);

  // ✅ Função handleValidate (preparada para uso futuro)
  const _handleValidate = useCallback((isValid) => {
    if (!canReveal || !validationData || isValidating || currentValidated) {
      console.log('[GameBoard] Validation blocked:', { canReveal, validationData: !!validationData, isValidating, currentValidated });
      return;
    }

    console.log('[GameBoard] Validating answer:', isValid, 'for:', validationData.answer);
    setIsValidating(true);
    setCurrentValidated(true);
    socket.emit("validate_answer", { valid: isValid, room });
  }, [canReveal, validationData, isValidating, room, currentValidated]);

  // ✅ Função handleValidateAnswer
  const handleValidateAnswer = useCallback((isValid) => {
    if (!validationData || !validationData.isValidator) {
      console.log('[GameBoard] Não é o validador - ignorando');
      return;
    }

    console.log('[GameBoard] Validando resposta:', isValid, 'para:', validationData.answer);
    socket.emit("validate_answer", { valid: isValid, room });
  }, [validationData, room]);

  // ✅ Handlers de callback
  const handleValidationCompleteForPlayer = useCallback((data) => {
    console.log('[GameBoard] ✅ Validação individual completa:', data);
    
    if (data.myAnswers && Array.isArray(data.myAnswers)) {
      console.log('[GameBoard] 📋 Atualizando respostas com pontuações:', data.myAnswers);
      
      setAnswers(prevAnswers => {
        return prevAnswers.map(answer => {
          const validatedAnswer = data.myAnswers.find(va => va.theme === answer.theme);
          if (validatedAnswer) {
            return {
              ...answer,
              answer: validatedAnswer.answer || answer.answer, // ✅ Preservar resposta original
              points: validatedAnswer.points,
              reason: validatedAnswer.reason,
              validated: true // ✅ IMPORTANTE: Marcar como validada
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
  }, []);

  const handleGameEnded = useCallback((data) => {
    console.log('[GameBoard] 🏁 Jogo finalizado:', data);
    
    if (data.finalRanking && Array.isArray(data.finalRanking)) {
      setFinalRanking(data.finalRanking);
      setShowRoundResult(false); 
      setRoundScore(null);
    }
  }, []);

  const handleNoAnswersToValidate = useCallback(() => {
    console.log('[GameBoard] ❌ Nenhuma resposta para validar');
    setShowModal(false);
    setValidationData(null);
  }, []);

  // ✅ useEffect para inicializar respostas
  useEffect(() => {
    if (roomThemes && roomThemes.length > 0) {
      console.log('[GameBoard] Atualizando respostas com temas:', roomThemes);
      setAnswers(roomThemes.map(theme => ({ 
        theme, 
        answer: "", 
        points: null, 
        reason: "", 
        validated: false 
      })));
    }
  }, [roomThemes]);

  // ✅ useEffect para preservar respostas
  useEffect(() => {
    if (roomThemes && roomThemes.length > 0 && answers.length > 0) {
      console.log('[GameBoard] Preservando respostas existentes ao atualizar temas');
      
      setAnswers(prevAnswers => {
        const newAnswers = roomThemes.map(theme => {
          const existingAnswer = prevAnswers.find(a => a.theme === theme);
          
          if (existingAnswer) {
            return existingAnswer;
          } else {
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

  // ✅ useEffect para duração
  useEffect(() => {
    if (typeof roomDuration === 'number' && roomDuration !== duration) {
      console.log('[GameBoard] Duração alterada pelo Timer:', roomDuration);
      setDuration(roomDuration);
      setHasUnsavedChanges(true);
      setIsSaved(false);
    }
  }, [roomDuration, duration]);

  // ✅ Socket listeners
  useEffect(() => {
    console.log('[GameBoard] Configurando event listeners');

    const handleRoomConfig = (config) => {
      console.log('[GameBoard] Configuração da sala recebida:', config);
      
      if (config.themes && config.themes.length > 0 && setRoomThemes) {
        console.log('[GameBoard] Aplicando temas da configuração recebida:', config.themes);
        setRoomThemes(config.themes);
      }
      
      if (typeof config.duration === 'number') {
        setDuration(config.duration);
      }
      
      setIsSaved(config.isSaved || false);
      setHasUnsavedChanges(false);
    };

    const handleThemesUpdated = ({ themes: newThemes }) => {
      console.log('[GameBoard] Temas atualizados recebidos:', newThemes);
      if (setRoomThemes) {
        setRoomThemes(newThemes);
      }
      setHasUnsavedChanges(true);
      setIsSaved(false);
    };

    const handleRoomSaved = () => {
      console.log('[GameBoard] Sala salva com sucesso!');
      setIsSaved(true);
      setHasUnsavedChanges(false);
    };

    const handleRoundStarted = (data) => {
      console.log('[GameBoard] Rodada iniciada com letra:', data.letter);
      setIsRoundActive(true);
      setRevealed(false);
      setCanReveal(false);
      setIsRevealing(false);
      setShowRoundResult(false);
      setRoundScore(0);
      setAnswersSubmitted(false);
      
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
      console.log('[GameBoard] 🔄 Nova rodada iniciada - resetando estados');
      
      setAnswers(_prevAnswers => {
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

    const handleValidationStart = (data) => {
      console.log('[GameBoard] 🔍 Recebido start_validation:', data);
      console.log('[GameBoard] 🎯 Meu socket.userId:', socket.userId);
      console.log('[GameBoard] 🎯 Meu userId (props):', userId);
      console.log('[GameBoard] 🎯 ValidatorId recebido:', data.validatorId);
      
      const myUserId = socket.userId || userId;
      console.log('[GameBoard] 🎯 UserId final usado:', myUserId);
      console.log('[GameBoard] 🎯 Sou o validador?', myUserId === data.validatorId);
      
      // ✅ Atualizar dados de validação
      setValidationData({
        ...data,
        isValidator: myUserId === data.validatorId,
        myUserId: myUserId
      });
      
      setShowModal(true);
      setShowResumeButton(false); // ✅ Esconder botão quando modal abre
    };

    const handleAnswerValidated = (data) => {
      console.log('[GameBoard] ✅ Resposta validada para todos:', data);
      
      setValidationData(prevData => ({
        ...prevData,
        showResult: true,
        resultData: {
          valid: data.valid,
          playerNickname: data.playerNickname,
          answer: data.answer,
          theme: data.theme
        }
      }));

      setTimeout(() => {
        setValidationData(prevData => ({
          ...prevData,
          showResult: false,
          resultData: null
        }));
      }, 2000);
    };

    const handleValidationComplete = (data) => {
      console.log('[GameBoard] 🏁 Validação completa:', data);
      
      setShowModal(false);
      setValidationData(null); // ✅ Apenas aqui limpar os dados
      setShowResumeButton(false); // ✅ E esconder o botão
      
      if (data.allAnswers) {
        console.log('[GameBoard] 📝 Mantendo respostas visíveis após validação');
      }
    };

    const handleReveal = (data) => {
      console.log('[GameBoard] 👁️ Resposta revelada:', data);
      setRevealed(true);
      setIsRevealing(false);
      
      if (validationData) {
        setValidationData(prevData => ({
          ...prevData,
          isRevealed: true,
          revealedData: data
        }));
      }
    };

    // ✅ ADICIONAR: Handler para validação cancelada
    const handleValidationCancelled = (data) => {
      console.log('[GameBoard] ⚠️ Validação cancelada:', data);
      
      setShowModal(false);
      setValidationData(null);
      setIsValidating(false);
      
      // Mostrar alerta sobre cancelamento
      if (setAlertState) {
        setAlertState({
          show: true,
          message: `Validação cancelada: ${data.reason}`,
          type: 'warning'
        });
      }
      
      // Após 3 segundos, tentar finalizar a rodada
      setTimeout(() => {
        setShowRoundResult(true);
        setRoundScore(0); // Pontuação padrão quando validação falha
      }, 3000);
    };

    // ✅ ADICIONAR: Handler para erros de validação
    const handleValidationError = (error) => {
        console.error('[GameBoard] Erro de validação:', error);
        setShowResumeButton(false);
        
        // Mostrar erro para o usuário
        if (setAlertState) {
            setAlertState({
                isVisible: true,
                message: error.message || 'Erro ao retomar validação',
                type: 'error'
            });
        }
    };

    socket.on('room_config', handleRoomConfig);
    socket.on('themes_updated', handleThemesUpdated);
    socket.on('room_saved_success', handleRoomSaved);
    socket.on("round_started", handleRoundStarted);
    socket.on("round_ended", handleRoundEnded);
    socket.on("time_up_round_ended", handleTimeUpRoundEnded);
    socket.on("new_round_started", handleNewRoundStarted);
    socket.on("start_validation", handleValidationStart);
    socket.on("answer_validated", handleAnswerValidated);
    socket.on("validation_complete", handleValidationComplete);
    socket.on("validation_complete_for_player", handleValidationCompleteForPlayer);
    socket.on("game_ended", handleGameEnded);
    socket.on("no_answers_to_validate", handleNoAnswersToValidate);
    socket.on("reveal", handleReveal);
    socket.on("validation_cancelled", handleValidationCancelled);
    socket.on('validation_error', handleValidationError);

    // Cleanup
    return () => {
      socket.off('room_config', handleRoomConfig);
      socket.off('themes_updated', handleThemesUpdated);
      socket.off('room_saved_success', handleRoomSaved);
      socket.off("round_started", handleRoundStarted);
      socket.off("round_ended", handleRoundEnded);
      socket.off("time_up_round_ended", handleTimeUpRoundEnded);
      socket.off("new_round_started", handleNewRoundStarted);
      socket.off("start_validation", handleValidationStart);
      socket.off("answer_validated", handleAnswerValidated);
      socket.off("validation_complete", handleValidationComplete);
      socket.off("validation_complete_for_player", handleValidationCompleteForPlayer);
      socket.off("game_ended", handleGameEnded);
      socket.off("no_answers_to_validate", handleNoAnswersToValidate);
      socket.off("reveal", handleReveal);
      socket.off("validation_cancelled", handleValidationCancelled);
      socket.off('validation_error', handleValidationError);
    };
  }, [room, setRoomThemes, roomThemes, answersSubmitted, handleValidationCompleteForPlayer, handleGameEnded, handleNoAnswersToValidate, userId, validationData, setAlertState]);

  // ✅ useEffect para configuração inicial
  useEffect(() => {
    if (room) {
      console.log('[GameBoard] Solicitando configuração inicial da sala:', room);
      socket.emit('get_room_config', { room });
    }
  }, [room]);

  // ✅ ADICIONAR: useEffect para detectar validação em progresso
  useEffect(() => {
    // Verificar se há validação em progresso e se sou o validador
    console.log('[GameBoard] 🔍 Verificando estado de validação:', {
      validationState,
      showModal,
      userId,
      validationData
    });

    // ✅ NOVA LÓGICA: Mostrar botão se:
    // 1. Há validação em progresso no estado global (validationState)
    // 2. Sou o validador
    // 3. A modal não está aberta OU há dados de validação disponíveis
    const shouldShowButton = (
      validationState?.isValidating && 
      validationState?.isValidator && 
      !showModal
    ) || (
      validationData && 
      validationData.isValidator && 
      !showModal
    );

    if (shouldShowButton) {
      console.log('[GameBoard] 🔍 Validação em progresso detectada - mostrando botão de retomar');
      setShowResumeButton(true);
    } else {
      setShowResumeButton(false);
    }
  }, [validationState, showModal, userId, validationData]);

  // ✅ ADICIONAR: Função para retomar validação
  const handleResumeValidation = useCallback(() => {
    console.log('[GameBoard] 🔄 Retomando validação...');
    
    if (!socket || !room) {
      console.error('[GameBoard] Socket ou sala não disponível');
      return;
    }

    // ✅ Se há dados de validação, apenas reabrir a modal
    if (validationData && validationData.isValidator) {
      console.log('[GameBoard] 📱 Reabrindo modal com dados existentes');
      setShowModal(true);
      setShowResumeButton(false);
      return;
    }

    // ✅ Se não há dados, solicitar retomada do servidor
    console.log('[GameBoard] 📡 Solicitando retomada da validação ao servidor');
    socket.emit('resume_validation', { 
      room, 
      userId 
    });
    setShowResumeButton(false);
  }, [room, userId, validationData]);

  // ✅ Render principal
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      {/* ✅ ADICIONAR: Botão "Voltar à correção" */}
      {showResumeButton && (
        <div className="mb-4 p-4 bg-orange-100 border border-orange-300 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-orange-800">
                🔍 Validação em Progresso
              </h3>
              <p className="text-orange-700 text-sm">
                Você é o validador e há uma correção em andamento.
              </p>
            </div>
            <button
              onClick={handleResumeValidation}
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-200 flex items-center gap-2"
            >
              <span>🎯</span>
              Voltar à correção
            </button>
          </div>
        </div>
      )}

      {letter && roundStarted && !roundEnded && (
        <div className="text-3xl text-center font-bold text-blue-700 mb-4 select-none dark:text-blue-400">
          Letra da rodada: <span className="text-5xl">{letter}</span>
        </div>
      )}

      {finalRanking ? (
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
                    idx === 0 ? "bg-yellow-400 text-gray-900 font-bold dark:bg-yellow-500 dark:text-gray-900" :
                    idx === 1 ? "bg-gray-300 text-gray-800 font-semibold dark:bg-gray-500 dark:text-gray-100" :
                    idx === 2 ? "bg-orange-300 text-gray-800 font-semibold dark:bg-orange-500 dark:text-gray-100" :
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
                    className={`w-full p-2 border rounded dark:bg-gray-800 dark:border-gray-600 dark:text-gray-50 disabled:bg-gray-200 dark:disabled:bg-gray-600 ${
                      a.points !== null && a.points === 0 ? 'border-red-300 bg-red-50 dark:border-red-600 dark:bg-red-900' :
                      a.points !== null && a.points === 50 ? 'border-orange-300 bg-orange-50 dark:border-orange-600 dark:bg-orange-900' :
                      a.points !== null && a.points === 100 ? 'border-green-300 bg-green-50 dark:border-green-600 dark:bg-green-900' :
                      ''
                    }`}
                    value={a.answer || ""} 
                    onChange={(e) => handleAnswerChange(i, e.target.value)}
                  />
                  {/* ✅ MELHORAR: Sempre mostrar pontuação quando disponível */}
                  {a.points !== null && a.validated && (
                    <div className="mt-2 space-y-1">
                      <div className={`text-right font-bold ${
                        a.points === 100 ? 'text-green-600' :        
                        a.points === 50 ? 'text-orange-500' :        
                        'text-red-600'                               
                      }`}>
                        {a.points} pontos
                      </div>
                      
                      <div className="text-xs text-right text-gray-600 dark:text-gray-400">
                        {a.points === 100 && '🟢 Resposta única válida'}
                        {a.points === 50 && '🟡 Resposta repetida válida'} 
                        {a.points === 0 && '🔴 Resposta incorreta/vazia'}
                      </div>
                      
                      {a.reason && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                          "{a.reason}"
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* ✅ ADICIONAR: Mostrar status de validação */}
                  {roundEnded && !a.validated && (
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      ⏳ Aguardando validação...
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
          {showModal && validationData && (
            <Modal 
              onClose={() => {
                console.log('[GameBoard] 🔒 Fechando modal de validação');
                
                // ✅ IMPORTANTE: Apenas fechar modal, mas preservar validationData
                setShowModal(false);
                
                // ✅ NÃO limpar validationData para que o botão apareça
                // setValidationData(null); // ❌ REMOVER esta linha
                
                // ✅ Se é o validador, mostrar botão após fechar
                if (validationData.isValidator) {
                  setTimeout(() => {
                    setShowResumeButton(true);
                  }, 100);
                }
              }}
              title="🎯 Validação de Resposta"
            >
              <div className="space-y-4">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                    style={{ 
                      width: `${(validationData.currentIndex / validationData.totalItems) * 100}%` 
                    }}
                  ></div>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                  {validationData.currentIndex} de {validationData.totalItems}
                </p>

                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <p className="text-gray-800 dark:text-gray-200"><strong>Jogador:</strong> {validationData.playerNickname}</p>
                  <p className="text-gray-800 dark:text-gray-200"><strong>Tema:</strong> {validationData.theme}</p>
                  <p className="text-gray-800 dark:text-gray-200"><strong>Resposta:</strong> 
                      <span className={`ml-2 px-2 py-1 rounded ${
                          !validationData.answer || validationData.answer.trim() === "" 
                              ? "bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300" 
                              : "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300"
                      }`}>
                          {!validationData.answer || validationData.answer.trim() === "" 
                              ? "Vazia" 
                              : validationData.answer
                          }
                      </span>
                  </p>
                  
                  {!validationData.isValidator && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                          <strong>Validador:</strong> {validationData.validatorNickname}
                      </p>
                  )}
                </div>

                {validationData.showResult && validationData.resultData && (
                    <div className={`p-4 rounded-lg text-center ${
                        validationData.resultData.valid 
                            ? 'bg-green-100 dark:bg-green-900/30 border-green-500 border-2' 
                            : 'bg-red-100 dark:bg-red-900/30 border-red-500 border-2'
                    }`}>
                        <p className="font-bold text-lg text-gray-800 dark:text-gray-200">
                            {validationData.resultData.valid ? '✅ VÁLIDA' : '❌ INVÁLIDA'}
                        </p>
                        <p className="text-sm mt-1 text-gray-600 dark:text-gray-400">
                            {validationData.resultData.playerNickname} - {validationData.resultData.theme}: "{validationData.resultData.answer}"
                        </p>
                    </div>
                )}

                {/* ✅ CORRIGIR: Apenas botões de validação para validador */}
                {validationData.isValidator && !validationData.showResult && (
                    <div className="flex gap-4">
                        <button
                            className="flex-1 bg-green-600 text-white py-3 px-4 rounded-lg hover:bg-green-700 transition-colors font-medium"
                            onClick={() => {
                                console.log('[GameBoard] Clicou em VÁLIDA');
                                handleValidateAnswer(true);
                            }}
                        >
                            ✅ Válida
                        </button>
                        <button
                            className="flex-1 bg-red-600 text-white py-3 px-4 rounded-lg hover:bg-red-700 transition-colors font-medium"
                            onClick={() => {
                                console.log('[GameBoard] Clicou em INVÁLIDA');
                                handleValidateAnswer(false);
                            }}
                        >
                            ❌ Inválida
                        </button>
                    </div>
                )}

                {/* Para espectadores: apenas texto informativo */}
                {!validationData.isValidator && (
                    <div className="text-center text-gray-600 dark:text-gray-400 text-sm">
                        <p>Aguardando validação de <strong>{validationData.validatorNickname}</strong></p>
                    </div>
                )}
              </div>
            </Modal>
          )}

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
            <div className="mt-6 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/50 dark:to-green-900/50 p-6 rounded-xl border-2 border-blue-200 dark:border-blue-700 text-center">
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

    </div>
  );
};

export default GameBoard;