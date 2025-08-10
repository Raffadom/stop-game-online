import React, { useState, useEffect, useRef, useCallback } from 'react';
import { socket } from './socket';
import Home from './components/Home';
import Room from './components/Room';
import { v4 as uuidv4 } from 'uuid';

function App() {
  const [userId] = useState(() => {
    let currentId = localStorage.getItem('userId');
    if (!currentId) {
      currentId = uuidv4();
      localStorage.setItem('userId', currentId);
    }
    return currentId;
  });

  const [nickname, setNickname] = useState('');
  const [room, setRoom] = useState('');
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

  // Estados para gerenciamento de sala salva e alertas
  const [isRoomSaved, setIsRoomSaved] = useState(false);
  const [alert, setAlert] = useState({ isVisible: false, message: '', type: '' });

  // Estado e ref para o countdown de início de rodada
  const [countdown, setCountdown] = useState(null);
  const countdownIntervalRef = useRef(null);

  // Ref para controlar se um salvamento acabou de ocorrer
  const justSavedRef = useRef(false);

  // --- Funções de Callback ---

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

  const handleJoinOrCreateRoom = useCallback((roomName, playerNickname) => {
    if (!roomName.trim() || !playerNickname.trim()) {
      setRoomError("Por favor, preencha o apelido e o código da sala.");
      return;
    }
    if (socket.connected) {
      setNickname(playerNickname);
      setRoom(roomName);
      setRoomError(null);
      socket.emit('join_room', { userId, room: roomName, nickname: playerNickname });
      console.log("Emitindo join_room:", { userId, room: roomName, nickname: playerNickname });
    } else {
      setRoomError("Conexão com o servidor não estabelecida. Tente novamente.");
    }
  }, [userId]);

  const handleChangeRoomThemes = useCallback((newThemes) => {
    if (isAdmin && room) {
      const validThemes = newThemes.filter(theme => theme && theme.trim() !== "");
      if (validThemes.length === 0 && newThemes.length > 0) {
        setRoomError("Os temas não podem ser vazios.");
        setAlert({ isVisible: true, message: "Os temas não podem ser vazios.", type: 'error' });
        return;
      }
      setRoomThemes(validThemes);
      setIsRoomSaved(false);
      socket.emit('update_config', { room, themes: validThemes });
      console.log("Emitindo update_config (themes):", { room, themes: validThemes });
    }
  }, [isAdmin, room]);

  const handleChangeRoomDuration = useCallback((newDuration) => {
    if (isAdmin && room) {
      const duration = Number(newDuration);
      if (isNaN(duration) || duration < 10 || duration > 300) {
        setRoomError("A duração deve ser entre 10 e 300 segundos.");
        setAlert({ isVisible: true, message: "A duração deve ser entre 10 e 300 segundos.", type: 'error' });
        return;
      }
      setRoomDuration(duration);
      setIsRoomSaved(false);
      socket.emit('update_config', { room, duration });
      console.log("Emitindo update_config (duration):", { room, duration });
    }
  }, [isAdmin, room]);

  const handleSaveRoom = useCallback((currentRoomId) => {
    if (isAdmin && currentRoomId && !roundStarted && !roundEnded) {
      console.log(`Emitindo save_room para sala: ${currentRoomId}`);
      setAlert({ isVisible: true, message: `A sala ${currentRoomId} foi salva!`, type: 'success' });
      setIsRoomSaved(true);
      justSavedRef.current = true;
      socket.emit('save_room', { room: currentRoomId, roomName: currentRoomId });
      setTimeout(() => {
        justSavedRef.current = false;
        console.log("justSavedRef resetado após save_room.");
      }, 1000);
    } else if (!isAdmin) {
      setAlert({ isVisible: true, message: "Somente o administrador pode salvar a sala.", type: 'error' });
    }
  }, [isAdmin, roundStarted, roundEnded]);

  const handleStartRound = useCallback(() => {
    if (isAdmin && !roundStarted && !roundEnded && countdown === null && roomThemes.length > 0) {
      socket.emit('start_round', { room });
      console.log("Emitindo start_round para sala:", room);
    } else {
      let errorMessage = "";
      if (!isAdmin) errorMessage = "Somente o administrador pode iniciar a rodada.";
      else if (roundStarted || roundEnded) errorMessage = "A rodada já está em andamento ou finalizada.";
      else if (countdown !== null) errorMessage = "A contagem regressiva já está ativa.";
      else if (roomThemes.length === 0) errorMessage = "Adicione pelo menos um tema antes de iniciar.";
      setRoomError(errorMessage);
      setAlert({ isVisible: true, message: errorMessage, type: 'error' });
      console.log("handleStartRound bloqueado:", { isAdmin, roundStarted, roundEnded, countdown, themes: roomThemes });
    }
  }, [isAdmin, roundStarted, roundEnded, countdown, room, roomThemes]);

  const handleStopRound = useCallback(() => {
    if (roundStarted && !roundEnded && !stopClickedByMe) {
      socket.emit('stop_round');
      setStopClickedByMe(true);
      console.log("Emitindo stop_round para sala:", room);
    }
  }, [roundStarted, roundEnded, stopClickedByMe, room]);

  const handleLeaveRoom = useCallback(() => {
    if (isInRoom) {
      socket.emit('leave_room');
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
      setIsRoomSaved(false);
      clearLocalCountdown();
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      localStorage.removeItem('userId');
      setAlert({ isVisible: true, message: "Você saiu da sala.", type: 'info' });
      console.log("Saiu da sala, estado limpo.");
    }
  }, [isInRoom, clearLocalCountdown]);

  const onResetRound = useCallback(() => {
    console.log("onResetRound chamado do GameBoard.");
    setResetRoundFlag(false);
  }, []);

  // --- Funções de Listener ---

  const onRejoinRoomSuccess = useCallback((data) => {
    console.log('Reingresso bem-sucedido:', data);
    setIsInRoom(true);
    setRoom(data.room?.roomId || '');
    setNickname(data.player?.nickname || '');
    setPlayersInRoom(data.room?.players || []);
    setIsAdmin(data.player?.isCreator || false);
    setRoomThemes(data.room?.config?.themes || []);
    setRoomDuration(data.room?.config?.duration || 60);
    setLetter(data.room?.currentLetter || null);
    setRoundStarted(data.room?.roundStarted || false);
    setRoundEnded(data.room?.roundEnded || false);
    setStopClickedByMe(data.room?.stopClickedByMe === userId);
    setIsRoomSaved(data.room?.isSaved || false);
    setRoomError(null);
    clearLocalCountdown();
    setAlert({ isVisible: true, message: `Reconectado à sala ${data.room?.roomId || ''}!`, type: 'success' });
  }, [clearLocalCountdown, userId]);

  const onRejoinRoomFail = useCallback(() => {
    console.log('Reingresso falhou. Limpando estado.');
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
    setIsRoomSaved(false);
    setRoomError("Não foi possível reentrar na sala. A sala pode não existir mais.");
    clearLocalCountdown();
    localStorage.removeItem('roomId');
    localStorage.removeItem('nickname');
    localStorage.removeItem('userId');
    setAlert({ isVisible: true, message: "Não foi possível reentrar na sala.", type: 'error' });
  }, [clearLocalCountdown]);

  const onRoomSavedSuccess = useCallback((data) => {
    console.log("room_saved_success recebido:", data);
    setIsRoomSaved(true);
    setAlert({ isVisible: true, message: `A sala ${data.room} foi salva!`, type: 'success' });
  }, []);

  const onRoomConfigUpdated = useCallback((config) => {
    console.log("room_config recebido:", config);
    if (!config || typeof config !== 'object') {
      console.warn("room_config inválido:", config);
      return;
    }
    if (config.themes && JSON.stringify(config.themes) !== JSON.stringify(roomThemes)) {
      setRoomThemes(config.themes);
      if (isRoomSaved) {
        setIsRoomSaved(false);
        console.log("Temas alterados, isRoomSaved setado para FALSE.");
      }
    }
    if (config.duration !== undefined && config.duration !== roomDuration) {
      setRoomDuration(config.duration);
      if (isRoomSaved) {
        setIsRoomSaved(false);
        console.log("Duração alterada, isRoomSaved setado para FALSE.");
      }
    }
    if (config.isSaved !== undefined && config.isSaved !== isRoomSaved) {
      setIsRoomSaved(config.isSaved);
      console.log("isRoomSaved atualizado via room_config:", config.isSaved);
    }
    if (config.currentLetter !== undefined) setLetter(config.currentLetter);
    if (config.roundActive !== undefined) setRoundStarted(config.roundActive);
    if (config.roundEnded !== undefined) setRoundEnded(config.roundEnded);
    if (config.stopClickedByMe !== undefined) {
      setStopClickedByMe(config.stopClickedByMe === userId);
      console.log("stopClickedByMe atualizado via room_config:", config.stopClickedByMe === userId);
    }
  }, [roomThemes, roomDuration, isRoomSaved, userId]);

  const onChangesSavedSuccess = useCallback(() => {
    console.log("changes_saved_success recebido.");
    setAlert({ isVisible: true, message: 'Alterações salvas automaticamente!', type: 'success' });
    setIsRoomSaved(true);
  }, []);

  const onRoomJoined = useCallback((data) => {
    console.log("room_joined recebido:", data);
    setIsInRoom(true);
    setRoom(data.room || '');
    setNickname(data.player?.nickname || '');
    setPlayersInRoom(data.players || []);
    setIsAdmin(data.player?.isCreator || false);
    setRoomThemes(data.config?.themes || []);
    setRoomDuration(data.config?.duration || 60);
    setRoomError(null);
    setResetRoundFlag(false);
    setRoundStarted(data.roundStarted || false);
    setRoundEnded(data.roundEnded || false);
    setStopClickedByMe(data.stopClickedByMe === userId);
    setLetter(data.letter || null);
    setIsRoomSaved(data.isSaved || false);
    clearLocalCountdown();
    localStorage.setItem('roomId', data.room || '');
    localStorage.setItem('nickname', data.player?.nickname || '');
    setAlert({ isVisible: true, message: `Entrou na sala ${data.room}!`, type: 'success' });
  }, [clearLocalCountdown, userId]);

  const onRoomError = useCallback((errorData) => {
    console.error("room_error recebido:", errorData);
    if (justSavedRef.current) {
      console.log("Ignorando room_error após save_room.");
      setRoomError(null);
      return;
    }
    setRoomError(errorData.message);
    setAlert({ isVisible: true, message: errorData.message, type: 'error' });
    if (!isRoomSaved) {
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
      setIsRoomSaved(false);
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      localStorage.removeItem('userId');
    }
  }, [isRoomSaved]);

  const onPlayersUpdated = useCallback((players) => {
    setPlayersInRoom(players || []);
    const myPlayer = (players || []).find(p => p.userId === userId);
    if (myPlayer) {
      setIsAdmin(myPlayer.isCreator || false);
      console.log(`onPlayersUpdated: userId ${userId} isCreator: ${myPlayer.isCreator}`);
    }
  }, [userId]);

  const onRoundStarted = useCallback((data) => {
    console.log('onRoundStarted recebido:', data);
    setLetter(data.letter || null);
    setRoundStarted(true);
    setRoundEnded(false);
    setStopClickedByMe(false);
    setResetRoundFlag(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  const onRoundStartCountdown = useCallback((data) => {
    console.log('onRoundStartCountdown recebido:', data);
    setLetter(null);
    setRoundStarted(false);
    setRoundEnded(false);
    setStopClickedByMe(false);
    setResetRoundFlag(false);
    startLocalCountdown(data.initialCountdown || 0, () => {
      socket.emit("start_game_actual", { room });
    });
  }, [startLocalCountdown, room]);

  const onRoundEnded = useCallback(() => {
    console.log('onRoundEnded recebido.');
    setRoundEnded(true);
    setRoundStarted(false);
    setLetter(null);
    setStopClickedByMe(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  const onRoomResetAck = useCallback(() => {
    console.log('onRoomResetAck recebido.');
    setResetRoundFlag(true);
    setRoundStarted(false);
    setRoundEnded(false);
    setLetter(null);
    setStopClickedByMe(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  // --- Efeito Único para Listeners do Socket.IO ---
  useEffect(() => {
    function onConnect() {
      console.log('Socket Conectado! ID:', socket.id);
      setIsConnected(true);
      const savedRoomId = localStorage.getItem('roomId');
      const savedNickname = localStorage.getItem('nickname');
      const savedUserId = localStorage.getItem('userId');
      if (savedRoomId && savedNickname && savedUserId && !isInRoom) {
        console.log(`Tentando reingressar na sala ${savedRoomId} com userId ${savedUserId}...`);
        socket.emit('rejoin_room', {
          roomId: savedRoomId,
          nickname: savedNickname,
          userId: savedUserId,
        });
      }
    }

    function onDisconnect() {
      console.log('Socket Desconectado!');
      setIsConnected(false);
      setAlert({ isVisible: true, message: "Desconectado do servidor. Tentando reconectar...", type: 'error' });
    }

    function onConnectError(err) {
      console.error("Erro de Conexão do Socket:", err.message);
      setIsConnected(false);
      setRoomError("Não foi possível conectar ao servidor. Verifique sua internet.");
      setAlert({ isVisible: true, message: "Erro de conexão! Verifique sua internet.", type: 'error' });
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('rejoin_room_success', onRejoinRoomSuccess);
    socket.on('rejoin_room_fail', onRejoinRoomFail);
    socket.on('room_config', onRoomConfigUpdated);
    socket.on('changes_saved_success', onChangesSavedSuccess);
    socket.on('room_joined', onRoomJoined);
    socket.on('room_error', onRoomError);
    socket.on('players_update', onPlayersUpdated);
    socket.on('round_started', onRoundStarted);
    socket.on('round_start_countdown', onRoundStartCountdown);
    socket.on('round_ended', onRoundEnded);
    socket.on('room_reset_ack', onRoomResetAck);
    socket.on('room_saved_success', onRoomSavedSuccess);

    setIsConnected(socket.connected);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('rejoin_room_success', onRejoinRoomSuccess);
      socket.off('rejoin_room_fail', onRejoinRoomFail);
      socket.off('room_config', onRoomConfigUpdated);
      socket.off('changes_saved_success', onChangesSavedSuccess);
      socket.off('room_joined', onRoomJoined);
      socket.off('room_error', onRoomError);
      socket.off('players_update', onPlayersUpdated);
      socket.off('round_started', onRoundStarted);
      socket.off('round_start_countdown', onRoundStartCountdown);
      socket.off('round_ended', onRoundEnded);
      socket.off('room_reset_ack', onRoomResetAck);
      socket.off('room_saved_success', onRoomSavedSuccess);
    };
  }, [
    userId, isInRoom,
    onRejoinRoomSuccess, onRejoinRoomFail, onRoomSavedSuccess, onRoomConfigUpdated, onChangesSavedSuccess,
    onRoomJoined, onRoomError, onPlayersUpdated, onRoundStarted, onRoundStartCountdown, onRoundEnded, onRoomResetAck
  ]);

  useEffect(() => {
    console.log("App.jsx Render Update:", {
      isRoomSaved,
      isAdmin,
      roundStarted,
      roundEnded,
      currentLetter: letter,
      alert
    });
  }, [isRoomSaved, isAdmin, roundStarted, roundEnded, letter, alert]);

  if (!isInRoom) {
    return (
      <Home
        onJoinOrCreateRoom={handleJoinOrCreateRoom}
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
        isRoomSaved={isRoomSaved}
        handleSaveRoom={handleSaveRoom}
        alertState={alert}
        setAlertState={setAlert}
      />
    );
  }
}

export default App;