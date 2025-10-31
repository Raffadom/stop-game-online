import { useState, useEffect, useCallback } from 'react';

const SESSION_KEY = 'stop_game_session';
const VALIDATION_KEY = 'stop_game_validation_state'; // ✅ NOVO
const HEARTBEAT_INTERVAL = 30000; // 30 segundos

export const useSessionPersistence = () => {
  const [sessionData, setSessionData] = useState(null);

  // ✅ Salvar sessão
  const saveSession = useCallback((data) => {
    const session = {
      ...data,
      timestamp: Date.now(),
      lastActivity: Date.now()
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setSessionData(session);
    
    console.log('[SessionPersistence] Sessão salva:', session);
  }, []);

  // ✅ Recuperar sessão
  const loadSession = useCallback(() => {
    try {
      const stored = localStorage.getItem(SESSION_KEY);
      if (!stored) return null;
      
      const session = JSON.parse(stored);
      
      // Verificar se a sessão não expirou (24 horas)
      const MAX_AGE = 24 * 60 * 60 * 1000;
      if (Date.now() - session.timestamp > MAX_AGE) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      
      setSessionData(session);
      console.log('[SessionPersistence] Sessão carregada:', session);
      return session;
    } catch (error) {
      console.error('[SessionPersistence] Erro ao carregar sessão:', error);
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
  }, []);

  // ✅ Limpar sessão
  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY);
    setSessionData(null);
    console.log('[SessionPersistence] Sessão limpa');
  }, []);

  // ✅ Atualizar atividade
  const updateActivity = useCallback(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        session.lastActivity = Date.now();
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        setSessionData(session);
      } catch (error) {
        console.error('[SessionPersistence] Erro ao atualizar atividade:', error);
      }
    }
  }, []);

  // ✅ Heartbeat para manter sessão ativa
  useEffect(() => {
    let heartbeat;
    
    if (sessionData) {
      heartbeat = setInterval(() => {
        updateActivity();
      }, HEARTBEAT_INTERVAL);
    }
    
    return () => {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    };
  }, [sessionData, updateActivity]);

  // ✅ ADICIONAR: Salvar estado de validação
  const saveValidationState = useCallback((validationData) => {
    const validationState = {
      ...validationData,
      timestamp: Date.now()
    };
    
    localStorage.setItem(VALIDATION_KEY, JSON.stringify(validationState));
    console.log('[SessionPersistence] Estado de validação salvo:', validationState);
  }, []);

  // ✅ ADICIONAR: Recuperar estado de validação
  const loadValidationState = useCallback(() => {
    try {
      const stored = localStorage.getItem(VALIDATION_KEY);
      if (!stored) return null;
      
      const validationState = JSON.parse(stored);
      
      // Verificar se não expirou (10 minutos)
      const MAX_AGE = 10 * 60 * 1000;
      if (Date.now() - validationState.timestamp > MAX_AGE) {
        localStorage.removeItem(VALIDATION_KEY);
        return null;
      }
      
      console.log('[SessionPersistence] Estado de validação carregado:', validationState);
      return validationState;
    } catch (error) {
      console.error('[SessionPersistence] Erro ao carregar estado de validação:', error);
      localStorage.removeItem(VALIDATION_KEY);
      return null;
    }
  }, []);

  // ✅ ADICIONAR: Limpar estado de validação
  const clearValidationState = useCallback(() => {
    localStorage.removeItem(VALIDATION_KEY);
    console.log('[SessionPersistence] Estado de validação limpo');
  }, []);

  return {
    sessionData,
    saveSession,
    loadSession,
    clearSession,
    updateActivity,
    saveValidationState,    // ✅ NOVO
    loadValidationState,    // ✅ NOVO
    clearValidationState    // ✅ NOVO
  };
};