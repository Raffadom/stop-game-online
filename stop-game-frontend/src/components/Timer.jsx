import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function Timer({ duration, room, onTimeUp }) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setTimeLeft(duration);
    setIsActive(true);
  }, [duration]);

  useEffect(() => {
    let interval = null;
    
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prevTime) => {
          if (prevTime <= 1) {
            console.log('[Timer] ⏰ Tempo esgotado! Notificando servidor...');
            
            // ✅ Notificar servidor que tempo se esgotou
            socket.emit('time_up', { room });
            
            // ✅ Chamar callback se existir
            if (typeof onTimeUp === 'function') {
              onTimeUp();
            }
            
            setIsActive(false);
            return 0;
          }
          return prevTime - 1;
        });
      }, 1000);
    } else {
      clearInterval(interval);
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, onTimeUp, room]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    return ((duration - timeLeft) / duration) * 100;
  };

  const getColorClass = () => {
    const percentage = (timeLeft / duration) * 100;
    if (percentage > 50) return 'text-green-600';
    if (percentage > 25) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className={`text-6xl font-bold ${getColorClass()}`}>
        {formatTime(timeLeft)}
      </div>
      
      <div className="w-64 bg-gray-200 rounded-full h-4 dark:bg-gray-700">
        <div 
          className={`h-4 rounded-full transition-all duration-1000 ${
            timeLeft <= 10 ? 'bg-red-500' : 
            timeLeft <= 30 ? 'bg-yellow-500' : 'bg-green-500'
          }`}
          style={{ width: `${getProgressPercentage()}%` }}
        />
      </div>
      
      {timeLeft <= 10 && timeLeft > 0 && (
        <div className="text-red-600 font-bold text-xl animate-pulse">
          ⚠️ Tempo se esgotando!
        </div>
      )}
      
      {timeLeft === 0 && (
        <div className="text-red-600 font-bold text-2xl animate-bounce">
          ⏰ Tempo esgotado!
        </div>
      )}
    </div>
  );
}