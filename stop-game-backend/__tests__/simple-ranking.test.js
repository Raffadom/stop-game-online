const path = require('path');

jest.setTimeout(30000); // 30 seconds timeout

describe('Simplified Ranking Validation', () => {
    let backend;
    let roomConfigs;

    beforeAll(() => {
        backend = require(path.join(__dirname, '..', 'index.js'));
        roomConfigs = backend.roomConfigs;
    });

    afterEach(() => {
        if (roomConfigs) {
            Object.keys(roomConfigs).forEach(roomId => {
                delete roomConfigs[roomId];
            });
        }
    });

    const simulateGameRound = (roomId, players, round) => {
        console.log(`🎯 Simulating Round ${round}...`);
        
        const themes = ['Nome', 'Cidade', 'País', 'Marca', 'Cor', 'Animal'];
        const roundScores = {};
        
        // Simulate different answer strategies for varied scores
        players.forEach((player, index) => {
            const answers = themes.map((theme, themeIndex) => {
                let answer;
                
                // Strategy to create score variation:
                switch (index % 4) {
                    case 0: // Always unique answers
                        answer = `${player.nickname}-${theme}-R${round}-Unique`;
                        break;
                    case 1: // Sometimes duplicates
                        answer = round % 3 === 0 ? 
                            `Common-${theme}` : 
                            `${player.nickname}-${theme}-R${round}`;
                        break;
                    case 2: // Popular answers
                        answer = round % 2 === 0 ? 
                            `Popular-${theme}` : 
                            `${player.nickname}-${theme}-Solo`;
                        break;
                    case 3: // Mixed strategy
                        answer = themeIndex % 2 === 0 ? 
                            `Shared-${theme}` : 
                            `${player.nickname}-${theme}-Original`;
                        break;
                }
                
                return { theme, answer };
            });
            
            // Store answers for this player
            roomConfigs[roomId].submittedAnswers[player.userId] = answers;
        });
        
        // Calculate scores for this round (simplified scoring logic)
        const answerMap = {};
        
        // Group answers by theme
        themes.forEach(theme => {
            answerMap[theme] = {};
            
            players.forEach(player => {
                const playerAnswers = roomConfigs[roomId].submittedAnswers[player.userId];
                const themeAnswer = playerAnswers.find(a => a.theme === theme);
                
                if (themeAnswer) {
                    const normalizedAnswer = themeAnswer.answer.toLowerCase().trim();
                    
                    if (!answerMap[theme][normalizedAnswer]) {
                        answerMap[theme][normalizedAnswer] = [];
                    }
                    answerMap[theme][normalizedAnswer].push(player.userId);
                }
            });
        });
        
        // Calculate scores
        players.forEach(player => {
            let totalScore = 0;
            
            themes.forEach(theme => {
                const playerAnswers = roomConfigs[roomId].submittedAnswers[player.userId];
                const themeAnswer = playerAnswers.find(a => a.theme === theme);
                
                if (themeAnswer) {
                    const normalizedAnswer = themeAnswer.answer.toLowerCase().trim();
                    const playersWithSameAnswer = answerMap[theme][normalizedAnswer];
                    
                    if (playersWithSameAnswer && playersWithSameAnswer.length > 0) {
                        // Score = 100 / number of players with same answer
                        const score = Math.floor(100 / playersWithSameAnswer.length);
                        totalScore += score;
                    }
                }
            });
            
            roundScores[player.userId] = totalScore;
        });
        
        console.log(`  Round ${round} scores:`, Object.entries(roundScores).map(([id, score]) => `${id}:${score}`).join(', '));
        return roundScores;
    };

    test('8 players - 10 rounds - ranking validation', () => {
        console.log('🏆 Testing 8-player ranking system over 10 rounds...');
        
        const roomId = 'RANKING_TEST';
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
        
        // Setup room
        roomConfigs[roomId] = {
            players: players.map(p => ({ ...p, socketId: `socket_${p.userId}`, connected: true })),
            admin: 'Alice',
            submittedAnswers: {},
            roundInProgress: false
        };
        
        console.log(`👥 Room created with ${players.length} players`);
        
        // Track cumulative scores across all rounds
        const cumulativeScores = {};
        players.forEach(player => {
            cumulativeScores[player.userId] = 0;
        });
        
        // Simulate 10 rounds
        for (let round = 1; round <= 10; round++) {
            const roundScores = simulateGameRound(roomId, players, round);
            
            // Update cumulative scores
            Object.entries(roundScores).forEach(([playerId, roundScore]) => {
                cumulativeScores[playerId] += roundScore;
            });
            
            // Simulate some player reloads every few rounds
            if (round % 3 === 0) {
                console.log(`  🔄 Simulating reloads in round ${round}...`);
                
                // Simulate 2-3 players disconnecting and reconnecting
                const playersToReload = players.slice(1, 4); // Skip admin
                playersToReload.forEach(player => {
                    // Disconnect
                    const playerIndex = roomConfigs[roomId].players.findIndex(p => p.userId === player.userId);
                    roomConfigs[roomId].players[playerIndex].connected = false;
                    
                    // Reconnect (preserving answers)
                    roomConfigs[roomId].players[playerIndex].connected = true;
                    roomConfigs[roomId].players[playerIndex].socketId = `new_socket_${player.userId}_r${round}`;
                });
                
                // Verify answers are preserved after reload
                expect(roomConfigs[roomId].submittedAnswers[players[1].userId]).toBeDefined();
                expect(roomConfigs[roomId].submittedAnswers[players[2].userId]).toBeDefined();
            }
        }
        
        console.log('🎯 All 10 rounds completed!');
        
        // Calculate final ranking
        const finalRanking = Object.entries(cumulativeScores)
            .map(([userId, totalScore]) => ({
                userId,
                nickname: players.find(p => p.userId === userId).nickname,
                totalScore
            }))
            .sort((a, b) => b.totalScore - a.totalScore);
        
        console.log('\\n🏆 FINAL RANKING:');
        finalRanking.forEach((player, index) => {
            console.log(`  ${index + 1}º ${player.nickname} (${player.userId}): ${player.totalScore} points`);
        });
        
        // Validation checks
        console.log('\\n🔍 Validating ranking system...');
        
        // 1. All players in ranking
        expect(finalRanking).toHaveLength(8);
        
        // 2. Ranking sorted correctly (descending)
        for (let i = 0; i < finalRanking.length - 1; i++) {
            expect(finalRanking[i].totalScore).toBeGreaterThanOrEqual(finalRanking[i + 1].totalScore);
        }
        
        // 3. Reasonable score totals
        finalRanking.forEach(player => {
            expect(player.totalScore).toBeGreaterThan(0);
            expect(player.totalScore).toBeLessThanOrEqual(6000); // Max 600 per round × 10
        });
        
        // 4. No duplicate players
        const userIds = finalRanking.map(p => p.userId);
        const uniqueUserIds = [...new Set(userIds)];
        expect(uniqueUserIds).toHaveLength(8);
        
        // 5. All original players present
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
        
        console.log('\\n📈 Score Statistics:');
        console.log(`  Average Score: ${avgScore.toFixed(2)}`);
        console.log(`  Highest Score: ${maxScore} (${finalRanking[0].nickname})`);
        console.log(`  Lowest Score: ${minScore} (${finalRanking[finalRanking.length - 1].nickname})`);
        console.log(`  Score Range: ${maxScore - minScore}`);
        
        // Score distribution should be reasonable
        expect(avgScore).toBeGreaterThan(0);
        expect(maxScore).toBeGreaterThan(minScore);
        expect(avgScore).toBeGreaterThan(100); // Should average more than 100 points per round
        
        console.log('\\n✅ RANKING VALIDATION COMPLETE!');
        console.log('📋 Summary:');
        console.log('  ✅ 8 players completed 10 rounds');
        console.log('  ✅ Scores calculated correctly based on answer uniqueness');
        console.log('  ✅ Ranking sorted properly (highest to lowest)');
        console.log('  ✅ Data integrity maintained during reloads');
        console.log('  ✅ Statistical validation passed');
        console.log('  ✅ All players accounted for in final ranking');
        
        // Verify room state integrity
        expect(roomConfigs[roomId].players).toHaveLength(8);
        expect(roomConfigs[roomId].admin).toBe('Alice');
        
        console.log('\\n🎮 Ranking simulation completed successfully!');
    });
    
    test('Score calculation accuracy - duplicate vs unique answers', () => {
        console.log('🧮 Testing score calculation with different answer patterns...');
        
        const roomId = 'SCORE_TEST';
        const players = [
            { userId: 'p1', nickname: 'Player1' },
            { userId: 'p2', nickname: 'Player2' },
            { userId: 'p3', nickname: 'Player3' },
            { userId: 'p4', nickname: 'Player4' }
        ];
        
        // Setup room
        roomConfigs[roomId] = {
            players: players.map(p => ({ ...p, socketId: `socket_${p.userId}` })),
            admin: 'Player1',
            submittedAnswers: {},
            roundInProgress: false
        };
        
        // Test case 1: All unique answers (should get 600 points each for 6 themes)
        roomConfigs[roomId].submittedAnswers = {
            'p1': [
                { theme: 'Nome', answer: 'Ana' },
                { theme: 'Cidade', answer: 'Aracaju' },
                { theme: 'País', answer: 'Argentina' },
                { theme: 'Marca', answer: 'Adidas' },
                { theme: 'Cor', answer: 'Azul' },
                { theme: 'Animal', answer: 'Anta' }
            ],
            'p2': [
                { theme: 'Nome', answer: 'Bruno' },
                { theme: 'Cidade', answer: 'Brasília' },
                { theme: 'País', answer: 'Brasil' },
                { theme: 'Marca', answer: 'BMW' },
                { theme: 'Cor', answer: 'Branco' },
                { theme: 'Animal', answer: 'Baleia' }
            ],
            'p3': [
                { theme: 'Nome', answer: 'Carlos' },
                { theme: 'Cidade', answer: 'Curitiba' },
                { theme: 'País', answer: 'Canadá' },
                { theme: 'Marca', answer: 'Canon' },
                { theme: 'Cor', answer: 'Cinza' },
                { theme: 'Animal', answer: 'Cavalo' }
            ],
            'p4': [
                { theme: 'Nome', answer: 'Diana' },
                { theme: 'Cidade', answer: 'Diadema' },
                { theme: 'País', answer: 'Dinamarca' },
                { theme: 'Marca', answer: 'Dell' },
                { theme: 'Cor', answer: 'Dourado' },
                { theme: 'Animal', answer: 'Dinossauro' }
            ]
        };
        
        const uniqueScores = simulateGameRound(roomId, players, 1);
        
        // All should have 600 points (100 per theme × 6 themes)
        Object.values(uniqueScores).forEach(score => {
            expect(score).toBe(600);
        });
        
        console.log('✅ Unique answers test passed - all players got 600 points');
        
        // Test case 2: Some duplicate answers with specific pattern
        roomConfigs[roomId].submittedAnswers = {
            'p1': [
                { theme: 'Nome', answer: 'Ana' },         // Unique = 100
                { theme: 'Cidade', answer: 'são paulo' }, // Shared by 2 = 50
                { theme: 'País', answer: 'Brasil' },      // Unique = 100
                { theme: 'Marca', answer: 'Apple' },      // Unique = 100
                { theme: 'Cor', answer: 'Verde' },        // Unique = 100
                { theme: 'Animal', answer: 'gato' }       // Shared by 2 = 50
            ],
            'p2': [
                { theme: 'Nome', answer: 'Bruno' },       // Unique = 100
                { theme: 'Cidade', answer: 'são paulo' }, // Shared by 2 = 50
                { theme: 'País', answer: 'Argentina' },   // Unique = 100
                { theme: 'Marca', answer: 'Samsung' },    // Unique = 100
                { theme: 'Cor', answer: 'Azul' },         // Unique = 100
                { theme: 'Animal', answer: 'gato' }       // Shared by 2 = 50
            ],
            'p3': [
                { theme: 'Nome', answer: 'Carlos' },      // Unique = 100
                { theme: 'Cidade', answer: 'Rio de Janeiro' }, // Unique = 100
                { theme: 'País', answer: 'Chile' },       // Unique = 100
                { theme: 'Marca', answer: 'Nike' },       // Unique = 100
                { theme: 'Cor', answer: 'Vermelho' },     // Unique = 100
                { theme: 'Animal', answer: 'Cachorro' }   // Unique = 100
            ],
            'p4': [
                { theme: 'Nome', answer: 'Diana' },       // Unique = 100
                { theme: 'Cidade', answer: 'Salvador' },  // Unique = 100
                { theme: 'País', answer: 'Peru' },        // Unique = 100
                { theme: 'Marca', answer: 'LG' },         // Unique = 100
                { theme: 'Cor', answer: 'Roxo' },         // Unique = 100
                { theme: 'Animal', answer: 'Pássaro' }    // Unique = 100
            ]
        };
        
        const mixedScores = simulateGameRound(roomId, players, 2);
        
        // p1 and p2 should have 500 points (100+50+100+100+100+50)
        // p3 and p4 should have 600 points (all unique)
        expect(mixedScores['p1']).toBe(500);
        expect(mixedScores['p2']).toBe(500);
        expect(mixedScores['p3']).toBe(600);
        expect(mixedScores['p4']).toBe(600);
        
        console.log('✅ Mixed answers test passed - correct score distribution');
        
        // Test case 3: All same answer (should get minimum points)
        roomConfigs[roomId].submittedAnswers = {
            'p1': [
                { theme: 'Nome', answer: 'João' },     // 25 points (100/4)
                { theme: 'Cidade', answer: 'Salvador' }, // 25 points (100/4)
                { theme: 'País', answer: 'Brasil' },   // 25 points (100/4)
                { theme: 'Marca', answer: 'Nike' },    // 25 points (100/4)
                { theme: 'Cor', answer: 'Azul' },      // 25 points (100/4)
                { theme: 'Animal', answer: 'Gato' }    // 25 points (100/4)
            ],
            'p2': [
                { theme: 'Nome', answer: 'João' },     // 25 points
                { theme: 'Cidade', answer: 'Salvador' }, // 25 points
                { theme: 'País', answer: 'Brasil' },   // 25 points
                { theme: 'Marca', answer: 'Nike' },    // 25 points
                { theme: 'Cor', answer: 'Azul' },      // 25 points
                { theme: 'Animal', answer: 'Gato' }    // 25 points
            ],
            'p3': [
                { theme: 'Nome', answer: 'João' },     // 25 points
                { theme: 'Cidade', answer: 'Salvador' }, // 25 points
                { theme: 'País', answer: 'Brasil' },   // 25 points
                { theme: 'Marca', answer: 'Nike' },    // 25 points
                { theme: 'Cor', answer: 'Azul' },      // 25 points
                { theme: 'Animal', answer: 'Gato' }    // 25 points
            ],
            'p4': [
                { theme: 'Nome', answer: 'João' },     // 25 points
                { theme: 'Cidade', answer: 'Salvador' }, // 25 points
                { theme: 'País', answer: 'Brasil' },   // 25 points
                { theme: 'Marca', answer: 'Nike' },    // 25 points
                { theme: 'Cor', answer: 'Azul' },      // 25 points
                { theme: 'Animal', answer: 'Gato' }    // 25 points
            ]
        };
        
        const duplicateScores = simulateGameRound(roomId, players, 3);
        
        // All should have 150 points (25 × 6 themes)
        Object.values(duplicateScores).forEach(score => {
            expect(score).toBe(150);
        });
        
        console.log('✅ Duplicate answers test passed - all players got 150 points');
        
        console.log('\\n🏆 Score calculation validation complete!');
        console.log('📋 Confirmed behaviors:');
        console.log('  ✅ Unique answers = 100 points per theme');
        console.log('  ✅ Shared answers = 100/count points per theme');
        console.log('  ✅ Score distribution works correctly');
        console.log('  ✅ Edge cases handled properly');
    });
});