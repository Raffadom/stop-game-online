import { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function Timer({ duration, room }) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [timerEnded, setTimerEnded] = useState(false);

  useEffect(() => {
    setTimeLeft(duration);
    setTimerEnded(false);
  }, [duration]);

  useEffect(() => {
    if (timeLeft <= 0 || timerEnded) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1;
        
        // Se chegou a 0, emitir time_up UMA VEZ
        if (newTime <= 0 && !timerEnded) {
          console.log('[Timer] Time up! Emitting time_up event for room:', room);
          setTimerEnded(true);
          socket.emit('time_up', { room });
          clearInterval(timer);
          return 0;
        }
        
        return newTime;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, room, timerEnded]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const getColorClass = () => {
    if (timeLeft <= 10) return 'text-red-600 animate-pulse';
    if (timeLeft <= 30) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className={`text-4xl font-bold text-center ${getColorClass()}`}>
      ⏰ {minutes}:{seconds.toString().padStart(2, '0')}
    </div>
  );
}