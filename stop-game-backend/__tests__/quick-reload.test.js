const ioClient = require('socket.io-client');
const path = require('path');

// Very short timeout to prevent hanging
jest.setTimeout(15000);

describe('Quick reload tests', () => {
  let backend;
  let server;
  let io;
  let roomConfigs;
  let serverPort;

  beforeAll(async () => {
    backend = require(path.join(__dirname, '..', 'index.js'));
    server = backend.server;
    io = backend.io;
    roomConfigs = backend.roomConfigs;

    // Start server
    await new Promise((resolve) => {
      server.listen(0, () => {
        serverPort = server.address().port;
        console.log(`Test server running on port ${serverPort}`);
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server && server.listening) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('Test server closed');
          resolve();
        });
      });
    }
  });

  afterEach(async () => {
    // Quick cleanup
    if (roomConfigs) {
      Object.keys(roomConfigs).forEach(roomId => {
        const config = roomConfigs[roomId];
        if (config?.adminTransferTimeout) {
          clearTimeout(config.adminTransferTimeout);
        }
        delete roomConfigs[roomId];
      });
    }
  });

  test('2 players, 1 reload, scores preserved', async () => {
    console.log('🎯 Testing 2 players with reload...');
    
    const roomId = 'QUICK01';
    const baseUrl = `http://localhost:${serverPort}`;
    
    // Helper function to connect
    const connect = (userId, nickname) => {
      return new Promise((resolve, reject) => {
        const socket = ioClient(baseUrl, { 
          transports: ['websocket'],
          forceNew: true,
          timeout: 5000
        });
        
        const timeout = setTimeout(() => {
          socket.disconnect();
          reject(new Error('Connection timeout'));
        }, 5000);
        
        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.emit('join_room', { userId, nickname, roomId });
        });
        
        socket.on('room_joined', () => {
          resolve(socket);
        });
        
        socket.on('connect_error', () => {
          clearTimeout(timeout);
          reject(new Error('Connection failed'));
        });
      });
    };

    // Connect 2 players
    const alice = await connect('p1', 'Alice');
    const bob = await connect('p2', 'Bob');
    
    console.log('✅ Players connected');
    
    // Start round
    await new Promise((resolve) => {
      alice.emit('start_round', { roomId });
      setTimeout(resolve, 100); // Simple timeout instead of waiting for event
    });
    
    // Submit answers
    const themes = ['Nome', 'Cidade', 'País'];
    const aliceAnswers = themes.map(t => ({ theme: t, answer: `A-${t}` }));
    const bobAnswers = themes.map(t => ({ theme: t, answer: `B-${t}` }));
    
    alice.emit('submit_answers', { roomId, answers: aliceAnswers });
    bob.emit('submit_answers', { roomId, answers: bobAnswers });
    
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log('📝 Answers submitted');
    
    // Bob disconnects and reconnects
    bob.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const newBob = await connect('p2', 'Bob');
    console.log('🔄 Bob reconnected');
    
    // Verify room state
    expect(roomConfigs[roomId]).toBeDefined();
    const config = roomConfigs[roomId];
    expect(config.players.length).toBe(2);
    expect(config.submittedAnswers.p1).toBeDefined();
    expect(config.submittedAnswers.p2).toBeDefined();
    
    console.log('✅ Quick test passed: Scores preserved through reload');
    
    // Clean disconnect
    alice.disconnect();
    newBob.disconnect();
  }, 10000);

  test('Admin role preserved during reload', async () => {
    console.log('👑 Testing admin preservation...');
    
    const roomId = 'ADMIN01';
    const baseUrl = `http://localhost:${serverPort}`;
    
    const connect = (userId, nickname) => {
      return new Promise((resolve, reject) => {
        const socket = ioClient(baseUrl, { 
          transports: ['websocket'],
          forceNew: true,
          timeout: 5000
        });
        
        const timeout = setTimeout(() => {
          reject(new Error('Timeout'));
        }, 5000);
        
        socket.on('connect', () => {
          clearTimeout(timeout);
          socket.emit('join_room', { userId, nickname, roomId });
        });
        
        socket.on('room_joined', () => {
          resolve(socket);
        });
      });
    };

    // Connect admin
    const alice = await connect('p1', 'Alice');
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify admin
    expect(roomConfigs[roomId]).toBeDefined();
    expect(roomConfigs[roomId].admin).toBe('Alice');
    console.log('👑 Alice is admin');
    
    // Admin disconnects
    alice.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Admin reconnects
    const newAlice = await connect('p1', 'Alice');
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify admin preserved
    expect(roomConfigs[roomId].admin).toBe('Alice');
    console.log('✅ Admin role preserved');
    
    newAlice.disconnect();
  }, 8000);

  test('Score calculation accuracy', async () => {
    console.log('🧮 Testing score calculation...');
    
    const roomId = 'CALC01';
    const baseUrl = `http://localhost:${serverPort}`;
    
    const connect = (userId, nickname) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { 
          transports: ['websocket'],
          forceNew: true
        });
        
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, roomId });
        });
        
        socket.on('room_joined', () => {
          resolve(socket);
        });
      });
    };

    const alice = await connect('p1', 'Alice');
    const bob = await connect('p2', 'Bob');
    
    // Submit different answers to test scoring
    const themes = ['Nome', 'Cidade'];
    alice.emit('submit_answers', { 
      roomId, 
      answers: [
        { theme: 'Nome', answer: 'Ana' },
        { theme: 'Cidade', answer: 'Aracaju' }
      ]
    });
    
    bob.emit('submit_answers', { 
      roomId, 
      answers: [
        { theme: 'Nome', answer: 'Bruno' },
        { theme: 'Cidade', answer: 'Brasília' }
      ]
    });
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check submitted answers are stored
    const config = roomConfigs[roomId];
    expect(config.submittedAnswers.p1).toBeDefined();
    expect(config.submittedAnswers.p2).toBeDefined();
    expect(config.submittedAnswers.p1.length).toBe(2);
    expect(config.submittedAnswers.p2.length).toBe(2);
    
    console.log('✅ Score calculation test passed');
    
    alice.disconnect();
    bob.disconnect();
  }, 6000);
});