import React, { useState, useEffect } from 'react';
import { socket } from './socket';
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

  useEffect(() => {
    let storedUserId = localStorage.getItem('userId');
    if (!storedUserId) {
      storedUserId = uuidv4();
      localStorage.setItem('userId', storedUserId);
    }
    setUserId(storedUserId);
  }, []);

  // CORREÇÃO: Definir handlers que estavam sendo referenciados
  const handleRoundStartCountdown = (data) => {
    console.log('[App] Countdown received:', data.countdown);
    setCountdown(data.countdown);
  };

  const handleRoundStarted = (data) => {
    console.log('[App] Round started with letter:', data.letter);
    setRoundStarted(true);
    setRoundEnded(false);
    setLetter(data.letter);
    setCountdown(null);
    setStopClickedByMe(false);
  };

  const handleRoundEnded = () => {
    console.log('[App] Round ended');
    setRoundStarted(false);
    setRoundEnded(true);
    setStopClickedByMe(false);
  };

  const handleTimeUpRoundEnded = () => {
    console.log('[App] ⏰ Tempo esgotado - finalizando rodada');
    setRoundEnded(true);
    setRoundStarted(false); // CORREÇÃO: Marcar como não iniciada
    
    // CORREÇÃO: Reset do timer se ainda estiver ativo
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setTimeLeft(0);
  };

  const handleNewRoundStarted = () => {
    console.log('[App] New round started');
    setRoundStarted(false);
    setRoundEnded(false);
    setLetter('');
    setCountdown(null);
    setStopClickedByMe(false);
  };

  const handleRoomSavedSuccess = () => {
    console.log('[App] Room saved successfully');
    setIsRoomSaved(true);
    setAlertState({
      isVisible: true,
      message: "Sala salva com sucesso!",
      type: "success"
    });
  };

  useEffect(() => {
    const handleConnect = () => {
      console.log('Conectado ao servidor');
      setIsConnected(true);
    };

    const handleDisconnect = () => {
      console.log('Desconectado do servidor');
      setIsConnected(false);
    };

    const handlePlayersUpdate = (players) => {
      console.log('[App] Players update received:', players);
      setPlayersInRoom(players);
    };

    const handleRoomJoined = (data) => {
      console.log('[App] Room joined:', data);
      
      if (data.room && data.player && data.players) {
        setRoomName(data.room); // CORREÇÃO: usar setRoomName em vez de setCurrentRoom
        setCurrentPage('room'); // CORREÇÃO: usar setCurrentPage em vez de setCurrentView
        setNickname(data.player.nickname);
        setIsAdmin(data.player.isCreator);
        setPlayersInRoom(data.players);
        
        console.log('[App] Estado atualizado - Room:', data.room, 'Admin:', data.player.isCreator, 'Players:', data.players.length);
      }
    };

    const handleRoomConfig = (config) => {
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
    };

    // Socket listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('room_joined', handleRoomJoined);
    socket.on('players_update', handlePlayersUpdate);
    socket.on('round_start_countdown', handleRoundStartCountdown);
    socket.on('round_started', handleRoundStarted);
    socket.on('round_ended', handleRoundEnded);
    socket.on('time_up_round_ended', handleTimeUpRoundEnded); // CORREÇÃO: Usar handler específico
    socket.on('new_round_started', handleNewRoundStarted);
    socket.on('room_config', handleRoomConfig);
    socket.on('error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room_joined', handleRoomJoined);
      socket.off('players_update', handlePlayersUpdate);
      socket.off('round_start_countdown', handleRoundStartCountdown);
      socket.off('round_started', handleRoundStarted);
      socket.off('round_ended', handleRoundEnded);
      socket.off('time_up_round_ended', handleTimeUpRoundEnded);
      socket.off('new_round_started', handleNewRoundStarted);
      socket.off('room_config', handleRoomConfig);
      socket.off('error', handleError);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [currentUser]);

  const handleJoinOrCreateRoom = (roomName, nickname) => {
    console.log(`Tentando entrar/criar sala: ${roomName} com nickname: ${nickname}`);
    setNickname(nickname);
    setRoomError('');
    
    socket.emit('join_room', {
      userId,
      nickname,
      room: roomName
    });
  };

  const handleLeaveRoom = () => {
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
  };

  const handleStartRound = () => {
    socket.emit('start_round', { room: roomName });
  };

  const handleStopRound = () => {
    setStopClickedByMe(true);
    socket.emit('stop_round', { userId, room: roomName });
  };

  const handleSaveRoom = (roomName) => {
    socket.emit('save_room', { room: roomName });
    setIsRoomSaved(true);
  };

  const onResetRound = () => {
    setResetRoundFlag(prev => prev + 1);
  };

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
