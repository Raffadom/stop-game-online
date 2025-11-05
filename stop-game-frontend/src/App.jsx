import { useState, useEffect, useCallback } from 'react';
import { socket } from './socket';
import _Home from './components/Home';
import _Room from './components/Room';
import { v4 as uuidv4 } from 'uuid';
import './App.css';
import { useSessionPersistence } from "./hooks/useSessionPersistence";

function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [userId, setUserId] = useState(null);
  const [nickname, setNickname] = useState('');
  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  
  // Estados para a sala
  const [playersInRoom, setPlayersInRoom] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roomThemes, setRoomThemes] = useState([]);
  const [roomDuration, setRoomDuration] = useState(180);
  const [letter, setLetter] = useState('');
  const [roundStarted, setRoundStarted] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [resetRoundFlag, setResetRoundFlag] = useState(0);
  const [stopClickedByMe, setStopClickedByMe] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const [isRoomSaved, setIsRoomSaved] = useState(false);
  const [alertState, setAlertState] = useState({
    isVisible: false,
    message: '',
    type: ''
  });

  // ✅ ADICIONAR: Estados que estão faltando
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [validationState, setValidationState] = useState(null);
  
  // ✅ NOVO: Estado global para o tema
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme');
    return savedTheme ? savedTheme : 'light';
  });

  // ✅ NOVO: Estado para filtro de letras
  const [excludeXWYZ, setExcludeXWYZ] = useState(false);

  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // ✅ ADICIONAR: Hook de persistência
  const { 
    sessionData, 
    saveSession, 
    loadSession, 
    clearSession,
    saveValidationState,    
    loadValidationState,    
    clearValidationState    
  } = useSessionPersistence();

  // ✅ DEFINIR: Todas as funções de handler que estão faltando
  const handleRoomJoined = useCallback((data) => {
    console.log('[App] Entrou na sala:', data);
    
    setCurrentPage('room');
    setPlayersInRoom(data.players || []);
    setIsAdmin(data.player?.isCreator || false);
    setIsReconnecting(false);
    
    // Salvar sessão
    saveSession({
      userId: userId,
      nickname: nickname,
      roomName: roomName,
      isAdmin: data.player?.isCreator || false
    });
  }, [userId, nickname, roomName, saveSession]);

  const handleRoomCreated = useCallback((data) => {
    console.log('[App] Sala criada:', data);
    
    setCurrentPage('room');
    setPlayersInRoom(data.players || []);
    setIsAdmin(true);
    setIsReconnecting(false);
    
    // Salvar sessão
    saveSession({
      userId: userId,
      nickname: nickname,
      roomName: roomName,
      isAdmin: true
    });
  }, [userId, nickname, roomName, saveSession]);

  const handleRoomError = useCallback((error) => {
    console.error('[App] Erro da sala:', error);
    setRoomError(error.message || 'Erro desconhecido');
    setIsReconnecting(false);
  }, []);

  const handlePlayersUpdate = useCallback((players) => {
    console.log('[App] Lista de jogadores atualizada:', players);
    setPlayersInRoom(players || []);
  }, []);

  const handleRoundStartCountdown = useCallback((data) => {
    console.log('[App] Countdown iniciado:', data);
    setCountdown(data.countdown);
    setRoomError('');
  }, []);

  const handleRoundStarted = useCallback((data) => {
    console.log('[App] Rodada iniciada:', data);
    
    setRoundStarted(true);
    setRoundEnded(false);
    setLetter(data.letter || '');
    setCountdown(null);
    setStopClickedByMe(false);
    
    // Iniciar timer
    if (data.duration) {
      setTimeLeft(data.duration);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, []);

  const handleRoundEnded = useCallback((data) => {
    console.log('[App] Rodada finalizada:', data);
    
    setRoundStarted(false);
    setRoundEnded(true);
    setStopClickedByMe(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const handleTimeUpRoundEnded = useCallback((data) => {
    console.log('[App] Tempo esgotado:', data);
    
    setRoundStarted(false);
    setRoundEnded(true);
    setStopClickedByMe(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setAlertState({
      isVisible: true,
      message: 'Tempo esgotado!',
      type: 'warning'
    });
  }, []);

  const handleNewRoundStarted = useCallback((data) => {
    console.log('[App] Nova rodada iniciada:', data);
    
    setRoundStarted(true);
    setRoundEnded(false);
    setLetter(data.letter || '');
    setStopClickedByMe(false);
    setResetRoundFlag(prev => prev + 1);
    
    // Reiniciar timer
    if (data.duration) {
      setTimeLeft(data.duration);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
  }, []);

  const handleRoomConfig = useCallback((config) => {
    console.log('[App] Configuração da sala recebida:', config);
    
    setRoomThemes(config.themes || []);
    setRoomDuration(config.duration || 180);
    setRoundStarted(config.roundActive || false);
    setRoundEnded(config.roundEnded || false);
    setLetter(config.currentLetter || '');
    setIsRoomSaved(config.isSaved || false);
    setExcludeXWYZ(config.excludeXWYZ || false); // ✅ NOVO: Filtro de letras
  }, []);

  // ✅ NOVO: Handler para atualização do filtro de letras
  const handleLetterFilterUpdated = useCallback((data) => {
    console.log('[App] Filtro de letras atualizado:', data);
    setExcludeXWYZ(data.excludeXWYZ);
  }, []);

  const handleRoomSavedSuccess = useCallback((data) => {
    console.log('[App] Sala salva com sucesso:', data);
    
    setIsRoomSaved(true);
    setAlertState({
      isVisible: true,
      message: 'Sala salva com sucesso!',
      type: 'success'
    });
  }, []);

  const handleGameEnded = useCallback((data) => {
    console.log('[App] Jogo finalizado:', data);
    
    setRoundStarted(false);
    setRoundEnded(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    setAlertState({
      isVisible: true,
      message: 'Jogo finalizado!',
      type: 'info'
    });
  }, []);

  const handleError = useCallback((error) => {
    console.error('[App] Erro geral:', error);
    
    setAlertState({
      isVisible: true,
      message: error.message || 'Erro desconhecido',
      type: 'error'
    });
  }, []);

  const handlePlayerReconnected = useCallback((data) => {
    console.log('[App] Jogador reconectado:', data);
    
    setAlertState({
      isVisible: true,
      message: `${data.nickname} reconectou-se`,
      type: 'info'
    });
  }, []);

  const handlePlayerDisconnected = useCallback((data) => {
    console.log('[App] Jogador desconectado:', data);
    
    setAlertState({
      isVisible: true,
      message: `${data.nickname} desconectou-se`,
      type: 'warning'
    });
  }, []);

  // ✅ MANTER: Funções já definidas
  const handleValidationStarted = useCallback((data) => {
    console.log('[App] Validação iniciada - salvando estado:', data);
    
    const validationData = {
      isValidating: true,
      currentValidation: data,
      roomName: roomName,
      userId: userId,
      isValidator: data.validatorId === userId
    };
    
    setValidationState(validationData);
    saveValidationState(validationData);
  }, [roomName, userId, saveValidationState]);

  const handleValidationComplete = useCallback(() => {
    console.log('[App] Validação completa - limpando estado');
    setValidationState(null);
    clearValidationState();
  }, [clearValidationState]);

  const handleLeaveRoom = useCallback(() => {
    console.log('[App] Saindo da sala e limpando sessão');
    
    // Limpar timers
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    // Limpar sessão e validação
    clearSession();
    clearValidationState();
    
    // Resetar todos os estados
    setCurrentPage('home');
    setRoomName('');
    setNickname('');
    setRoomError('');
    setPlayersInRoom([]);
    setIsAdmin(false);
    setRoomThemes([]);
    setRoundStarted(false);
    setRoundEnded(false);
    setLetter('');
    setCountdown(null);
    setStopClickedByMe(false);
    setIsRoomSaved(false);
    setIsReconnecting(false);
    setValidationState(null);
    setTimeLeft(0);
    
    // Emitir leave_room se estiver conectado
    if (socket.connected) {
      socket.emit('leave_room', {
        userId,
        room: roomName
      });
    }
  }, [userId, roomName, clearSession, clearValidationState]);

  // ✅ ADICIONAR: Função handleJoinOrCreateRoom (estava faltando)
  const handleJoinOrCreateRoom = useCallback((data) => {
    console.log('[App] Tentando entrar/criar sala:', data);
    
    const { action, roomId, nickname: inputNickname } = data;
    
    // Validações básicas
    if (!inputNickname?.trim()) {
      setRoomError('Nickname é obrigatório');
      return;
    }
    
    if (!roomId?.trim()) {
      setRoomError('Nome da sala é obrigatório');
      return;
    }
    
    // Gerar userId se não existir
    if (!userId) {
      const newUserId = uuidv4();
      setUserId(newUserId);
    }
    
    // Limpar erros anteriores
    setRoomError('');
    
    // Definir estados
    setNickname(inputNickname.trim());
    setRoomName(roomId.trim());
    
    // Emitir evento baseado na ação
    if (action === 'create') {
      console.log('[App] Criando nova sala:', roomId);
      socket.emit('create_room', {
        userId: userId || uuidv4(),
        nickname: inputNickname.trim(),
        room: roomId.trim()
      });
    } else if (action === 'join') {
      console.log('[App] Entrando na sala:', roomId);
      socket.emit('join_room', {
        userId: userId || uuidv4(),
        nickname: inputNickname.trim(),
        room: roomId.trim(),
        isReconnecting: false
      });
    }
  }, [userId]);

  // ✅ ADICIONAR: useEffect para gerar userId inicial
  useEffect(() => {
    if (!userId) {
      const newUserId = uuidv4();
      setUserId(newUserId);
      console.log('[App] Novo userId gerado:', newUserId);
    }
  }, [userId]);

  // ✅ NOVO: useEffect para aplicar tema globalmente
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  // ✅ NOVO: função para alternar tema globalmente
  const toggleTheme = useCallback(() => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light');
  }, []);

  // ✅ MANTER: handleReconnection (já existe, mas precisa estar antes do useEffect)
  const handleReconnection = useCallback((session) => {
    console.log('[App] Tentando reconexão automática:', session);
    
    socket.emit('join_room', {
      userId: session.userId,
      nickname: session.nickname,
      room: session.roomName,
      isReconnecting: true
    });
    
    // Timeout para reconexão
    setTimeout(() => {
      setIsReconnecting(false);
    }, 5000);
  }, []);

  // ✅ useEffect para reconexão (DEPOIS de handleReconnection)
  useEffect(() => {
    const session = loadSession();
    const validation = loadValidationState();
    
    if (session && session.roomName && session.userId && session.nickname) {
      console.log('[App] Detectada sessão anterior - tentando reconectar:', session);
      
      if (validation) {
        console.log('[App] Detectado estado de validação anterior:', validation);
        setValidationState(validation);
      }
      
      setIsReconnecting(true);
      
      // Restaurar estados básicos
      setUserId(session.userId);
      setNickname(session.nickname);
      setRoomName(session.roomName);
      setIsAdmin(session.isAdmin || false);
      
      // Tentar reconexão automática
      setTimeout(() => {
        handleReconnection(session);
      }, 1000);
    }
  }, [loadSession, loadValidationState, handleReconnection]);

  // ✅ ADICIONAR: useEffect para conexão inicial do socket
  useEffect(() => {
    const handleConnect = () => {
      console.log('[Socket] Conectado ao servidor');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('[Socket] Desconectado do servidor');
      setIsConnected(false);
    };

    const handleConnectError = (error) => {
      console.error('[Socket] Erro de conexão:', error);
      setIsConnected(false);
    };

    // Registrar listeners de conexão
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    // Verificar status inicial
    if (socket.connected) {
      setIsConnected(true);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, []);

  // ✅ Socket listeners (MANTÉM o useEffect existente)
  useEffect(() => {
    if (!userId) return;

    console.log(`[App] Setting up socket listeners for user ${userId}`);

    // Registrar listeners
    socket.on('room_joined', handleRoomJoined);
    socket.on('room_created', handleRoomCreated);
    socket.on('room_error', handleRoomError);
    socket.on('players_update', handlePlayersUpdate);
    socket.on('round_start_countdown', handleRoundStartCountdown);
    socket.on('round_started', handleRoundStarted);
    socket.on('round_ended', handleRoundEnded);
    socket.on('time_up_round_ended', handleTimeUpRoundEnded);
    socket.on('new_round_started', handleNewRoundStarted);
    socket.on('room_config', handleRoomConfig);
    socket.on('room_saved_success', handleRoomSavedSuccess);
    socket.on('game_ended', handleGameEnded);
    socket.on('error', handleError);
    socket.on('player_reconnected', handlePlayerReconnected);
    socket.on('player_disconnected', handlePlayerDisconnected);
    socket.on('start_validation', handleValidationStarted);
    socket.on('validation_complete', handleValidationComplete);
    socket.on('letter_filter_updated', handleLetterFilterUpdated); // ✅ NOVO

    return () => {
      console.log('[App] Cleaning up socket listeners');
      socket.off('room_joined', handleRoomJoined);
      socket.off('room_created', handleRoomCreated);
      socket.off('room_error', handleRoomError);
      socket.off('players_update', handlePlayersUpdate);
      socket.off('round_start_countdown', handleRoundStartCountdown);
      socket.off('round_started', handleRoundStarted);
      socket.off('round_ended', handleRoundEnded);
      socket.off('time_up_round_ended', handleTimeUpRoundEnded);
      socket.off('new_round_started', handleNewRoundStarted);
      socket.off('room_config', handleRoomConfig);
      socket.off('room_saved_success', handleRoomSavedSuccess);
      socket.off('game_ended', handleGameEnded);
      socket.off('error', handleError);
      socket.off('player_reconnected', handlePlayerReconnected);
      socket.off('player_disconnected', handlePlayerDisconnected);
      socket.off('start_validation', handleValidationStarted);
      socket.off('validation_complete', handleValidationComplete);
      socket.off('letter_filter_updated', handleLetterFilterUpdated); // ✅ NOVO
    };
  }, [
    userId,
    handleRoomJoined,
    handleRoomCreated,
    handleRoomError,
    handlePlayersUpdate,
    handleRoundStartCountdown,
    handleRoundStarted,
    handleRoundEnded,
    handleTimeUpRoundEnded,
    handleNewRoundStarted,
    handleRoomConfig,
    handleRoomSavedSuccess,
    handleGameEnded,
    handleError,
    handlePlayerReconnected,
    handlePlayerDisconnected,
    handleValidationStarted,
    handleValidationComplete,
    handleLetterFilterUpdated // ✅ NOVO
  ]);

  // ✅ Detectar mudanças de visibilidade para reconectar
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && sessionData && sessionData.roomName) {
        console.log('[App] Página voltou a ficar visível - verificando conexão');
        
        if (!socket.connected) {
          console.log('[App] Socket desconectado - tentando reconectar');
          socket.connect();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sessionData]);

  // ✅ Funções de controle
  const handleStartRound = useCallback(() => {
    socket.emit('start_round', { room: roomName });
  }, [roomName]);

  const handleStopRound = useCallback(() => {
    setStopClickedByMe(true);
    socket.emit('stop_round', { userId, room: roomName });
  }, [userId, roomName]);

  const handleSaveRoom = useCallback((roomName) => {
    socket.emit('save_room', { room: roomName });
    setIsRoomSaved(true);
  }, []);

  const onResetRound = useCallback(() => {
    setResetRoundFlag(prev => prev + 1);
  }, []);

  // ✅ ADICIONAR: Função para iniciar validação (não utilizada ainda)
  const _handleStartValidation = useCallback(() => {
    console.log('[App] Iniciando validação');
    socket.emit('start_validation', { room: roomName });
  }, [roomName]);

  return (
    <div className="App" data-testid="app-container">
      {isReconnecting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-xl text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-lg font-semibold text-gray-700">
              Reconectando na sala...
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Sala: {roomName}
            </p>
            {validationState && (
              <p className="text-sm text-orange-600 mt-1">
                🎯 Retomando validação...
              </p>
            )}
          </div>
        </div>
      )}
      
      {currentPage === 'home' && !isReconnecting && (
        <div data-testid="home-page">
          <_Home 
            onJoinOrCreateRoom={handleJoinOrCreateRoom}
            roomError={roomError}
            isConnected={isConnected}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        </div>
      )}
      
      {currentPage === 'room' && !isReconnecting && (
        <div data-testid="room-page">
          <_Room 
            userId={userId}
            nickname={nickname}
            room={roomName}
            playersInRoom={playersInRoom}
            isAdmin={isAdmin}
            roomThemes={roomThemes}
            setRoomThemes={setRoomThemes}
            roomDuration={roomDuration}
            setRoomDuration={setRoomDuration}
            letter={letter}
            roundStarted={roundStarted}
            roundEnded={roundEnded}
            resetRoundFlag={resetRoundFlag}
            stopClickedByMe={stopClickedByMe}
            countdown={countdown}
            handleStartRound={handleStartRound}
            handleStopRound={handleStopRound}
            handleLeaveRoom={handleLeaveRoom}
            onResetRound={onResetRound}
            isRoomSaved={isRoomSaved}
            handleSaveRoom={handleSaveRoom}
            alertState={alertState}
            setAlertState={setAlertState}
            validationState={validationState}
            timeLeft={timeLeft} // ✅ ADICIONAR: Passar timeLeft para Room
            theme={theme}
            toggleTheme={toggleTheme}
            excludeXWYZ={excludeXWYZ} // ✅ NOVO: Filtro de letras
            setExcludeXWYZ={setExcludeXWYZ} // ✅ NOVO: Setter do filtro
          />
        </div>
      )}
    </div>
  );
}

export default App;
