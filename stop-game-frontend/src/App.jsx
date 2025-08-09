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

  // Ref para controlar se um salvamento acabou de ocorrer (usado para ignorar o room_error do backend)
  const justSavedRef = useRef(false);

  // --- Funções de Callback (memoizadas com useCallback) ---

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
    if (socket.connected) {
      setNickname(playerNickname);
      setRoom(roomName);
      setRoomError(null);
      socket.emit('join_room', { userId, room: roomName, nickname: playerNickname });
    } else {
      setRoomError("Conexão com o servidor não estabelecida. Tente novamente.");
    }
  }, [userId]);

  const handleChangeRoomThemes = useCallback((newThemes) => {
    if (isAdmin && room) {
      setRoomThemes(newThemes);
      setIsRoomSaved(false); // Reseta o estado de salvo ao alterar os temas
      socket.emit('update_config', { room, themes: newThemes });
      console.log("Emitindo update_config (themes) para sala:", room, newThemes);
    }
  }, [isAdmin, room]);

  const handleChangeRoomDuration = useCallback((newDuration) => {
    if (isAdmin && room) {
      setRoomDuration(newDuration);
      setIsRoomSaved(false); // Reseta o estado de salvo ao alterar a duração
      socket.emit('update_config', { room, duration: newDuration });
      console.log("Emitindo update_config (duration) para sala:", room, newDuration);
    }
  }, [isAdmin, room]);
  
  const handleSaveRoom = useCallback((currentRoomId) => {
    if (isAdmin && currentRoomId && !roundStarted && !roundEnded) {
      console.log(`Frontend: Emitindo 'save_room' para a sala: ${currentRoomId}`);
      
      // ABORDAGEM OTIMISTA: Assume sucesso imediatamente na UI
      setAlert({ isVisible: true, message: `A sala ${currentRoomId} foi salva!`, type: 'success' }); 
      setIsRoomSaved(true); 
      console.log("handleSaveRoom: isRoomSaved set to TRUE (optimistic update)."); 
      
      justSavedRef.current = true; 
      socket.emit('save_room', { room: currentRoomId, roomName: currentRoomId });

      setTimeout(() => {
          justSavedRef.current = false;
          console.log("handleSaveRoom: justSavedRef reset to FALSE after timeout.");
      }, 1000); 
      
    } else if (!isAdmin) {
      setAlert({ isVisible: true, message: "Somente o administrador pode salvar a sala.", type: 'error' });
    }
  }, [isAdmin, room, roundStarted, roundEnded, setAlert]);

  const handleStartRound = useCallback(() => {
    if (isAdmin && !roundStarted && !roundEnded && countdown === null) {
      socket.emit('start_round', { room });
      console.log("Emitindo start_round (para iniciar contagem regressiva) para sala:", room);
    } else {
      console.log("handleStartRound: Não pode iniciar rodada. Admin:", isAdmin, "RoundStarted:", roundStarted, "RoundEnded:", roundEnded, "Countdown:", countdown);
    }
  }, [isAdmin, roundStarted, roundEnded, countdown, room]);

  const handleStopRound = useCallback(() => {
    if (roundStarted && !roundEnded && !stopClickedByMe) {
      socket.emit('stop_round');
      setStopClickedByMe(true);
      console.log("STOP clicado!");
    }
  }, [roundStarted, roundEnded, stopClickedByMe]);

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
      clearLocalCountdown();
      setIsRoomSaved(false);
      localStorage.removeItem('roomId');
      localStorage.removeItem('nickname');
      localStorage.removeItem('userId'); // Certifica-se de limpar o userId para um novo início
      console.log("Saiu da sala (estado do frontend limpo e localStorage removido).");
    }
  }, [isInRoom, clearLocalCountdown]);

  const onResetRound = useCallback(() => {
    console.log("onResetRound chamado do GameBoard. Definindo resetRoundFlag para false.");
    setResetRoundFlag(false);
  }, []);

  // --- Funções de Listener (memoizadas com useCallback para estabilidade) ---

  const onRejoinRoomSuccess = useCallback((data) => {
    console.log('Frontend: Reingresso bem-sucedido! Dados recebidos:', data);
    console.log('Frontend: onRejoinRoomSuccess - room.config:', data.room?.config);
    console.log('Frontend: onRejoinRoomSuccess - player.isCreator:', data.player?.isCreator);
    console.log('Frontend: onRejoinRoomSuccess - room.isSaved:', data.room?.isSaved);
    console.log('Frontend: onRejoinRoomSuccess - room.roundStarted:', data.room?.roundStarted);
    console.log('Frontend: onRejoinRoomSuccess - room.roundEnded:', data.room?.roundEnded);
    console.log('Frontend: onRejoinRoomSuccess - room.currentLetter:', data.room?.currentLetter);

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
    setStopClickedByMe(data.room?.stopClickedByMe || null);
    setIsRoomSaved(data.room?.isSaved || false); 
    console.log("onRejoinRoomSuccess: isRoomSaved set to", data.room?.isSaved || false); 
    setRoomError(null);
    setResetRoundFlag(false);
    clearLocalCountdown();
    setAlert({ isVisible: true, message: `Reconectado à sala ${data.room?.roomId || ''}!`, type: 'success' });
  }, [clearLocalCountdown]);

  const onRejoinRoomFail = useCallback(() => {
    console.log('Frontend: Reingresso falhou. Limpando local storage e resetando estado.');
    localStorage.removeItem('roomId');
    localStorage.removeItem('nickname');
    localStorage.removeItem('userId'); // Garante que o userId seja limpo para evitar tentativas de reingresso inválidas
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
    setRoomError("Não foi possível reentrar na sala. A sala pode não existir mais ou seus dados estão inválidos.");
    setResetRoundFlag(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  const onRoomSavedSuccess = useCallback((data) => {
    console.warn("Frontend: 'room_saved_success' recebido. Este evento pode estar ausente do backend ou interferir com 'room_error'.");
  }, []);

  const onRoomConfigUpdated = useCallback((config) => {
    console.log("Frontend: 'room_config' recebido. Dados:", config);
    if (!config || typeof config !== 'object') {
        console.warn("Frontend: 'room_config' recebido com dados inválidos:", config);
        return; 
    }
    
    if (config.themes && JSON.stringify(config.themes) !== JSON.stringify(roomThemes)) {
      setRoomThemes(config.themes);
      if (isRoomSaved) { 
          setIsRoomSaved(false); 
          console.log("onRoomConfigUpdated: Temas alterados, isRoomSaved set to FALSE."); 
      }
      console.log("Temas da sala atualizados (via room_config):", config.themes);
    }
    if (config.duration !== undefined && config.duration !== roomDuration) {
      setRoomDuration(config.duration);
      if (isRoomSaved) { 
          setIsRoomSaved(false); 
          console.log("onRoomConfigUpdated: Duração alterada, isRoomSaved set to FALSE."); 
      }
      console.log("Duração da sala atualizada (via room_config):", config.duration);
    }
    if (config.isSaved !== undefined && config.isSaved !== isRoomSaved) {
      setIsRoomSaved(config.isSaved);
      console.log("Status isRoomSaved atualizado (via room_config):", config.isSaved); 
    }
    if (config.currentLetter !== undefined) {
      setLetter(config.currentLetter);
    }
    if (config.roundActive !== undefined) {
      setRoundStarted(config.roundActive);
    }
    if (config.roundEnded !== undefined) {
      setRoundEnded(config.roundEnded);
    }
    if (config.stopClickedByMe !== undefined) {
      setStopClickedByMe(config.stopClickedByMe);
    }
  }, [roomThemes, roomDuration, isRoomSaved]); 

  const onChangesSavedSuccess = useCallback(() => {
    console.log("Frontend: 'changes_saved_success' recebido.");
    setAlert({ isVisible: true, message: 'Alterações salvas automaticamente!', type: 'success' }); 
    setIsRoomSaved(true); 
    console.log("onChangesSavedSuccess: isRoomSaved set to TRUE."); 
  }, []); 

  const onRoomJoined = useCallback((data) => {
    console.log("Frontend: 'room_joined' recebido. Dados:", data);
    console.log('Frontend: onRoomJoined - config:', data.config);
    console.log('Frontend: onRoomJoined - player.isCreator:', data.player?.isCreator);
    console.log('Frontend: onRoomJoined - isCreator (top-level):', data.isCreator); // Propriedade de nível superior
    console.log('Frontend: onRoomJoined - isSaved (top-level):', data.isSaved); // Propriedade de nível superior
    console.log('Frontend: onRoomJoined - roundStarted:', data.roundStarted);
    console.log('Frontend: onRoomJoined - roundEnded:', data.roundEnded);
    console.log('Frontend: onRoomJoined - currentLetter:', data.letter);

    setIsInRoom(true);
    setRoom(data.room || ''); 
    setNickname(data.player?.nickname || ''); 
    setPlayersInRoom(data.players || []); 
    setIsAdmin(data.player?.isCreator || false); // Use data.player.isCreator para a fonte definitiva
    setRoomThemes(data.config?.themes || []); 
    setRoomDuration(data.config?.duration || 60); 
    setRoomError(null);
    setResetRoundFlag(false);
    setRoundStarted(data.roundStarted || false); // Garante que roundStarted é setado
    setRoundEnded(data.roundEnded || false);     // Garante que roundEnded é setado
    setStopClickedByMe(data.stopClickedByMe || false); // Garante que stopClickedByMe é setado
    setLetter(data.letter || null); // Garante que letter é setado
    clearLocalCountdown();
    setIsRoomSaved(data.isSaved || false); // Use data.isSaved para a fonte definitiva
    console.log("onRoomJoined: isRoomSaved set to", data.isSaved || false); 
    
    localStorage.setItem('roomId', data.room || '');
    localStorage.setItem('nickname', data.player?.nickname || '');
  }, [clearLocalCountdown]);

  const onRoomError = useCallback((errorData) => {
    console.error("Frontend: 'room_error' recebido. Dados:", errorData);
    setRoomError(errorData.message);
    
    if (justSavedRef.current) {
        console.log("Frontend: 'room_error' recebido APÓS tentativa de salvamento. Ignorando na UI.");
        setRoomError(null); 
    } else {
        setAlert({ isVisible: true, message: errorData.message, type: 'error' });
        // Lógica para sair da sala
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
    }
  }, [clearLocalCountdown, isRoomSaved, justSavedRef, room]); 

  const onPlayersUpdated = useCallback((players) => {
    setPlayersInRoom(players || []); 
    const myPlayer = (players || []).find(p => p.userId === userId); 
    if (myPlayer) {
      setIsAdmin(myPlayer.isCreator || false); 
      console.log(`Frontend: onPlayersUpdated - userId ${userId} isCreator: ${myPlayer.isCreator}`);
    }
  }, [userId]);

  const onRoundStarted = useCallback((data) => {
    console.log('Frontend: onRoundStarted recebido. Dados:', data);
    setLetter(data.letter || null); 
    setRoundStarted(true);
    setRoundEnded(false);
    setStopClickedByMe(false);
    setResetRoundFlag(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  const onRoundStartCountdown = useCallback((data) => {
    console.log('Frontend: onRoundStartCountdown recebido. Dados:', data);
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
    console.log('Frontend: onRoundEnded recebido.');
    setRoundEnded(true);
    setRoundStarted(false);
    setLetter(null);
    setStopClickedByMe(false);
    clearLocalCountdown();
  }, [clearLocalCountdown]);

  const onRoomResetAck = useCallback(() => {
    console.log('Frontend: onRoomResetAck recebido.');
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
        console.log(`Socket reconectado. Tentando reingressar na sala ${savedRoomId} com userId ${savedUserId}...`);
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
      console.error("Erro de Conexão do Socket:", err.message, err);
      setIsConnected(false);
      setRoomError("Não foi possível conectar ao servidor. Verifique sua internet ou tente novamente mais tarde.");
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
    };
  }, [
    userId, isInRoom, 
    onRejoinRoomSuccess, onRejoinRoomFail, onRoomSavedSuccess, onRoomConfigUpdated, onChangesSavedSuccess,
    onRoomJoined, onRoomError, onPlayersUpdated, onRoundStarted, onRoundStartCountdown, onRoundEnded, onRoomResetAck
  ]);

  useEffect(() => {
    console.log("App.jsx Render Update: isRoomSaved is now", isRoomSaved);
    console.log("App.jsx Render Update: isAdmin is now", isAdmin);
    console.log("App.jsx Render Update: roundStarted is now", roundStarted);
    console.log("App.jsx Render Update: roundEnded is now", roundEnded);
    console.log("App.jsx Render Update: currentLetter is now", letter);
    console.log("App.jsx Render Update: alert is now", alert);
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
