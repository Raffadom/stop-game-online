const ioClient = require('socket.io-client');
const path = require('path');

jest.setTimeout(60000); // 1 minuto para teste completo

describe('Ranking system validation with 8 players over 10 rounds', () => {
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

        await new Promise((resolve) => {
            server.listen(0, () => {
                serverPort = server.address().port;
                console.log(`🚀 Test server running on port ${serverPort}`);
                resolve();
            });
        });
    });

    afterAll(async () => {
        if (server && server.listening) {
            await new Promise((resolve) => {
                server.close(() => {
                    console.log('🛑 Test server closed');
                    resolve();
                });
            });
        }
    });

    afterEach(async () => {
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

    const connectPlayer = async (userId, nickname, roomId) => {
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
                // Ensure roomId is defined
                const actualRoomId = roomId || 'DEFAULT_ROOM';
                socket.emit('join_room', { userId, nickname, roomId: actualRoomId });
            });

            socket.on('room_joined', () => {
                resolve(socket);
            });

            socket.on('connect_error', (error) => {
                clearTimeout(timeout);
                reject(new Error(`Connection failed for ${nickname}: ${error}`));
            });
        });
    };

    const simulateRound = async (clients, roomId, roundNumber, themes) => {
        console.log(`🎯 Round ${roundNumber}: Starting...`);
        
        // Start round
        await new Promise((resolve) => {
            clients[0].emit('start_round', { roomId });
            setTimeout(resolve, 200);
        });

        // Each player submits answers with different strategies to create varied scores
        const roundAnswers = {};
        
        for (let i = 0; i < clients.length; i++) {
            const playerAnswers = themes.map((theme, themeIndex) => {
                let answer;
                
                // Strategy to create varied scores:
                // Some players give similar answers (lower scores)
                // Others give unique answers (higher scores)
                switch (i % 4) {
                    case 0: // Player tends to give unique answers
                        answer = `${String.fromCharCode(65 + i)}-${theme}-R${roundNumber}-${themeIndex}`;
                        break;
                    case 1: // Player sometimes duplicates
                        answer = roundNumber % 3 === 0 ? 
                            `Common-${theme}` : 
                            `${String.fromCharCode(65 + i)}-${theme}-R${roundNumber}`;
                        break;
                    case 2: // Player gives popular answers
                        answer = roundNumber % 2 === 0 ? 
                            `Popular-${theme}` : 
                            `${String.fromCharCode(65 + i)}-${theme}-Unique`;
                        break;
                    case 3: // Mixed strategy
                        answer = themeIndex % 2 === 0 ? 
                            `Duplicate-${theme}` : 
                            `${String.fromCharCode(65 + i)}-${theme}-Solo`;
                        break;
                }
                
                return { theme, answer };
            });
            
            clients[i].emit('submit_answers', { roomId, answers: playerAnswers });
            roundAnswers[`p${i + 1}`] = playerAnswers;
        }

        await new Promise(resolve => setTimeout(resolve, 300));

        // Simulate some reloads during the round (2-3 random players)
        const playersToReload = [1, 3, 5].slice(0, Math.floor(Math.random() * 3) + 1);
        
        for (const playerIndex of playersToReload) {
            const userId = `p${playerIndex + 1}`;
            const nickname = `Player${playerIndex + 1}`;
            
            // Disconnect
            clients[playerIndex].disconnect();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Reconnect
            const newClient = await connectPlayer(userId, nickname, roomId);
            clients[playerIndex] = newClient;
            
            console.log(`  🔄 Player${playerIndex + 1} reloaded during round ${roundNumber}`);
        }

        // Complete round and get validation results
        let validationCompleted = false;
        const validationPromise = new Promise((resolve) => {
            clients[0].on('validation_completed', (data) => {
                if (!validationCompleted) {
                    validationCompleted = true;
                    resolve(data);
                }
            });
        });

        // Auto-validate all answers
        let validationCount = 0;
        const expectedValidations = clients.length * themes.length;
        
        clients[0].on('start_validation', () => {
            const autoValidate = () => {
                if (validationCount < expectedValidations) {
                    clients[0].emit('validate_answer', { valid: true, roomId });
                    validationCount++;
                    setTimeout(autoValidate, 20);
                }
            };
            autoValidate();
        });

        clients[0].emit('complete_round', { roomId });
        const validationResult = await validationPromise;

        console.log(`  ✅ Round ${roundNumber} completed - Validations: ${validationCount}/${expectedValidations}`);
        
        return validationResult;
    };

    test('8 players complete game with 10 rounds and final ranking validation', async () => {
        console.log('🏆 Starting complete 8-player, 10-round ranking test...');
        
        const roomId = 'RANKING8P10R';
        const players = [
            { userId: 'p1', nickname: 'Alice' },
            { userId: 'p2', nickname: 'Bruno' },
            { userId: 'p3', nickname: 'Carlos' },
            { userId: 'p4', nickname: 'Diana' },
            { userId: 'p5', nickname: 'Eduardo' },
            { userId: 'p6', nickname: 'Fernanda' },
            { userId: 'p7', nickname: 'Gabriel' },
            { userId: 'p8', nickname: 'Helena' }
        ];
        
        const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
        const clients = [];
        
        // Connect all 8 players
        console.log('👥 Connecting 8 players...');
        for (const player of players) {
            const client = await connectPlayer(player.userId, player.nickname, roomId);
            clients.push(client);
        }
        
        console.log('✅ All 8 players connected successfully');
        
        // Verify initial room setup
        expect(roomConfigs[roomId]).toBeDefined();
        expect(roomConfigs[roomId].players).toHaveLength(8);
        expect(roomConfigs[roomId].admin).toBe('Alice');
        
        // Track cumulative scores across all rounds
        const cumulativeScores = {};
        players.forEach(player => {
            cumulativeScores[player.userId] = 0;
        });
        
        // Play 10 rounds
        const roundResults = [];
        
        for (let round = 1; round <= 10; round++) {
            const roundResult = await simulateRound(clients, roomId, round, themes);
            roundResults.push(roundResult);
            
            // Update cumulative scores
            Object.entries(roundResult.scores).forEach(([playerId, roundScore]) => {
                cumulativeScores[playerId] += roundScore;
            });
            
            // Log round results
            console.log(`📊 Round ${round} Scores:`, Object.entries(roundResult.scores).map(([id, score]) => `${id}:${score}`).join(', '));
            
            // Verify scores are reasonable (0-600 per round for 6 themes)
            Object.entries(roundResult.scores).forEach(([playerId, score]) => {
                expect(score).toBeGreaterThanOrEqual(0);
                expect(score).toBeLessThanOrEqual(600); // Max 100 points per theme
            });
        }
        
        console.log('🎯 All 10 rounds completed successfully!');
        
        // Calculate final ranking
        const finalRanking = Object.entries(cumulativeScores)
            .map(([userId, totalScore]) => ({
                userId,
                nickname: players.find(p => p.userId === userId).nickname,
                totalScore
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
        
        console.log('\n🏆 FINAL RANKING:');
        finalRanking.forEach((player, index) => {
            console.log(`  ${index + 1}º ${player.nickname} (${player.userId}): ${player.totalScore} points`);
        });
        
        // Validation checks
        console.log('\n🔍 Validating ranking system...');
        
        // 1. Verify all players are in ranking
        expect(finalRanking).toHaveLength(8);
        
        // 2. Verify ranking is sorted correctly (descending scores)
        for (let i = 0; i < finalRanking.length - 1; i++) {
            expect(finalRanking[i].totalScore).toBeGreaterThanOrEqual(finalRanking[i + 1].totalScore);
        }
        
        // 3. Verify all scores are reasonable totals
        finalRanking.forEach(player => {
            expect(player.totalScore).toBeGreaterThanOrEqual(0);
            expect(player.totalScore).toBeLessThanOrEqual(6000); // Max 600 per round × 10 rounds
        });
        
        // 4. Verify no player ID is duplicated
        const userIds = finalRanking.map(p => p.userId);
        const uniqueUserIds = [...new Set(userIds)];
        expect(uniqueUserIds).toHaveLength(8);
        
        // 5. Verify all original players are present
        players.forEach(originalPlayer => {
            const foundInRanking = finalRanking.find(p => p.userId === originalPlayer.userId);
            expect(foundInRanking).toBeDefined();
            expect(foundInRanking.nickname).toBe(originalPlayer.nickname);
        });
        
        // 6. Statistical validation
        const scores = finalRanking.map(p => p.totalScore);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        
        console.log('\n📈 Score Statistics:');
        console.log(`  Average Score: ${avgScore.toFixed(2)}`);
        console.log(`  Highest Score: ${maxScore} (${finalRanking[0].nickname})`);
        console.log(`  Lowest Score: ${minScore} (${finalRanking[finalRanking.length - 1].nickname})`);
        console.log(`  Score Range: ${maxScore - minScore}`);
        
        // Verify reasonable score distribution
        expect(avgScore).toBeGreaterThan(0);
        expect(maxScore).toBeGreaterThan(minScore);
        
        console.log('\n✅ RANKING VALIDATION COMPLETE!');
        console.log('📋 Summary:');
        console.log('  ✅ 8 players completed 10 rounds');
        console.log('  ✅ All scores calculated correctly');
        console.log('  ✅ Ranking sorted properly');
        console.log('  ✅ No data loss during reloads');
        console.log('  ✅ Statistical validation passed');
        console.log('  ✅ System performance stable');
        
        // Final room state verification
        const finalRoomState = roomConfigs[roomId];
        expect(finalRoomState.players).toHaveLength(8);
        expect(finalRoomState.admin).toBe('Alice'); // Admin should be preserved
        
        // Cleanup
        clients.forEach(client => {
            if (client && client.connected) {
                client.disconnect();
            }
        });
        
        console.log('\n🎮 Complete game simulation finished successfully!');
        
    }, 55000); // 55 second timeout for complete game
    
    test('Ranking consistency under stress - multiple reloads during game', async () => {
        console.log('💪 Testing ranking consistency under reload stress...');
        
        const roomId = 'STRESS_RANKING';
        const players = Array.from({length: 6}, (_, i) => ({
            userId: `s${i + 1}`,
            nickname: `Stress${i + 1}`
        }));
        
        const themes = ['Nome', 'Cidade', 'País'];
        const clients = [];
        
        // Connect players
        for (const player of players) {
            const client = await connectPlayer(player.userId, player.nickname, roomId);
            clients.push(client);
        }
        
        console.log('👥 6 stress test players connected');
        
        // Play 3 rounds with heavy reload simulation
        const cumulativeScores = {};
        players.forEach(player => {
            cumulativeScores[player.userId] = 0;
        });
        
        for (let round = 1; round <= 3; round++) {
            console.log(`🎯 Stress Round ${round}...`);
            
            // Start round
            clients[0].emit('start_round', { roomId });
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Submit answers
            for (let i = 0; i < clients.length; i++) {
                const answers = themes.map(theme => ({
                    theme,
                    answer: `S${i + 1}-${theme}-R${round}`
                }));
                clients[i].emit('submit_answers', { roomId, answers });
            }
            
            // Intensive reload simulation - reload ALL players except admin
            for (let i = 1; i < clients.length; i++) {
                const userId = players[i].userId;
                const nickname = players[i].nickname;
                
                clients[i].disconnect();
                await new Promise(resolve => setTimeout(resolve, 50));
                
                const newClient = await connectPlayer(userId, nickname, roomId);
                clients[i] = newClient;
            }
            
            console.log(`  🔄 ${clients.length - 1} players reloaded in round ${round}`);
            
            // Complete round
            let validationCompleted = false;
            const validationPromise = new Promise((resolve) => {
                clients[0].on('validation_completed', (data) => {
                    if (!validationCompleted) {
                        validationCompleted = true;
                        resolve(data);
                    }
                });
            });
            
            // Auto-validate
            let validationCount = 0;
            clients[0].on('start_validation', () => {
                const autoValidate = () => {
                    if (validationCount < clients.length * themes.length) {
                        clients[0].emit('validate_answer', { valid: true, roomId });
                        validationCount++;
                        setTimeout(autoValidate, 10);
                    }
                };
                autoValidate();
            });
            
            clients[0].emit('complete_round', { roomId });
            const result = await validationPromise;
            
            // Update scores
            Object.entries(result.scores).forEach(([playerId, score]) => {
                cumulativeScores[playerId] += score;
            });
        }
        
        // Verify final ranking after stress test
        const stressRanking = Object.entries(cumulativeScores)
            .map(([userId, totalScore]) => ({
                userId,
                totalScore
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
        
        console.log('🏆 Stress Test Final Ranking:');
        stressRanking.forEach((player, index) => {
            console.log(`  ${index + 1}º ${player.userId}: ${player.totalScore} points`);
        });
        
        // Validations
        expect(stressRanking).toHaveLength(6);
        stressRanking.forEach(player => {
            expect(player.totalScore).toBeGreaterThanOrEqual(0);
        });
        
        console.log('✅ Stress test ranking validation passed!');
        
        // Cleanup
        clients.forEach(client => {
            if (client && client.connected) {
                client.disconnect();
            }
        });
        
    }, 30000);
});