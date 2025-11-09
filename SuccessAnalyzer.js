/**
 * ==============================================
 * SuccessAnalyzer.js (v2 - 예외 처리 강화)
 * 예측 적중 성공 패턴을 학습하고 검증하는 독립 모듈
 * 
 * [개선 v2] 예외 처리 강화
 * ✅ 입력 검증 추가
 * ✅ 빈 데이터 처리
 * ✅ 부분 실패 격리
 * ✅ 상세한 에러 로깅
 * ==============================================
 */

var successDB = (function() {

    const DB_KEY = 'successAnalyzerDB_v1';
    // [설정] 적중 패턴으로 간주할 최소 임계값
    const MIN_OCCURRENCES = 5;          // 최소 5회 이상 발생
    const SUCCESS_RATE_THRESHOLD = 0.80; // 최소 80% 이상 적중률

    let successRules = {}; 
    let isReady = false;   

    // --- Private LocalStorage Functions (v2 - 예외 처리 강화) ---
    
    function _saveDB() {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(successRules));
            console.log(`✅ SuccessDB (v2): ${Object.keys(successRules).length}개의 성공 규칙을 저장했습니다.`);
        } catch (e) {
            console.error("❌ SuccessDB (v2): localStorage 저장 실패.", e.message);
            console.error("   상세:", e);
        }
    }

    function _loadDB() {
        try {
            // [수정] 먼저 v1 DB 확인
            const storedDB = localStorage.getItem(DB_KEY);
            if (storedDB && storedDB !== '{}') {
                try {
                    successRules = JSON.parse(storedDB);
                    isReady = true; 
                    console.log(`✅ SuccessDB (v2): ${Object.keys(successRules).length}개의 규칙을 불러왔습니다.`);
                    return;
                } catch (parseErr) {
                    console.warn("⚠️ SuccessDB (v2): 저장된 DB 파싱 실패", parseErr.message);
                    // 계속 진행
                }
            }

            // [수정] v1 DB가 없으면 'patterns' 데이터 확인
            const patternsData = localStorage.getItem('patterns');
            if (patternsData) {
                try {
                    const patterns = JSON.parse(patternsData);
                    if (Array.isArray(patterns) && patterns.length > 0) {
                        // patterns 배열을 successRules로 변환
                        patterns.forEach(p => {
                            try {
                                if (p && p.status === 'success') {
                                    successRules[p.name] = {
                                        total: p.count || 0,
                                        successes: Math.round((p.count || 0) * (p.success_rate || 0)),
                                        successRate: p.success_rate || 0
                                    };
                                }
                            } catch (itemErr) {
                                console.warn(`⚠️ 성공 패턴 아이템 변환 실패:`, p, itemErr.message);
                                // 계속 진행
                            }
                        });
                        if (Object.keys(successRules).length > 0) {
                            isReady = true;
                            console.log(`✅ SuccessDB (v2): 'patterns'에서 ${Object.keys(successRules).length}개의 성공 패턴을 복구했습니다.`);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ SuccessDB (v2): 'patterns' 데이터 파싱 실패", e.message);
                }
            }
            
            console.warn("⚠️ SuccessDB (v2): 저장된 DB가 없습니다. [성공 패턴 학습]을 실행하세요.");
        } catch (e) {
            console.error("❌ SuccessDB (v2): localStorage 로드 실패.", e.message);
            try {
                localStorage.removeItem(DB_KEY);
                console.log("🔧 손상된 DB 삭제 완료");
            } catch (removeErr) {
                console.warn("⚠️ DB 삭제 실패:", removeErr.message);
            }
        }
    }

    // --- Private Helper Functions (v2 - 예외 처리 강화) ---
    
    /**
     * ✅ [개선 v2] 안전한 데이터 파싱
     */
    function _parseRowDataWithSuccessCheck(dataset) {
        try {
            if (!dataset) {
                console.warn('⚠️ dataset이 null/undefined');
                return null;
            }

            const data = DataParserUtil.parseRowData(dataset);
            if (!data) {
                console.warn('⚠️ parseRowData 실패:', dataset);
                return null;
            }

            if (data.actualResult === 'N/A') {
                return null;
            }

            try {
                // 안전한 계산
                const { isSuccess } = DataParserUtil.calculateMissAndSuccess(
                    data.hybridPrediction,
                    data.actualResult
                );

                return { ...data, isSuccess };
            } catch (calcErr) {
                console.error('❌ calculateMissAndSuccess 실패:', calcErr.message);
                // 부분 실패 격리 - 원본 데이터 반환
                return data;
            }
        } catch (error) {
            console.error('❌ _parseRowDataWithSuccessCheck 오류:', error.message);
            return null;
        }
    }

    /**
     * [수정] 성공 패턴 분류
     */
    function _classifySuccessPatterns(data) {
        try {
            const patternsFound = [];

            if (!data) {
                console.warn('⚠️ _classifySuccessPatterns: data가 null');
                return patternsFound;
            }

            const {
                hybridPrediction, hplPrediction, btPrediction,
                hplHomeProb, hplAwayProb,
                btHomeProb, btAwayProb
            } = data;

            // [적중 패턴] HPL과 BT 강력한 합의
            if (hplPrediction === btPrediction && hplPrediction === hybridPrediction) {
                const hplConf = hplPrediction === '홈 승' ? hplHomeProb : hplAwayProb;
                const btConf = btPrediction === '홈 승' ? btHomeProb : btAwayProb;
                if (hplConf > 0.70 && btConf > 0.70) {
                    patternsFound.push("SC_A_HPL_BT_STRONG_CONSENSUS");
                }
            }

            // [적중 패턴] 예측 신뢰도 높음
            if (hplPrediction === hybridPrediction) {
                const conf = hplPrediction === '홈 승' ? hplHomeProb : hplAwayProb;
                if (conf > 0.75) {
                    patternsFound.push("SC_B_HIGH_CONFIDENCE");
                }
            }

            return patternsFound;
        } catch (error) {
            console.error('❌ _classifySuccessPatterns 오류:', error.message);
            return []; // 안전한 기본값
        }
    }

    /**
     * ✅ [개선] 각 행 안전 처리 (부분 실패 격리)
     */
    function _processRowSafely(row, rowIndex) {
        try {
            const parsed = _parseRowDataWithSuccessCheck(row);
            if (!parsed || !parsed.isSuccess) {
                return null;
            }

            const patterns = _classifySuccessPatterns(parsed);
            if (patterns.length === 0) {
                return null;
            }

            // 각 패턴 카운트
            patterns.forEach(patternName => {
                try {
                    if (!successRules[patternName]) {
                        successRules[patternName] = { count: 0 };
                    }
                    successRules[patternName].count = (successRules[patternName].count || 0) + 1;
                } catch (countErr) {
                    console.warn(`⚠️ 패턴 카운트 실패 (행 ${rowIndex}):`, patternName, countErr.message);
                }
            });

            return { rowIndex, patterns };
        } catch (error) {
            console.warn(`⚠️ 행 ${rowIndex} 처리 실패:`, error.message);
            return null; // 부분 실패 격리
        }
    }

    // --- Public Methods ---

    return {
        build: function() {
            try {
                console.log('🔨 SuccessDB 구축 시작...');
                
                // 입력 검증
                const resultsBody = document.getElementById('results-body');
                if (!resultsBody) {
                    throw new Error('#results-body 요소를 찾을 수 없습니다');
                }

                const rows = resultsBody.querySelectorAll('tr');
                if (!rows || rows.length === 0) {
                    throw new Error('경기 데이터가 없습니다');
                }

                // 기존 데이터 초기화
                successRules = {};
                isReady = false;

                console.log(`📊 총 ${rows.length}개의 경기 데이터 분석 중...`);

                let processedCount = 0;
                let failureCount = 0;
                const failedRows = [];

                // 각 행 안전하게 처리
                rows.forEach((row, idx) => {
                    try {
                        const result = _processRowSafely(row, idx);
                        if (result) {
                            processedCount++;
                        }
                    } catch (err) {
                        failureCount++;
                        failedRows.push({ index: idx, error: err.message });
                        // 계속 진행 - 부분 실패 격리
                    }
                });

                isReady = true;
                _saveDB();

                // 결과 로깅
                console.log(`✅ SuccessDB 구축 완료:`);
                console.log(`   처리된 경기: ${processedCount}개`);
                console.log(`   발견된 성공 패턴: ${Object.keys(successRules).length}개`);
                console.log(`   실패한 행: ${failureCount}개`);
                
                if (failureCount > 0) {
                    console.warn(`⚠️ 실패한 행 샘플:`, failedRows.slice(0, 3));
                }

                return {
                    success: true,
                    processedCount,
                    failureCount,
                    patternCount: Object.keys(successRules).length,
                    successRules
                };
            } catch (error) {
                console.error('❌ SuccessDB 구축 실패:', error.message);
                isReady = false;
                return {
                    success: false,
                    error: error.message
                };
            }
        },

        verify: function(dataset) {
            try {
                if (!isReady) {
                    console.warn('⚠️ SuccessDB가 준비되지 않았습니다.');
                    return null;
                }

                if (!dataset) {
                    console.warn('⚠️ dataset이 null/undefined');
                    return null;
                }

                const parsed = _parseRowDataWithSuccessCheck(dataset);
                if (!parsed || !parsed.isSuccess) {
                    return null;
                }

                const patterns = _classifySuccessPatterns(parsed);
                if (patterns.length === 0) {
                    return null;
                }

                return `✅ Success Pattern: ${patterns.join(', ')}`;
            } catch (error) {
                console.error('❌ SuccessDB.verify 오류:', error.message);
                return null; // 안전한 기본값
            }
        },

        getSuccessRules: function() {
            try {
                return { ...successRules };
            } catch (error) {
                console.error('❌ getSuccessRules 오류:', error.message);
                return {};
            }
        },

        isReady: function() {
            return isReady;
        }
    };
})();

// 초기화
console.log('✅ SuccessAnalyzer (v2) 로드 완료 - 예외 처리 강화됨');

// ✅ [신규] 초기 로드 시도
try {
    if (typeof successDB !== 'undefined' && successDB.isReady) {
        console.log('🔄 SuccessDB 초기화...');
        // 이미 로드되어 있음
    }
} catch (e) {
    console.warn('⚠️ SuccessDB 초기화 중 경고:', e.message);
}