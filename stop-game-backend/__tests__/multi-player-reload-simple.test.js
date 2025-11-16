const ioClient = require('socket.io-client');
const path = require('path');

// Reduced timeout to prevent hanging
jest.setTimeout(30000);

describe('Simplified Multi-player reload tests', () => {
  let backend;
  let server;
  let io;
  let roomConfigs;
  let serverPort;

  beforeAll(async () => {
    // Import backend module
    backend = require(path.join(__dirname, '..', 'index.js'));
    server = backend.server;
    io = backend.io;
    roomConfigs = backend.roomConfigs;

    // Start server on ephemeral port
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  afterEach(async () => {
    // Clean up room configs and timeouts
    if (roomConfigs) {
      Object.keys(roomConfigs).forEach(roomId => {
        if (roomConfigs[roomId] && roomConfigs[roomId].adminTransferTimeout) {
          clearTimeout(roomConfigs[roomId].adminTransferTimeout);
        }
        delete roomConfigs[roomId];
      });
    }
  });

  const connectAndJoin = async (userId, nickname, roomId) => {
    return new Promise((resolve, reject) => {
      const socket = ioClient(`http://localhost:${serverPort}`, { 
        transports: ['websocket'], 
        forceNew: true,
        timeout: 5000
      });
      
      const timeout = setTimeout(() => {
        socket.disconnect();
        reject(new Error(`Connection timeout for ${nickname}`));
      }, 5000);
      
      socket.on('connect', () => {
        clearTimeout(timeout);
        socket.emit('join_room', { userId, nickname, roomId });
      });
      
      socket.on('room_joined', () => {
        resolve(socket);
      });
      
      socket.on('connect_error', (error) => {
        clearTimeout(timeout);
        reject(new Error(`Connection failed: ${error}`));
      });
    });
  };

  test.skip('Basic 3 players with reload - score preservation', async () => {
    console.log('🎯 Starting basic 3-player reload test...');
    
    const roomId = 'TEST001';
    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
    
    // Connect players
    const alice = await connectAndJoin('p1', 'Alice', roomId);
    const bob = await connectAndJoin('p2', 'Bob', roomId);
    const carol = await connectAndJoin('p3', 'Carol', roomId);
    
    console.log('✅ All players connected');
    
    // Start round
    await new Promise((resolve) => {
      alice.emit('start_round', { roomId });
      alice.on('round_started', resolve);
    });
    
    // Submit answers
    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));
    
    alice.emit('submit_answers', { roomId, answers: makeAnswers('A') });
    bob.emit('submit_answers', { roomId, answers: makeAnswers('B') });
    carol.emit('submit_answers', { roomId, answers: makeAnswers('C') });
    
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('📝 All answers submitted');
    
    // Simulate Bob reload
    bob.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newBob = await connectAndJoin('p2', 'Bob', roomId);
    console.log('🔄 Bob reloaded successfully');
    
    // Complete round and validate
    let validationComplete = false;
    const validationPromise = new Promise((resolve) => {
      alice.on('validation_completed', (data) => {
        if (!validationComplete) {
          validationComplete = true;
          resolve(data);
        }
      });
    });
    
    // Auto-validate answers
    let validationCount = 0;
    alice.on('start_validation', () => {
      const autoValidate = () => {
        if (validationCount < 18) { // 3 players × 6 themes
          alice.emit('validate_answer', { valid: true, roomId });
          validationCount++;
          setTimeout(autoValidate, 10);
        }
      };
      autoValidate();
    });
    
    alice.emit('complete_round', { roomId });
    const result = await validationPromise;
    
    // Verify scores
    expect(Object.keys(result.scores)).toHaveLength(3);
    Object.entries(result.scores).forEach(([playerId, score]) => {
      expect(score).toBe(600); // 6 themes × 100 points
    });
    
    console.log('✅ Test passed: All players have 600 points');
    
    // Cleanup
    [alice, newBob, carol].forEach(socket => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });
  });

  test.skip('5 players with multiple reloads', async () => {
    console.log('🚀 Starting 5-player stress test...');
    
    const roomId = 'STRESS5';
    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
    const players = [];
    
    // Connect 5 players
    for (let i = 1; i <= 5; i++) {
      const socket = await connectAndJoin(`p${i}`, `Player${i}`, roomId);
      players.push(socket);
    }
    
    console.log('✅ All 5 players connected');
    
    // Start round
    await new Promise((resolve) => {
      players[0].emit('start_round', { roomId });
      players[0].on('round_started', resolve);
    });
    
    // Submit answers
    for (let i = 0; i < players.length; i++) {
      const answers = themes.map(t => ({ theme: t, answer: `P${i+1}-${t}` }));
      players[i].emit('submit_answers', { roomId, answers });
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('📝 All answers submitted');
    
    // Simulate reloads for players 2, 3, and 4
    for (let i = 1; i <= 3; i++) {
      players[i].disconnect();
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const newSocket = await connectAndJoin(`p${i+1}`, `Player${i+1}`, roomId);
      players[i] = newSocket;
    }
    
    console.log('🔄 Multiple reloads completed');
    
    // Complete round
    let validationComplete = false;
    const validationPromise = new Promise((resolve) => {
      players[0].on('validation_completed', (data) => {
        if (!validationComplete) {
          validationComplete = true;
          resolve(data);
        }
      });
    });
    
    // Auto-validate
    let validationCount = 0;
    players[0].on('start_validation', () => {
      const autoValidate = () => {
        if (validationCount < 30) { // 5 players × 6 themes
          players[0].emit('validate_answer', { valid: true, roomId });
          validationCount++;
          setTimeout(autoValidate, 10);
        }
      };
      autoValidate();
    });
    
    players[0].emit('complete_round', { roomId });
    const result = await validationPromise;
    
    // Verify results
    expect(Object.keys(result.scores)).toHaveLength(5);
    Object.entries(result.scores).forEach(([playerId, score]) => {
      expect(score).toBe(600);
    });
    
    console.log('✅ Stress test passed: All 5 players have 600 points');
    
    // Cleanup
    players.forEach(socket => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });
  });

  test('Admin role preservation during reload', async () => {
    console.log('👑 Testing admin role preservation...');
    
    const roomId = 'ADMIN1';
    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
    
    // Connect players
    const alice = await connectAndJoin('p1', 'Alice', roomId);
    const bob = await connectAndJoin('p2', 'Bob', roomId);
    
    // Verify Alice is admin
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(roomConfigs[roomId].admin).toBe('Alice');
    console.log('✅ Alice confirmed as admin');
    
    // Start round and submit answers
    await new Promise((resolve) => {
      alice.emit('start_round', { roomId });
      alice.on('round_started', resolve);
    });
    
    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));
    
    alice.emit('submit_answers', { roomId, answers: makeAnswers('A') });
    bob.emit('submit_answers', { roomId, answers: makeAnswers('B') });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Admin (Alice) disconnects
    alice.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Alice reconnects
    const newAlice = await connectAndJoin('p1', 'Alice', roomId);
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify Alice is still admin
    expect(roomConfigs[roomId].admin).toBe('Alice');
    console.log('👑 Admin role preserved after reload');
    
    // Complete round
    let validationComplete = false;
    const validationPromise = new Promise((resolve) => {
      newAlice.on('validation_completed', (data) => {
        if (!validationComplete) {
          validationComplete = true;
          resolve(data);
        }
      });
    });
    
    let validationCount = 0;
    newAlice.on('start_validation', () => {
      const autoValidate = () => {
        if (validationCount < 12) { // 2 players × 6 themes
          newAlice.emit('validate_answer', { valid: true, roomId });
          validationCount++;
          setTimeout(autoValidate, 10);
        }
      };
      autoValidate();
    });
    
    newAlice.emit('complete_round', { roomId });
    const result = await validationPromise;
    
    // Verify scores
    expect(Object.keys(result.scores)).toHaveLength(2);
    Object.entries(result.scores).forEach(([playerId, score]) => {
      expect(score).toBe(600);
    });
    
    console.log('✅ Admin test passed: Role preserved and scores correct');
    
    // Cleanup
    [newAlice, bob].forEach(socket => {
      if (socket && socket.connected) {
        socket.disconnect();
      }
    });
  });
});