// ═══════════════════════════════════════════════════════════════════════════

// ✅ 퍼지 회귀 모델 수정 패치

// ═══════════════════════════════════════════════════════════════════════════

 

(function FuzzyRegressionFix() {

    'use strict';

 

    console.log('🔧 퍼지 회귀 모델 수정 시작...');

 

    // ═══════════════════════════════════════════════════════════════════════

    // 1️⃣ 퍼지 예측 함수 수정 (Spread 계산 오류 수정)

    // ═══════════════════════════════════════════════════════════════════════

 

    /**

     * ✅ 수정된 퍼지 예측 함수

     *

     * 수정 사항:

     * - Spread 계산 공식 수정: Σ |c_j| × |x_j|

     * - 계수 배열 길이 검증 강화

     * - NaN/Infinity 검증 추가

     * - 상세한 디버그 로그

     */

    window.predictWithFuzzyModel = function(features) {

        try {

            // 1️⃣ 계수 확인

            if (!window.fuzzyCoefficients) {

                console.warn('⚠️ fuzzyCoefficients 없음 - 모델 훈련 필요');

                return { center: 'N/A', spread: 'N/A' };

            }

 

            const { a_coeffs, c_coeffs } = window.fuzzyCoefficients;

 

            // 2️⃣ 계수 배열 검증

            if (!a_coeffs || !c_coeffs) {

                console.error('❌ 계수 배열이 null/undefined');

                return { center: 'N/A', spread: 'N/A' };

            }

 

            if (!Array.isArray(a_coeffs) || !Array.isArray(c_coeffs)) {

                console.error('❌ 계수가 배열이 아님');

                return { center: 'N/A', spread: 'N/A' };

            }

 

            if (a_coeffs.length !== features.length || c_coeffs.length !== features.length) {

                console.error('❌ 계수 배열 길이 불일치:', {

                    features_length: features.length,

                    a_coeffs_length: a_coeffs.length,

                    c_coeffs_length: c_coeffs.length

                });

                return { center: 'N/A', spread: 'N/A' };

            }

 

            // 3️⃣ Center 계산

            let center = 0;

            for (let i = 0; i < features.length; i++) {

                if (!Number.isFinite(a_coeffs[i]) || !Number.isFinite(features[i])) {

                    console.error(`❌ 유효하지 않은 값 [${i}]:`, {

                        a: a_coeffs[i],

                        x: features[i]

                    });

                    return { center: 'N/A', spread: 'N/A' };

                }

                center += a_coeffs[i] * features[i];

            }

 

            // 4️⃣ Spread 계산 (수정된 공식)

            let spread = 0;

            for (let i = 0; i < features.length; i++) {

                if (!Number.isFinite(c_coeffs[i]) || !Number.isFinite(features[i])) {

                    console.error(`❌ 유효하지 않은 값 [${i}]:`, {

                        c: c_coeffs[i],

                        x: features[i]

                    });

                    return { center: 'N/A', spread: 'N/A' };

                }

 

                // ✅ 수정: spread = Σ |c_j| × |x_j|

                const c_abs = Math.abs(c_coeffs[i]);

                const x_abs = Math.abs(features[i]);

                spread += c_abs * x_abs;

            }

 

            // 5️⃣ 결과 검증

            if (!Number.isFinite(center)) {

                console.error('❌ Center가 유효하지 않음:', center);

                return { center: 'N/A', spread: 'N/A' };

            }

 

            if (!Number.isFinite(spread) || spread < 0) {

                console.error('❌ Spread가 유효하지 않음:', spread);

                spread = 0; // 음수 방지

            }

 

            // 6️⃣ 디버그 로그

            console.log('✅ 퍼지 예측 성공:', {

                features: features,

                center: center.toFixed(3),

                spread: spread.toFixed(3),

                range: `[${(center - spread).toFixed(2)}, ${(center + spread).toFixed(2)}]`

            });

 

            return {

                center: center,

                spread: spread

            };

 

        } catch (error) {

            console.error('❌ predictWithFuzzyModel 예외:', error);

            return { center: 'N/A', spread: 'N/A' };

        }

    };

 

    // ═══════════════════════════════════════════════════════════════════════

    // 2️⃣ 퍼지 회귀 훈련 함수 개선

    // ═══════════════════════════════════════════════════════════════════════

 

    /**

     * ✅ 개선된 퍼지 회귀 훈련 함수

     *

     * 수정 사항:

     * - 최소 훈련 데이터 개수 검증 (5 → 10)

     * - LP Solver 존재 확인 강화

     * - 계수 검증 추가

     * - 훈련 실패 시 더미 계수 설정

     */

    window.trainFuzzyRegression = function(initialTraining = false) {

        try {

            console.log('🔄 퍼지 회귀 훈련 시작...', { initialTraining });

 

            // 1️⃣ LP Solver 확인

            if (typeof solver === 'undefined' || typeof solver.Solve !== 'function') {

                throw new Error('❌ LP Solver 라이브러리가 로드되지 않음 (solver.js 필요)');

            }

 

            const trainingData = [];

            const numFeatures = 4; // [1, eloDiff, ppgDiff, upsetScoreDiff]

 

            // 2️⃣ 훈련 데이터 수집

            if (initialTraining) {

                // 초기 훈련: parsedFixtures 사용

                const allFixtures = Object.values(window.parsedFixtures || {}).flat();

 

                for (const fixture of allFixtures) {

                    try {

                        const leagueName = fixture.leagueName;

                        const teamsData = getCurrentTeamsData(

                            leagueName,

                            fixture.homeTeamName,

                            fixture.awayTeamName,

                            window.allLeaguesData

                        );

 

                        if (teamsData?.homeTeam && teamsData?.awayTeam &&

                            typeof fixture.homeScore === 'number' &&

                            typeof fixture.awayScore === 'number') {

 

                            const { homeTeam, awayTeam } = teamsData;

                            const eloDiff = (homeTeam.elo || 1500) - (awayTeam.elo || 1500);

                            const ppgDiff = (homeTeam.ppg || 0) - (awayTeam.ppg || 0);

                            const upsetScoreDiff = 0; // 초기 훈련 시 0

                            const goalDiff = fixture.homeScore - fixture.awayScore;

 

                            trainingData.push({

                                features: [1, eloDiff, ppgDiff, upsetScoreDiff],

                                y: goalDiff

                            });

                        }

                    } catch (e) {

                        console.warn('⚠️ fixture 처리 실패:', e.message);

                    }

                }

            } else {

                // 재훈련: 테이블 데이터 사용

                const resultsBody = document.getElementById('results-body');

                if (!resultsBody) {

                    throw new Error('❌ results-body 요소 없음');

                }

 

                // 이변 점수 재계산

                if (typeof calculateAllUpsetScores === 'function') {

                    calculateAllUpsetScores();

                }

 

                const completedRows = Array.from(resultsBody.querySelectorAll('tr'));

 

                for (const row of completedRows) {

                    if (row.dataset.finalResult && row.dataset.analysis) {

                        try {

                            const analysisData = JSON.parse(row.dataset.analysis);

                            const [homeScore, awayScore] = row.dataset.finalResult.split('-').map(Number);

 

                            if (isNaN(homeScore) || isNaN(awayScore)) continue;

 

                            const goalDiff = homeScore - awayScore;

                            const { homeElo, awayElo, homePpg, awayPpg } = analysisData;

                            const eloDiff = (homeElo || 1500) - (awayElo || 1500);

                            const ppgDiff = (homePpg || 0) - (awayPpg || 0);

 

                            // Upset Score 가져오기

                            const homeTeamName = (analysisData.homeTeam && typeof analysisData.homeTeam === 'object')

                                ? analysisData.homeTeam.name

                                : (analysisData.homeTeamName || '');

                            const awayTeamName = (analysisData.awayTeam && typeof analysisData.awayTeam === 'object')

                                ? analysisData.awayTeam.name

                                : (analysisData.awayTeamName || '');

 

                            const homeUpsetScore = (window.teamUpsetStats && window.teamUpsetStats[homeTeamName]) || 0;

                            const awayUpsetScore = (window.teamUpsetStats && window.teamUpsetStats[awayTeamName]) || 0;

                            const upsetScoreDiff = homeUpsetScore - awayUpsetScore;

 

                            trainingData.push({

                                features: [1, eloDiff, ppgDiff, upsetScoreDiff],

                                y: goalDiff

                            });

                        } catch (e) {

                            console.warn('⚠️ 행 처리 실패:', e.message);

                        }

                    }

                }

            }

 

            // 3️⃣ 데이터 개수 검증 (10개 이상 필요)

            if (trainingData.length < 10) {

                const message = `⚠️ 훈련 데이터 부족 (${trainingData.length}/10)`;

                console.warn(message);

 

                const statusEl = document.getElementById('fuzzy-training-status');

                if (statusEl) {

                    statusEl.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: orange;">${message} - 백테스팅 또는 수동 입력 필요</p>`;

                }

 

                // 더미 계수 설정

                window.fuzzyCoefficients = {

                    a_coeffs: [0, 0.002, 0.3, 0.01],

                    c_coeffs: [0.1, 0.001, 0.15, 0.005]

                };

 

                return;

            }

 

            console.log(`📊 훈련 데이터: ${trainingData.length}개`);

 

            // 4️⃣ LP 모델 구성

            const model = {

                optimize: "fuzziness",

                opType: "min",

                variables: {},

                constraints: {}

            };

 

            const sumAbsX = Array(numFeatures).fill(0);

            trainingData.forEach(d => {

                for (let j = 0; j < numFeatures; j++) {

                    sumAbsX[j] += Math.abs(d.features[j]);

                }

            });

 

            for (let j = 0; j < numFeatures; j++) {

                model.variables[`a${j}`] = { fuzziness: 0 };

                model.variables[`c${j}`] = { fuzziness: sumAbsX[j] };

            }

 

            trainingData.forEach((dataPoint, i) => {

                const { features, y } = dataPoint;

                const upperConstraintName = `upper_${i}`;

                const lowerConstraintName = `lower_${i}`;

 

                model.constraints[upperConstraintName] = { min: y };

                model.constraints[lowerConstraintName] = { max: y };

 

                for (let j = 0; j < numFeatures; j++) {

                    model.variables[`a${j}`][upperConstraintName] = features[j];

                    model.variables[`a${j}`][lowerConstraintName] = features[j];

 

                    model.variables[`c${j}`][upperConstraintName] = Math.abs(features[j]);

                    model.variables[`c${j}`][lowerConstraintName] = -Math.abs(features[j]);

                }

            });

 

            for (let j = 0; j < numFeatures; j++) {

                const nonNegConstraintName = `non_neg_c${j}`;

                model.constraints[nonNegConstraintName] = { min: 0 };

                model.variables[`c${j}`][nonNegConstraintName] = 1;

            }

 

            // 5️⃣ LP Solver 실행

            const results = solver.Solve(model);

 

            if (!results.feasible) {

                throw new Error('LP Solver: 해가 없음 (모델 구성 오류 가능)');

            }

 

            // 6️⃣ 계수 추출 및 검증

            const a_coeffs = Array(numFeatures).fill(0).map((_, i) => results[`a${i}`] || 0);

            const c_coeffs = Array(numFeatures).fill(0).map((_, i) => results[`c${i}`] || 0);

 

            // NaN 확인

            const hasNaN = a_coeffs.some(v => !Number.isFinite(v)) || c_coeffs.some(v => !Number.isFinite(v));

            if (hasNaN) {

                throw new Error('계수에 NaN/Infinity 포함');

            }

 

            window.fuzzyCoefficients = { a_coeffs, c_coeffs };

 

            console.log('✅ 퍼지 회귀 훈련 성공:', {

                a_coeffs: a_coeffs.map(v => v.toFixed(4)),

                c_coeffs: c_coeffs.map(v => v.toFixed(4))

            });

 

            const statusEl = document.getElementById('fuzzy-training-status');

            if (statusEl) {

                statusEl.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: green;">✓ 모델 훈련 완료 (${trainingData.length} 경기 데이터 사용)</p>`;

            }

 

        } catch (error) {

            console.error('❌ 퍼지 회귀 훈련 실패:', error.message);

 

            const statusEl = document.getElementById('fuzzy-training-status');

            if (statusEl) {

                statusEl.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: red;">✗ 훈련 실패: ${error.message}</p>`;

            }

 

            window.fuzzyCoefficients = null;

        }

    };

 

    // ═══════════════════════════════════════════════════════════════════════

    // 3️⃣ 테스트 함수

    // ═══════════════════════════════════════════════════════════════════════

 

    window.testFuzzyRegression = function() {

        console.log('\n🧪 퍼지 회귀 테스트 시작...\n');

 

        try {

            // 테스트 계수 설정

            const testCoefficients = {

                a_coeffs: [0.5, 0.003, 0.25, 0.015],

                c_coeffs: [0.1, 0.001, 0.12, 0.008]

            };

 

            const testFeatures = [1, 100, 0.8, 15]; // [intercept, eloDiff, ppgDiff, upsetDiff]

 

            window.fuzzyCoefficients = testCoefficients;

            const result = window.predictWithFuzzyModel(testFeatures);

 

            // 예상값 계산

            const expectedCenter = 0.5*1 + 0.003*100 + 0.25*0.8 + 0.015*15;

            const expectedSpread = 0.1*1 + 0.001*100 + 0.12*0.8 + 0.008*15;

 

            console.table({

                'Center (계산)': result.center?.toFixed(4) || 'N/A',

                'Center (예상)': expectedCenter.toFixed(4),

                'Spread (계산)': result.spread?.toFixed(4) || 'N/A',

                'Spread (예상)': expectedSpread.toFixed(4),

                'Lower Bound': (result.center - result.spread)?.toFixed(4) || 'N/A',

                'Upper Bound': (result.center + result.spread)?.toFixed(4) || 'N/A'

            });

 

            const centerMatch = Math.abs((result.center || 0) - expectedCenter) < 0.001;

            const spreadMatch = Math.abs((result.spread || 0) - expectedSpread) < 0.001;

 

            if (centerMatch && spreadMatch) {

                console.log('✅ 퍼지 회귀 테스트 성공!\n');

                return true;

            } else {

                console.error('❌ 퍼지 회귀 테스트 실패!\n');

                console.error('차이:', {

                    centerDiff: Math.abs((result.center || 0) - expectedCenter),

                    spreadDiff: Math.abs((result.spread || 0) - expectedSpread)

                });

                return false;

            }

        } catch (e) {

            console.error('❌ 테스트 중 오류:', e);

            return false;

        }

    };

 

    // ═══════════════════════════════════════════════════════════════════════

    // 4️⃣ 자동 초기화

    // ═══════════════════════════════════════════════════════════════════════

 

    // solver.js 로드 확인

    if (typeof solver === 'undefined') {

        console.warn('⚠️ solver.js가 로드되지 않았습니다. 퍼지 회귀 훈련 불가');

        console.warn('   → <script src="solver.js"></script> 추가 필요');

    } else {

        console.log('✅ LP Solver 로드됨');

    }

 

    console.log('✅ 퍼지 회귀 모델 수정 완료');

    console.log('\n사용 방법:');

    console.log('   testFuzzyRegression()           - 퍼지 회귀 테스트');

    console.log('   trainFuzzyRegression(false)     - 모델 재훈련');

    console.log('   predictWithFuzzyModel(features) - 예측 실행\n');

 

})();