import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from "./socket";
import Home from './components/Home';
import Room from './components/Room';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

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

  const timerRef = useRef(null);
  const [timeLeft, setTimeLeft] = useState(0);

  // ✅ Inicializar userId
  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
    
    // ✅ Conectar socket com userId
    if (socket && !socket.connected) {
      socket.auth = { userId: storedUserId };
      socket.connect();
    }
  }, []);

  // ✅ Função para entrar/criar sala
  const handleJoinOrCreateRoom = useCallback((roomName, nickname, isCreating = false) => {
    if (!roomName?.trim() || !nickname?.trim()) {
      console.log('[App] Nome da sala e nickname são obrigatórios');
      setRoomError('Nome da sala e nickname são obrigatórios');
      return;
    }

    const trimmedRoomName = roomName.trim();
    const trimmedNickname = nickname.trim();
    
    console.log('[App] Tentando', isCreating ? 'criar' : 'entrar na', 'sala:', trimmedRoomName);
    
    // ✅ Atualizar estados locais
    setNickname(trimmedNickname);
    setRoomName(trimmedRoomName);
    setRoomError('');

    try {
      if (isCreating) {
        socket.emit("create_room", { 
          room: trimmedRoomName,
          nickname: trimmedNickname,
          userId: userId
        });
      } else {
        socket.emit("join_room", { 
          room: trimmedRoomName,
          nickname: trimmedNickname,
          userId: userId
        });
      }
    } catch (error) {
      console.error('[App] Erro ao emitir evento:', error);
      setRoomError('Erro ao conectar com o servidor');
    }
  }, [userId]);

  // ✅ Handlers para eventos de sala
  const handleRoomJoined = useCallback((data) => {
    console.log('[App] Room joined:', data);
    
    if (data.room && data.player && data.players) {
      setRoomName(data.room);
      setCurrentPage('room');
      setNickname(data.player.nickname);
      setIsAdmin(data.player.isCreator);
      setPlayersInRoom(data.players);
      setRoomError('');
      
      console.log('[App] Estado atualizado - Room:', data.room, 'Admin:', data.player.isCreator);
    }
  }, []);

  const handleRoomCreated = useCallback((data) => {
    console.log('[App] Room created:', data);
    
    if (data.room) {
      setRoomName(data.room);
      setCurrentPage('room');
      setIsAdmin(true);
      setRoomError('');
      
      if (data.themes) {
        setRoomThemes(data.themes);
      }
    }
  }, []);

  const handleRoomError = useCallback((data) => {
    console.log('[App] Room error:', data);
    setRoomError(data.message || 'Erro desconhecido');
    setAlertState({
      isVisible: true,
      message: data.message || 'Erro desconhecido',
      type: 'error'
    });
  }, []);

  // ✅ Outros handlers
  const handleError = useCallback((error) => {
    console.error('[App] Socket error:', error);
    setRoomError(error.message || 'Erro de conexão');
    setAlertState({
      isVisible: true,
      message: error.message || 'Erro de conexão',
      type: 'error'
    });
  }, []);

  const handleRoundStartCountdown = useCallback((data) => {
    console.log('[App] Countdown received:', data.countdown);
    setCountdown(data.countdown);
  }, []);

  const handleRoundStarted = useCallback((data) => {
    console.log('[App] Round started with letter:', data.letter);
    setRoundStarted(true);
    setRoundEnded(false);
    setLetter(data.letter);
    setCountdown(null);
    setStopClickedByMe(false);
  }, []);

  const handleRoundEnded = useCallback(() => {
    console.log('[App] Round ended');
    setRoundStarted(false);
    setRoundEnded(true);
    setStopClickedByMe(false);
  }, []);

  const handleTimeUpRoundEnded = useCallback(() => {
    console.log('[App] ⏰ Tempo esgotado - finalizando rodada');
    setRoundEnded(true);
    setRoundStarted(false);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimeLeft(0);
  }, []);

  const handleNewRoundStarted = useCallback(() => {
    console.log('[App] New round started');
    setRoundStarted(false);
    setRoundEnded(false);
    setLetter('');
    setCountdown(null);
    setStopClickedByMe(false);
  }, []);

  const handleRoomSavedSuccess = useCallback(() => {
    console.log('[App] Room saved successfully');
    setIsRoomSaved(true);
    setAlertState({
      isVisible: true,
      message: "Sala salva com sucesso!",
      type: "success"
    });
  }, []);

  const handlePlayersUpdate = useCallback((players) => {
    console.log('[App] Players update received:', players);
    setPlayersInRoom(players);
  }, []);

  const handleRoomConfig = useCallback((config) => {
    console.log('[App] Room config received:', config);
    
    if (config.themes && Array.isArray(config.themes)) {
      setRoomThemes(config.themes);
    }
    
    if (config.duration) {
      setRoomDuration(config.duration);
    }
    
    if (typeof config.roundActive === 'boolean') {
      setRoundStarted(config.roundActive);
    }
    
    if (typeof config.roundEnded === 'boolean') {
      setRoundEnded(config.roundEnded);
    }
    
    if (config.currentLetter) {
      setLetter(config.currentLetter);
    }
    
    if (typeof config.isSaved === 'boolean') {
      setIsRoomSaved(config.isSaved);
    }
  }, []);

  // ✅ ADICIONAR: Handler para fim de jogo
  const handleGameEnded = useCallback((data) => {
    console.log('[App] 🏁 Jogo finalizado:', data);
    
    // ✅ Não fazer nada aqui - deixar o GameBoard processar
    // O GameBoard já tem lógica para mostrar finalRanking
  }, []);

  // ✅ Socket listeners (adicionar na lista)
  useEffect(() => {
    if (!userId) return;

    const handleConnect = () => {
      console.log('Conectado ao servidor');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Desconectado do servidor');
      setIsConnected(false);
    };

    // Registrar listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
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
    socket.on('game_ended', handleGameEnded); // ✅ ADICIONAR
    socket.on('error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
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
      socket.off('game_ended', handleGameEnded); // ✅ ADICIONAR
      socket.off('error', handleError);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
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
    handleGameEnded, // ✅ ADICIONAR
    handleError
  ]);

  // ✅ Funções de controle
  const handleLeaveRoom = useCallback(() => {
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
    
    socket.emit('leave_room', {
      userId,
      room: roomName
    });
  }, [userId, roomName]);

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

  return (
    <div className="App" data-testid="app-container">
      {currentPage === 'home' && (
        <div data-testid="home-page">
          <Home 
            onJoinOrCreateRoom={handleJoinOrCreateRoom}
            roomError={roomError}
            isConnected={isConnected}
          />
        </div>
      )}
      
      {currentPage === 'room' && (
        <div data-testid="room-page">
          <Room 
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
          />
        </div>
      )}
    </div>
  );
}

export default App;
