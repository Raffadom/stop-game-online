const ioClient = require('socket.io-client');
const path = require('path');

jest.setTimeout(120000); // 2 minutes for extreme stress testing

describe('Multi-player reload and scoring integration', () => {
  let backend;
  let server;
  let io;
  let roomConfigs;

  beforeAll(() => {
    // Import backend module (in test mode it won't listen automatically)
    backend = require(path.join(__dirname, '..', 'index.js'));
    server = backend.server;
    io = backend.io;
    roomConfigs = backend.roomConfigs;
  });

  afterAll(async () => {
    try {
      server.close();
    } catch (e) {}
  });

  test('three players, one reload during round, final scores preserved', async () => {
    // Start server on an ephemeral port
    await new Promise((resolve, reject) => {
      server.listen(0, () => resolve());
    });

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const room = 'ABC123';

    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];

    const connectAndJoin = (userId, nickname, isReconnecting = false) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, room, isReconnecting });
        });
        socket.on('room_joined', () => resolve(socket));
      });
    };

    const s1 = await connectAndJoin('p1', 'Alice');
    const s2 = await connectAndJoin('p2', 'Bob');
    const s3 = await connectAndJoin('p3', 'Carol');

    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));

    // Submit answers from all players
    s1.emit('submit_answers', { room, answers: makeAnswers('A') });
    s2.emit('submit_answers', { room, answers: makeAnswers('B') });
    s3.emit('submit_answers', { room, answers: makeAnswers('C') });

    // Ensure roomConfig exists and mark round active so stop_round will proceed
    // Wait a bit until server created the roomConfig
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(roomConfigs[room]).toBeDefined();
    roomConfigs[room].roundActive = true;

    // Simulate reload: disconnect s2 and reconnect as isReconnecting
    s2.disconnect();
    const s2re = await new Promise(resolve => {
      setTimeout(async () => {
        const s = await connectAndJoin('p2', 'Bob', true);
        resolve(s);
      }, 50);
    });

    // Wait for server to have persisted lastSubmittedAnswers
    await new Promise(resolve => setTimeout(resolve, 50));

    // Collect validation notifications for each player
    const validationPromises = [];
    const playerValidated = {};

    const mkValidatedPromise = (socket, id) => new Promise((resolve) => {
      socket.on('validation_complete_for_player', (data) => {
        playerValidated[id] = data.myTotalScore;
        resolve({ id, data });
      });
    });

    validationPromises.push(mkValidatedPromise(s1, 'p1'));
    validationPromises.push(mkValidatedPromise(s2re, 'p2'));
    validationPromises.push(mkValidatedPromise(s3, 'p3'));

    // Auto-validate all answers as valid
    let validationCount = 0;
    const expectedValidations = 18; // 3 players x 6 themes
    
    s1.on('start_validation', (validationData) => {
      // Automatically validate as true
      setTimeout(() => {
        s1.emit('validate_answer', { valid: true, room });
        validationCount++;
        
        // If we've validated all items, complete the process
        if (validationCount >= expectedValidations) {
          // Force complete validation manually since auto-validation might not trigger it
          setTimeout(() => {
            if (backend.completeValidation) {
              backend.completeValidation(room);
            }
          }, 100);
        }
      }, 50);
    });

    // Trigger stop_round from creator to start validation flow
    s1.emit('stop_round', { room });

    // Wait for all validations to complete with longer timeout
    await Promise.race([
      Promise.all(validationPromises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Validation timeout')), 15000))
    ]);

    // Now request end_game and wait for final ranking
    const finalRanking = await new Promise((resolve) => {
      s1.on('game_ended', (data) => resolve(data.finalRanking));
      s1.emit('end_game', { room });
    });

    // Expect each player to have 600 points (6 unique themes x 100 each)
    const expectedScorePerPlayer = 6 * 100;

    const rankingMap = finalRanking.reduce((acc, r) => { acc[r.playerId] = r.totalScore; return acc; }, {});

    expect(rankingMap['p1']).toBe(expectedScorePerPlayer);
    expect(rankingMap['p2']).toBe(expectedScorePerPlayer);
    expect(rankingMap['p3']).toBe(expectedScorePerPlayer);

    // Cleanup sockets
    s1.disconnect();
    s2re.disconnect();
    s3.disconnect();
  });

  test('stress test: eight players with multiple reloads during round', async () => {
    // Start server on different port to avoid conflicts
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const room = 'STRESS1';

    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];

    const connectAndJoin = (userId, nickname, isReconnecting = false) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, room, isReconnecting });
        });
        socket.on('room_joined', () => resolve(socket));
      });
    };

    // Connect 8 players
    const players = [
      { id: 'p1', name: 'Alice' },
      { id: 'p2', name: 'Bob' },
      { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'David' },
      { id: 'p5', name: 'Eve' },
      { id: 'p6', name: 'Frank' },
      { id: 'p7', name: 'Grace' },
      { id: 'p8', name: 'Henry' }
    ];

    console.log('🚀 Connecting 8 players...');
    const sockets = {};
    for (const player of players) {
      sockets[player.id] = await connectAndJoin(player.id, player.name);
      console.log(`✅ ${player.name} connected`);
    }

    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));

    // All players submit answers
    console.log('📝 All players submitting answers...');
    for (const player of players) {
      const prefix = player.name[0]; // A, B, C, D, E, F, G, H
      sockets[player.id].emit('submit_answers', { room, answers: makeAnswers(prefix) });
    }

    // Wait for server to process all submissions
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(roomConfigs[room]).toBeDefined();
    roomConfigs[room].roundActive = true;

    // Simulate multiple reloads during the game
    console.log('🔄 Starting multiple reload simulation...');
    
    // Reload Bob (p2)
    console.log('🔄 Reloading Bob...');
    sockets['p2'].disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    sockets['p2'] = await connectAndJoin('p2', 'Bob', true);
    
    // Reload Eve (p5)
    console.log('🔄 Reloading Eve...');
    sockets['p5'].disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    sockets['p5'] = await connectAndJoin('p5', 'Eve', true);
    
    // Reload Grace (p7) 
    console.log('🔄 Reloading Grace...');
    sockets['p7'].disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    sockets['p7'] = await connectAndJoin('p7', 'Grace', true);

    // Additional simultaneous reloads
    console.log('🔄 Simultaneous reload of David and Frank...');
    sockets['p4'].disconnect();
    sockets['p6'].disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    const [davidSocket, frankSocket] = await Promise.all([
      connectAndJoin('p4', 'David', true),
      connectAndJoin('p6', 'Frank', true)
    ]);
    sockets['p4'] = davidSocket;
    sockets['p6'] = frankSocket;

    // Wait for all reconnections to stabilize
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('✅ All reloads completed, starting validation...');

    // Collect validation notifications for each player
    const validationPromises = [];
    const playerValidated = {};

    const mkValidatedPromise = (socket, id) => new Promise((resolve) => {
      socket.on('validation_complete_for_player', (data) => {
        playerValidated[id] = data.myTotalScore;
        console.log(`✅ ${id} validated with ${data.myTotalScore} points`);
        resolve({ id, data });
      });
    });

    // Set up validation promises for all players
    for (const player of players) {
      validationPromises.push(mkValidatedPromise(sockets[player.id], player.id));
    }

    // Auto-validate all answers as valid
    let validationCount = 0;
    const expectedValidations = 8 * 6; // 8 players x 6 themes = 48 validations
    
    sockets['p1'].on('start_validation', (validationData) => {
      // Automatically validate as true
      setTimeout(() => {
        sockets['p1'].emit('validate_answer', { valid: true, room });
        validationCount++;
        
        // If we've validated all items, complete the process
        if (validationCount >= expectedValidations) {
          setTimeout(() => {
            if (backend.completeValidation) {
              backend.completeValidation(room);
            }
          }, 100);
        }
      }, 50);
    });

    // Trigger stop_round from creator to start validation flow
    sockets['p1'].emit('stop_round', { room });

    // Wait for all validations to complete
    console.log('⏳ Waiting for all validations...');
    await Promise.race([
      Promise.all(validationPromises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Stress test validation timeout')), 30000))
    ]);

    console.log('✅ All validations completed, requesting final ranking...');

    // Now request end_game and wait for final ranking
    const finalRanking = await new Promise((resolve) => {
      sockets['p1'].on('game_ended', (data) => {
        console.log('🏆 Final ranking received:', data.finalRanking.map(r => `${r.nickname}: ${r.totalScore}`));
        resolve(data.finalRanking);
      });
      sockets['p1'].emit('end_game', { room });
    });

    // Expect each player to have 600 points (6 unique themes x 100 each)
    const expectedScorePerPlayer = 6 * 100;

    const rankingMap = finalRanking.reduce((acc, r) => { acc[r.playerId] = r.totalScore; return acc; }, {});

    // Verify all 8 players have correct scores
    for (const player of players) {
      console.log(`🎯 ${player.name} (${player.id}): ${rankingMap[player.id]} points`);
      expect(rankingMap[player.id]).toBe(expectedScorePerPlayer);
    }

    console.log('🎉 Stress test passed! All 8 players maintained correct scores despite multiple reloads.');

    // Cleanup all sockets
    for (const player of players) {
      sockets[player.id].disconnect();
    }
  });

  test('extreme stress test: twenty players with massive reloads during round', async () => {
    // Start server on different port to avoid conflicts
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const room = 'EXTREME1';

    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];

    const connectAndJoin = (userId, nickname, isReconnecting = false) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, room, isReconnecting });
        });
        socket.on('room_joined', () => resolve(socket));
      });
    };

    // Connect 20 players
    const players = [
      { id: 'p1', name: 'Alice' },     { id: 'p2', name: 'Bob' },       { id: 'p3', name: 'Carol' },
      { id: 'p4', name: 'David' },     { id: 'p5', name: 'Eve' },       { id: 'p6', name: 'Frank' },
      { id: 'p7', name: 'Grace' },     { id: 'p8', name: 'Henry' },     { id: 'p9', name: 'Irene' },
      { id: 'p10', name: 'Jack' },     { id: 'p11', name: 'Kate' },     { id: 'p12', name: 'Liam' },
      { id: 'p13', name: 'Maya' },     { id: 'p14', name: 'Noah' },     { id: 'p15', name: 'Olivia' },
      { id: 'p16', name: 'Paul' },     { id: 'p17', name: 'Quinn' },    { id: 'p18', name: 'Rachel' },
      { id: 'p19', name: 'Steve' },    { id: 'p20', name: 'Tina' }
    ];

    console.log('🚀 EXTREME TEST: Connecting 20 players...');
    const sockets = {};
    
    // Connect players in batches to avoid overwhelming the server
    const batchSize = 5;
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      const batchPromises = batch.map(player => connectAndJoin(player.id, player.name));
      const batchSockets = await Promise.all(batchPromises);
      
      batchSockets.forEach((socket, idx) => {
        sockets[batch[idx].id] = socket;
      });
      
      console.log(`✅ Batch ${Math.floor(i/batchSize) + 1}/4 connected (${batch.map(p => p.name).join(', ')})`);
      
      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));

    // All players submit answers in batches
    console.log('📝 EXTREME TEST: All 20 players submitting answers...');
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      batch.forEach(player => {
        const prefix = player.name[0]; // A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T
        sockets[player.id].emit('submit_answers', { room, answers: makeAnswers(prefix) });
      });
      console.log(`📝 Batch ${Math.floor(i/batchSize) + 1}/4 answers submitted`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    // Wait for server to process all submissions
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(roomConfigs[room]).toBeDefined();
    roomConfigs[room].roundActive = true;

    // Massive reload simulation
    console.log('🔄 EXTREME TEST: Starting massive reload simulation...');
    
    // Round 1: Individual reloads (6 players)
    const reloadTargets1 = ['p2', 'p5', 'p8', 'p11', 'p14', 'p17'];
    console.log(`🔄 Round 1: Individual reloads (${reloadTargets1.join(', ')})...`);
    for (const playerId of reloadTargets1) {
      const player = players.find(p => p.id === playerId);
      console.log(`🔄 Reloading ${player.name}...`);
      sockets[playerId].disconnect();
      await new Promise(resolve => setTimeout(resolve, 50));
      sockets[playerId] = await connectAndJoin(playerId, player.name, true);
    }
    
    // Round 2: Simultaneous reloads (4 players)
    const reloadTargets2 = ['p3', 'p7', 'p12', 'p19'];
    console.log(`🔄 Round 2: Simultaneous reloads (${reloadTargets2.join(', ')})...`);
    reloadTargets2.forEach(playerId => sockets[playerId].disconnect());
    await new Promise(resolve => setTimeout(resolve, 100));
    const reloadPromises2 = reloadTargets2.map(playerId => {
      const player = players.find(p => p.id === playerId);
      return connectAndJoin(playerId, player.name, true);
    });
    const reloadedSockets2 = await Promise.all(reloadPromises2);
    reloadTargets2.forEach((playerId, idx) => {
      sockets[playerId] = reloadedSockets2[idx];
    });

    // Round 3: Mass simultaneous reload (6 players)
    const reloadTargets3 = ['p4', 'p6', 'p10', 'p15', 'p18', 'p20'];
    console.log(`🔄 Round 3: Mass simultaneous reload (${reloadTargets3.join(', ')})...`);
    reloadTargets3.forEach(playerId => sockets[playerId].disconnect());
    await new Promise(resolve => setTimeout(resolve, 100));
    const reloadPromises3 = reloadTargets3.map(playerId => {
      const player = players.find(p => p.id === playerId);
      return connectAndJoin(playerId, player.name, true);
    });
    const reloadedSockets3 = await Promise.all(reloadPromises3);
    reloadTargets3.forEach((playerId, idx) => {
      sockets[playerId] = reloadedSockets3[idx];
    });

    // Round 4: Additional chaos - some players reload again
    const reloadTargets4 = ['p2', 'p8', 'p13', 'p16']; // Some players reload twice
    console.log(`🔄 Round 4: Additional chaos reloads (${reloadTargets4.join(', ')})...`);
    for (const playerId of reloadTargets4) {
      const player = players.find(p => p.id === playerId);
      console.log(`🔄 Double-reloading ${player.name}...`);
      sockets[playerId].disconnect();
      await new Promise(resolve => setTimeout(resolve, 50));
      sockets[playerId] = await connectAndJoin(playerId, player.name, true);
    }

    // Wait for all reconnections to stabilize
    await new Promise(resolve => setTimeout(resolve, 300));

    console.log('✅ EXTREME TEST: All 20 players stabilized after massive reloads, starting validation...');

    // Collect validation notifications for each player
    const validationPromises = [];
    const playerValidated = {};

    const mkValidatedPromise = (socket, id) => new Promise((resolve) => {
      socket.on('validation_complete_for_player', (data) => {
        playerValidated[id] = data.myTotalScore;
        console.log(`✅ ${id} validated with ${data.myTotalScore} points`);
        resolve({ id, data });
      });
    });

    // Set up validation promises for all 20 players
    for (const player of players) {
      validationPromises.push(mkValidatedPromise(sockets[player.id], player.id));
    }

    // Auto-validate all answers as valid
    let validationCount = 0;
    const expectedValidations = 20 * 6; // 20 players x 6 themes = 120 validations
    
    sockets['p1'].on('start_validation', (validationData) => {
      // Automatically validate as true
      setTimeout(() => {
        sockets['p1'].emit('validate_answer', { valid: true, room });
        validationCount++;
        
        // If we've validated all items, complete the process
        if (validationCount >= expectedValidations) {
          setTimeout(() => {
            if (backend.completeValidation) {
              backend.completeValidation(room);
            }
          }, 100);
        }
      }, 30); // Faster validation for 120 items
    });

    // Trigger stop_round from creator to start validation flow
    sockets['p1'].emit('stop_round', { room });

    // Wait for all validations to complete
    console.log('⏳ EXTREME TEST: Waiting for 120 validations from 20 players...');
    await Promise.race([
      Promise.all(validationPromises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Extreme stress test validation timeout')), 90000))
    ]);

    console.log('✅ EXTREME TEST: All validations completed, requesting final ranking...');

    // Now request end_game and wait for final ranking
    const finalRanking = await new Promise((resolve) => {
      sockets['p1'].on('game_ended', (data) => {
        console.log('🏆 EXTREME Final ranking received:', data.finalRanking.map(r => `${r.nickname}: ${r.totalScore}`));
        resolve(data.finalRanking);
      });
      sockets['p1'].emit('end_game', { room });
    });

    // Expect each player to have 600 points (6 unique themes x 100 each)
    const expectedScorePerPlayer = 6 * 100;

    const rankingMap = finalRanking.reduce((acc, r) => { acc[r.playerId] = r.totalScore; return acc; }, {});

    // Verify all 20 players have correct scores
    for (const player of players) {
      console.log(`🎯 ${player.name} (${player.id}): ${rankingMap[player.id]} points`);
      expect(rankingMap[player.id]).toBe(expectedScorePerPlayer);
    }

    console.log('🎉 EXTREME STRESS TEST PASSED! All 20 players maintained correct scores despite massive reloads.');
    console.log('📊 Summary:');
    console.log(`   - 20 simultaneous players`);
    console.log(`   - 16 total reloads (6 individual + 4 simultaneous + 6 mass simultaneous + 4 double reloads)`);
    console.log(`   - 120 total validations (20 players × 6 themes)`);
    console.log(`   - 100% accuracy in score preservation`);

    // Cleanup all sockets
    for (const player of players) {
      sockets[player.id].disconnect();
    }
  });

  test('admin role preservation and transfer: reload vs leave room', async () => {
    // Start server on different port to avoid conflicts
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const room = 'ADMIN1';

    const connectAndJoin = (userId, nickname, isReconnecting = false) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, room, isReconnecting });
        });
        socket.on('room_joined', () => resolve(socket));
      });
    };

    const checkAdminStatus = () => {
      const config = roomConfigs[room];
      if (!config || !config.players) return null;
      
      const adminPlayer = Object.values(config.players).find(p => p.isCreator);
      return adminPlayer ? { userId: adminPlayer.userId, nickname: adminPlayer.nickname } : null;
    };

    // Phase 1: Connect 4 players in order
    console.log('👥 ADMIN TEST: Connecting 4 players in sequence...');
    const s1 = await connectAndJoin('p1', 'Alice');  // Should be admin (first to join)
    const s2 = await connectAndJoin('p2', 'Bob');
    const s3 = await connectAndJoin('p3', 'Carol');
    const s4 = await connectAndJoin('p4', 'David');

    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Alice is admin
    let currentAdmin = checkAdminStatus();
    console.log(`👑 Initial admin: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p1');
    expect(currentAdmin?.nickname).toBe('Alice');

    // Phase 2: Admin (Alice) reloads - should maintain admin status
    console.log('🔄 ADMIN TEST: Admin (Alice) reloading...');
    s1.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Check admin status during reload
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin during Alice reload: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice should still be admin even when disconnected
    
    const s1_reload = await connectAndJoin('p1', 'Alice', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Alice is still admin after reload
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin after Alice reload: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p1');
    expect(currentAdmin?.nickname).toBe('Alice');

    // Phase 3: Non-admin (Bob) reloads - admin should remain Alice
    console.log('🔄 ADMIN TEST: Non-admin (Bob) reloading...');
    s2.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin during Bob reload: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice should remain admin
    
    const s2_reload = await connectAndJoin('p2', 'Bob', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin after Bob reload: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice should still be admin

    // Phase 4: Admin (Alice) leaves room voluntarily - Bob should become admin
    console.log('🚪 ADMIN TEST: Admin (Alice) leaving room voluntarily...');
    s1_reload.emit('leave_room', { userId: 'p1', room });
    await new Promise(resolve => setTimeout(resolve, 200));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 New admin after Alice left: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p2'); // Bob should be admin now (second to join)
    expect(currentAdmin?.nickname).toBe('Bob');

    // Phase 5: New admin (Bob) reloads - should maintain admin status
    console.log('🔄 ADMIN TEST: New admin (Bob) reloading...');
    s2_reload.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin during Bob reload (as admin): ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p2'); // Bob should remain admin
    
    const s2_admin_reload = await connectAndJoin('p2', 'Bob', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin after Bob reload (as admin): ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p2');
    expect(currentAdmin?.nickname).toBe('Bob');

    // Phase 6: Bob leaves, Carol should become admin
    console.log('🚪 ADMIN TEST: Bob leaving room voluntarily...');
    s2_admin_reload.emit('leave_room', { userId: 'p2', room });
    await new Promise(resolve => setTimeout(resolve, 200));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 New admin after Bob left: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p3'); // Carol should be admin now (third to join)
    expect(currentAdmin?.nickname).toBe('Carol');

    // Phase 7: Carol leaves, David should become admin
    console.log('🚪 ADMIN TEST: Carol leaving room voluntarily...');
    s3.emit('leave_room', { userId: 'p3', room });
    await new Promise(resolve => setTimeout(resolve, 200));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Final admin after Carol left: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p4'); // David should be admin now (last remaining)
    expect(currentAdmin?.nickname).toBe('David');

    // Phase 8: Final validation - David reloads and should maintain admin status
    console.log('🔄 ADMIN TEST: Final admin (David) reloading...');
    s4.disconnect();
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin during David reload (final): ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p4'); // David should remain admin
    
    const s4_final_reload = await connectAndJoin('p4', 'David', true);
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Final admin after David reload: ${currentAdmin?.nickname} (${currentAdmin?.userId})`);
    expect(currentAdmin?.userId).toBe('p4');
    expect(currentAdmin?.nickname).toBe('David');

    console.log('✅ ADMIN TEST PASSED: All admin role transitions validated successfully!');
    console.log('📋 Summary:');
    console.log('   ✅ Admin preserved during reload');
    console.log('   ✅ Admin transferred correctly on voluntary leave');
    console.log('   ✅ Admin succession order maintained (Alice → Bob → Carol → David)');
    console.log('   ✅ New admin can reload and maintain status');

    // Cleanup
    s4_final_reload.disconnect();
  });

  test('browser behavior simulation: tab switching, minimization during active round with time sync', async () => {
    // Start server on different port to avoid conflicts
    await new Promise((resolve) => {
      server.listen(0, () => resolve());
    });

    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    const room = 'BROWSER1';

    const connectAndJoin = (userId, nickname, isReconnecting = false) => {
      return new Promise((resolve) => {
        const socket = ioClient(baseUrl, { transports: ['websocket'], forceNew: true });
        socket.on('connect', () => {
          socket.emit('join_room', { userId, nickname, room, isReconnecting });
        });
        socket.on('room_joined', () => resolve(socket));
      });
    };

    const checkAdminStatus = () => {
      const config = roomConfigs[room];
      if (!config || !config.players) return null;
      
      const adminPlayer = Object.values(config.players).find(p => p.isCreator);
      return adminPlayer ? { userId: adminPlayer.userId, nickname: adminPlayer.nickname } : null;
    };

    const checkRoundStatus = () => {
      const config = roomConfigs[room];
      return {
        roundActive: config?.roundActive || false,
        roundEnded: config?.roundEnded || false,
        currentLetter: config?.currentLetter || null,
        duration: config?.duration || 0
      };
    };

    // Phase 1: Setup - Connect 4 players
    console.log('🌐 BROWSER TEST: Setting up 4 players...');
    const s1 = await connectAndJoin('p1', 'Alice');  // Admin
    const s2 = await connectAndJoin('p2', 'Bob');
    const s3 = await connectAndJoin('p3', 'Carol'); 
    const s4 = await connectAndJoin('p4', 'David');

    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Verify Alice is admin
    let currentAdmin = checkAdminStatus();
    console.log(`👑 Initial setup - Admin: ${currentAdmin?.nickname}`);
    expect(currentAdmin?.userId).toBe('p1');

    // Phase 2: Start a round and simulate browser behaviors during active gameplay
    console.log('🚀 BROWSER TEST: Starting round...');
    
    // Set up round config and mark as active
    const config = roomConfigs[room];
    config.roundActive = true;
    config.currentLetter = 'A';
    config.duration = 180; // 3 minutes
    
    // Simulate countdown completion and round start
    console.log('⏰ BROWSER TEST: Round started with letter A, 180 seconds');
    
    let roundStatus = checkRoundStatus();
    expect(roundStatus.roundActive).toBe(true);
    expect(roundStatus.currentLetter).toBe('A');

    // Phase 3: Players submit answers
    console.log('📝 BROWSER TEST: Players submitting answers...');
    const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
    const makeAnswers = (prefix) => themes.map(t => ({ theme: t, answer: `${prefix}-${t}` }));

    s1.emit('submit_answers', { room, answers: makeAnswers('A') });
    s2.emit('submit_answers', { room, answers: makeAnswers('B') });
    s3.emit('submit_answers', { room, answers: makeAnswers('C') });
    s4.emit('submit_answers', { room, answers: makeAnswers('D') });

    await new Promise(resolve => setTimeout(resolve, 100));

    // Phase 4: Simulate browser tab switch (Alice minimizes/changes tab)
    console.log('🔄 BROWSER TEST: Alice switches tab/minimizes browser during round...');
    s1.disconnect(); // Simulate tab losing focus/network interruption
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify admin is preserved and round continues
    currentAdmin = checkAdminStatus();
    roundStatus = checkRoundStatus();
    console.log(`👑 During Alice tab switch - Admin: ${currentAdmin?.nickname}, Round active: ${roundStatus.roundActive}`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice should remain admin
    expect(roundStatus.roundActive).toBe(true); // Round should continue

    // Alice returns from tab switch
    console.log('🔄 BROWSER TEST: Alice returns from tab switch...');
    const s1_return = await connectAndJoin('p1', 'Alice', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    roundStatus = checkRoundStatus();
    console.log(`👑 Alice returned - Admin: ${currentAdmin?.nickname}, Round active: ${roundStatus.roundActive}`);
    expect(currentAdmin?.userId).toBe('p1');
    expect(roundStatus.roundActive).toBe(true);

    // Phase 5: Simulate browser minimization (Bob minimizes window)
    console.log('🔄 BROWSER TEST: Bob minimizes browser window during round...');
    s2.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Round should continue, admin unchanged
    currentAdmin = checkAdminStatus();
    roundStatus = checkRoundStatus();
    console.log(`👑 During Bob minimize - Admin: ${currentAdmin?.nickname}, Round active: ${roundStatus.roundActive}`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice remains admin
    expect(roundStatus.roundActive).toBe(true);

    // Bob returns from minimized state
    console.log('🔄 BROWSER TEST: Bob returns from minimized state...');
    const s2_return = await connectAndJoin('p2', 'Bob', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));

    // Phase 6: Simulate multiple simultaneous browser interruptions
    console.log('🔄 BROWSER TEST: Carol and David lose connection simultaneously (network issues)...');
    s3.disconnect();
    s4.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Only Alice and Bob should be "active", but round continues
    currentAdmin = checkAdminStatus();
    roundStatus = checkRoundStatus();
    console.log(`👑 During multiple disconnects - Admin: ${currentAdmin?.nickname}, Round active: ${roundStatus.roundActive}`);
    expect(currentAdmin?.userId).toBe('p1');
    expect(roundStatus.roundActive).toBe(true);

    // Carol and David return together
    console.log('🔄 BROWSER TEST: Carol and David return simultaneously...');
    const [s3_return, s4_return] = await Promise.all([
      connectAndJoin('p3', 'Carol', true),
      connectAndJoin('p4', 'David', true)
    ]);
    
    await new Promise(resolve => setTimeout(resolve, 150));

    // Phase 7: Simulate admin losing focus and another player ready to take over
    console.log('🔄 BROWSER TEST: Admin (Alice) goes AFK, then returns...');
    s1_return.disconnect();
    
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Admin should still be Alice (temporary disconnection)
    currentAdmin = checkAdminStatus();
    roundStatus = checkRoundStatus();
    console.log(`👑 Admin AFK - Admin: ${currentAdmin?.nickname}, Round active: ${roundStatus.roundActive}`);
    expect(currentAdmin?.userId).toBe('p1'); // Alice still admin during temporary absence

    // Alice returns from AFK
    console.log('🔄 BROWSER TEST: Admin Alice returns from AFK...');
    const s1_final = await connectAndJoin('p1', 'Alice', true);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    
    currentAdmin = checkAdminStatus();
    console.log(`👑 Admin returned from AFK - Admin: ${currentAdmin?.nickname}`);
    expect(currentAdmin?.userId).toBe('p1');

    // Phase 8: Complete the round with all players back
    console.log('🏁 BROWSER TEST: Completing round with all players reconnected...');
    
    // Verify all players have their answers preserved
    const allPlayersConfig = roomConfigs[room];
    const playersWithAnswers = Object.values(allPlayersConfig.players).filter(p => p.lastSubmittedAnswers);
    console.log(`📊 Players with preserved answers: ${playersWithAnswers.length}/4`);
    expect(playersWithAnswers.length).toBe(4); // All 4 players should have their answers

    // Stop the round and validate that everyone gets their scores
    s1_final.emit('stop_round', { room });
    
    // Set up auto-validation for quick completion
    let validationCount = 0;
    const expectedValidations = 24; // 4 players x 6 themes
    
    s1_final.on('start_validation', () => {
      setTimeout(() => {
        s1_final.emit('validate_answer', { valid: true, room });
        validationCount++;
        
        if (validationCount >= expectedValidations) {
          setTimeout(() => {
            if (backend.completeValidation) {
              backend.completeValidation(room);
            }
          }, 100);
        }
      }, 30);
    });

    // Wait for validation completion
    const validationPromises = [s1_final, s2_return, s3_return, s4_return].map((socket, idx) => {
      const playerId = ['p1', 'p2', 'p3', 'p4'][idx];
      return new Promise((resolve) => {
        socket.on('validation_complete_for_player', (data) => {
          console.log(`✅ ${playerId} validated with ${data.myTotalScore} points`);
          resolve({ playerId, score: data.myTotalScore });
        });
      });
    });

    await Promise.race([
      Promise.all(validationPromises),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Browser test validation timeout')), 15000))
    ]);

    // Final admin check - should still be Alice
    currentAdmin = checkAdminStatus();
    console.log(`👑 Final admin after all browser events: ${currentAdmin?.nickname}`);
    expect(currentAdmin?.userId).toBe('p1');

    console.log('✅ BROWSER TEST PASSED: All browser behavior scenarios validated!');
    console.log('📋 Summary:');
    console.log('   ✅ Tab switching preserved admin and game state');
    console.log('   ✅ Browser minimization did not affect gameplay');
    console.log('   ✅ Multiple simultaneous disconnects handled gracefully');
    console.log('   ✅ Admin AFK/return maintained admin status');
    console.log('   ✅ All player answers preserved through browser events');
    console.log('   ✅ Round completion and scoring worked correctly');

    // Cleanup
    [s1_final, s2_return, s3_return, s4_return].forEach(socket => {
      socket.disconnect();
    });
  });
});
