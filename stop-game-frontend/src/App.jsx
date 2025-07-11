import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from './socket';
import Home from './components/Home';
import Room from './components/Room';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState('');
  const [userId, setUserId] = useState(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [isInRoom, setIsInRoom] = useState(false);
  const [roomError, setRoomError] = useState(null);
  const [playersInRoom, setPlayersInRoom] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  // Estados relacionados ao jogo
  const [roomThemes, setRoomThemes] = useState([]);
  const [roomDuration, setRoomDuration] = useState(60);
  const [letter, setLetter] = useState(null);
  const [roundStarted, setRoundStarted] = useState(false);
  const [roundEnded, setRoundEnded] = useState(false);
  const [resetRoundFlag, setResetRoundFlag] = useState(false);
  const [stopClickedByMe, setStopClickedByMe] = useState(false);

  // Estado e ref para o countdown de início de rodada
  const [countdown, setCountdown] = useState(null);
  const countdownIntervalRef = useRef(null);

  const clearLocalCountdown = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
  }, []);

  const startLocalCountdown = useCallback((initialValue, onCompleteCallback) => {
    clearLocalCountdown();
    setCountdown(initialValue);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
          return null;
        }
        if (prev === 1) {
          clearLocalCountdown();
          if (onCompleteCallback) onCompleteCallback();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [clearLocalCountdown]);

  useEffect(() => {
    let currentUserId = localStorage.getItem('userId');
    if (!currentUserId) {
      currentUserId = uuidv4();
      localStorage.setItem('userId', currentUserId);
    }
    setUserId(currentUserId);
  }, []);

  useEffect(() => {
    function onConnect() {
      console.log('Socket Connected! ID:', socket.id);
      setIsConnected(true);
    }

    function onDisconnect() {
      console.log('Socket Disconnected!');
      setIsConnected(false);
      setIsInRoom(false);
      setRoomError(null);
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoomDuration(60);
      setLetter(null);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      clearLocalCountdown();
    }

    function onConnectError(err) {
      console.error("Socket Connection Error:", err.message, err);
      setIsConnected(false);
      setRoomError("Não foi possível conectar ao servidor. Verifique sua internet ou tente novamente mais tarde.");
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    setIsConnected(socket.connected);
    console.log("Initial Socket State:", socket.connected ? "Connected" : "Disconnected");

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);


  useEffect(() => {
    function onRoomJoined(data) {
      setIsInRoom(true);
      setRoom(data.room);
      setPlayersInRoom(data.players);
      setIsAdmin(data.isCreator); // Backend envia 'isCreator'
      setRoomThemes(data.config.themes || []); // Temas estão em data.config
      setRoomDuration(data.config.duration || 60); // Duração está em data.config
      setRoomError(null);
      setResetRoundFlag(false);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setLetter(null);
      clearLocalCountdown();
      console.log("Joined room:", data.room, "Players:", data.players, "Is Admin:", data.isCreator, "Themes:", data.config.themes, "Duration:", data.config.duration);
    }

    function onRoomError(message) {
      setRoomError(message);
      setIsInRoom(false);
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setLetter(null);
      clearLocalCountdown();
    }

    function onPlayersUpdated(players) {
      setPlayersInRoom(players);
      const myPlayer = players.find(p => p.userId === userId); // Encontra pelo userId
      if (myPlayer) {
        setIsAdmin(myPlayer.isCreator); // Usa 'isCreator'
      }
      console.log("Players updated:", players);
    }

    function onRoomConfigUpdated(config) {
      if (config.themes) {
        setRoomThemes(config.themes);
        console.log("Room themes updated:", config.themes);
      }
      if (config.duration) {
        setRoomDuration(config.duration);
        console.log("Room duration updated:", config.duration);
      }
      if (config.currentLetter) { // Se a letra for enviada na config (ex: após reset)
        setLetter(config.currentLetter);
      }
    }

    function onRoundStarted(data) { // Renomeado de onGameStart para onRoundStarted
      setLetter(data.letter);
      setRoundStarted(true);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setResetRoundFlag(false);
      clearLocalCountdown();
      console.log("Round started! Letter:", data.letter);
    }

    // Listener para iniciar a contagem regressiva no frontend
    function onRoundStartCountdown(data) {
        console.log("Received round_start_countdown:", data.initialCountdown);
        setLetter(null); // Limpa a letra enquanto aguarda o countdown
        setRoundStarted(false);
        setRoundEnded(false);
        setStopClickedByMe(false);
        setResetRoundFlag(false);
        startLocalCountdown(data.initialCountdown, () => {
            console.log("Local countdown finished! Emitting start_game_actual.");
            // Após a contagem regressiva local, avisamos o backend para iniciar a rodada de fato
            socket.emit("start_game_actual", { room });
        });
    }

    function onRoundEnded() { // Consolidado: atende tanto a STOP quanto a tempo
      setRoundEnded(true);
      setRoundStarted(false);
      setLetter(null);
      setStopClickedByMe(false);
      clearLocalCountdown(); // Garante que qualquer countdown pendente seja limpo
      console.log("Round ended (by stop or time).");
    }

    function onRoomResetAck() { // Renomeado de onResetRoundData
      console.log("Event: room_reset_ack received. Preparing for new round.");
      setResetRoundFlag(true); // Isso fará com que o GameBoard resete.
      setRoundStarted(false);
      setRoundEnded(false);
      setLetter(null);
      setStopClickedByMe(false);
      clearLocalCountdown();
      // Não limpa temas e duração aqui, pois eles podem ter sido atualizados e já virão no room_config
    }

    socket.on('room_joined', onRoomJoined);
    socket.on('room_error', onRoomError);
    socket.on('players_update', onPlayersUpdated); // Backend emite 'players_update'
    socket.on('room_config', onRoomConfigUpdated);
    socket.on('round_started', onRoundStarted); // Nome do evento no backend
    socket.on('round_start_countdown', onRoundStartCountdown); // Novo listener
    socket.on('round_ended', onRoundEnded); // Nome do evento no backend
    socket.on('room_reset_ack', onRoomResetAck); // Nome do evento no backend

    return () => {
      socket.off('room_joined', onRoomJoined);
      socket.off('room_error', onRoomError);
      socket.off('players_update', onPlayersUpdated);
      socket.off('room_config', onRoomConfigUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_start_countdown', onRoundStartCountdown);
      socket.off('round_ended', onRoundEnded);
      socket.off('room_reset_ack', onRoomResetAck);
    };
  }, [userId, clearLocalCountdown, startLocalCountdown, room]); // Adicionado 'room' como dep. para o 'start_game_actual'

  // Handler para juntar ou criar uma sala (ADICIONADO)
  const handleJoinOrCreateRoom = (roomName, playerNickname) => {
    if (socket.connected) {
      setNickname(playerNickname);
      setRoom(roomName);
      setRoomError(null); // Limpa qualquer erro anterior
      console.log(`Attempting to join/create room: ${roomName} with nickname: ${playerNickname}`);
      socket.emit('join_room', { userId, room: roomName, nickname: playerNickname });
    } else {
      setRoomError("Conexão com o servidor não estabelecida. Tente novamente.");
      console.error("Socket not connected, cannot join room.");
    }
  };

  // Handler para atualizar temas e notificar o backend
  const handleChangeRoomThemes = useCallback((newThemes) => {
    if (isAdmin && room) {
      setRoomThemes(newThemes);
      socket.emit('update_config', { room, themes: newThemes });
      console.log("Emitting update_config (themes) for room:", room, newThemes);
    }
  }, [isAdmin, room]);

  // Handler para atualizar duração e notificar o backend
  const handleChangeRoomDuration = useCallback((newDuration) => {
    if (isAdmin && room) {
      setRoomDuration(newDuration);
      socket.emit('update_config', { room, duration: newDuration });
      console.log("Emitting update_config (duration) for room:", room, newDuration);
    }
  }, [isAdmin, room]);


  const handleStartRound = () => {
    if (isAdmin && !roundStarted && !roundEnded && !countdown) { // Adicionado !countdown
      socket.emit('start_round', { room }); // Inicia o countdown no backend
      console.log("Emitting start_round (to trigger countdown) for room:", room);
    }
  };

  const handleStopRound = () => {
    if (roundStarted && !roundEnded && !stopClickedByMe) {
      socket.emit('stop_round');
      setStopClickedByMe(true);
      console.log("STOP clicked!");
    }
  };

  const handleLeaveRoom = () => {
    if (isInRoom) {
      // O backend já lida com a desconexão do socket.
      // Apenas limpa o estado local para voltar para a tela inicial
      setIsInRoom(false);
      setRoom('');
      setNickname('');
      setPlayersInRoom([]);
      setIsAdmin(false);
      setRoomThemes([]);
      setRoomDuration(60);
      setLetter(null);
      setRoundStarted(false);
      setRoundEnded(false);
      setStopClickedByMe(false);
      setRoomError(null);
      setResetRoundFlag(false);
      clearLocalCountdown();
      console.log("Left room (frontend state cleared).");
    }
  };

  const onResetRound = () => {
    console.log("onResetRound called from GameBoard. Setting resetRoundFlag to false.");
    setResetRoundFlag(false);
  };

  if (!isInRoom) {
    return (
      <Home
        onJoinOrCreateRoom={handleJoinOrCreateRoom} // Agora handleJoinOrCreateRoom está definida
        roomError={roomError}
        isConnected={isConnected}
      />
    );
  } else {
    return (
      <Room
        nickname={nickname}
        room={room}
        userId={userId}
        playersInRoom={playersInRoom}
        isAdmin={isAdmin}
        roomThemes={roomThemes}
        setRoomThemes={handleChangeRoomThemes}
        roomDuration={roomDuration}
        setRoomDuration={handleChangeRoomDuration}
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
      />
    );
  }
}

export default App;