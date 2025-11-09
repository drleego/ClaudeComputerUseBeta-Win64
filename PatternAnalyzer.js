/**
 * ==============================================
 * PatternAnalyzer.js (v5 - 예외 처리 강화)
 * 미적중 위험 패턴을 학습하고 검증하는 독립 모듈
 * 
 * [개선 v5] 예외 처리 강화
 * ✅ try-catch 블록 추가
 * ✅ 안전한 null 체크
 * ✅ 부분 실패 격리
 * ✅ 상세한 에러 로깅
 * ==============================================
 */

var patternDB = (function() {

    // [v4] DB 키 변경 (v3와 호환 안 됨, 재학습 필요)
    const DB_KEY = 'patternAnalyzerDB_v4';

    let warningRules = {}; 
    let isReady = false;   

    // --- Private localStorage Functions (v5 - 예외 처리 강화) ---
    
    function _saveDB() {
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(warningRules));
            console.log(`✅ PatternDB (v5): ${Object.keys(warningRules).length}개의 규칙을 localStorage에 저장했습니다.`);
        } catch (e) {
            console.error("❌ PatternDB (v5): localStorage 저장 실패.", e.message);
            console.error("   상세:", e);
        }
    }

    function _loadDB() {
        try {
            // [수정] 먼저 v4 DB 확인
            const storedDB = localStorage.getItem(DB_KEY);
            if (storedDB && storedDB !== '{}') {
                try {
                    warningRules = JSON.parse(storedDB);
                    isReady = true; 
                    console.log(`✅ PatternDB (v5): localStorage에서 ${Object.keys(warningRules).length}개의 규칙을 불러왔습니다.`);
                    return;
                } catch (parseErr) {
                    console.warn("⚠️ PatternDB (v5): 저장된 DB 파싱 실패", parseErr.message);
                    // 계속 진행
                }
            }
            
            // [수정] v4 DB가 없으면 'patterns' 데이터 확인
            const patternsData = localStorage.getItem('patterns');
            if (patternsData) {
                try {
                    const patterns = JSON.parse(patternsData);
                    if (Array.isArray(patterns) && patterns.length > 0) {
                        // patterns 배열을 warningRules로 변환
                        patterns.forEach(p => {
                            try {
                                if (p && p.status === 'miss') {
                                    warningRules[p.name] = {
                                        total: p.count || 0,
                                        misses: Math.round((p.count || 0) * (p.miss_rate || 0)),
                                        missRate: p.miss_rate || 0
                                    };
                                }
                            } catch (itemErr) {
                                console.warn(`⚠️ 패턴 아이템 변환 실패:`, p, itemErr.message);
                                // 계속 진행
                            }
                        });
                        if (Object.keys(warningRules).length > 0) {
                            isReady = true;
                            console.log(`✅ PatternDB (v5): 'patterns'에서 ${Object.keys(warningRules).length}개의 미적중 패턴을 복구했습니다.`);
                            return;
                        }
                    }
                } catch (e) {
                    console.warn("⚠️ PatternDB (v5): 'patterns' 데이터 파싱 실패", e.message);
                }
            }
            
            console.warn("⚠️ PatternDB (v5): 저장된 DB가 없습니다. [패턴 DB 구축] 버튼을 눌러 학습을 시작하세요.");
        } catch (e) {
            console.error("❌ PatternDB (v5): localStorage 로드 실패. DB가 손상되었을 수 있습니다.", e.message);
            try {
                localStorage.removeItem(DB_KEY); // 손상된 데이터 삭제
                console.log("🔧 손상된 DB 삭제 완료");
            } catch (removeErr) {
                console.warn("⚠️ DB 삭제 실패:", removeErr.message);
            }
        }
    }

    // --- Private Helper Functions (v5 - 예외 처리 강화) ---

    /**
     * ✅ [개선 v5] 안전한 데이터 파싱 (예외 처리)
     */
    function _parseRowDataWithMissCheck(dataset) {
        try {
            // 입력 검증
            if (!dataset) {
                console.warn('⚠️ dataset이 null/undefined');
                return null;
            }

            // 안전한 파싱 시도
            const data = DataParserUtil.parseRowData(dataset);
            
            if (!data) {
                console.warn('⚠️ parseRowData 실패:', dataset);
                return null;
            }

            if (data.actualResult === 'N/A') {
                return null;
            }

            // 안전한 계산
            try {
                const { isMiss } = DataParserUtil.calculateMissAndSuccess(
                    data.hybridPrediction,
                    data.actualResult
                );

                return { ...data, isMiss };
            } catch (calcErr) {
                console.error('❌ calculateMissAndSuccess 실패:', calcErr.message);
                console.error('   데이터:', data);
                // 부분 실패 격리 - 원본 데이터 반환
                return data;
            }
        } catch (error) {
            console.error('❌ _parseRowDataWithMissCheck 오류:', error.message);
            console.error('   데이터:', dataset);
            return null;
        }
    }

    /**
     * [v4 업그레이드] 'AI 탐정'이 발견한 위험 패턴을 기반으로 분류
     * @returns {Array<String>} 해당되는 패턴 이름 배열
     */
    function _classifyPatterns(data) {
        try {
            const patternsFound = [];
            
            if (!data) {
                console.warn('⚠️ _classifyPatterns: data가 null');
                return patternsFound;
            }

            const {
                hybridPrediction, hplPrediction, btPrediction, oslPrediction, regressionPrediction,
                handicapPrediction, upsetScoreDiff, ouPrediction, bttsPrediction,
                regHomeProb, regAwayProb, btHomeProb, btAwayProb
            } = data;

            // [수정] 예측이 모두 다른 경우 (합의 부재)
            const preds = new Set([hybridPrediction, hplPrediction, btPrediction, oslPrediction, regressionPrediction]);
            if (preds.size === 5) {
                patternsFound.push("PAT_A_ALL_PREDICT_DIFFERENT");
            }

            // [수정] 장애물 예측이 다른 경우
            if (handicapPrediction && handicapPrediction !== hybridPrediction) {
                patternsFound.push("PAT_B_HANDICAP_DIFFERENT");
            }

            // [수정] 스코어 불일치 가능성이 높은 경우
            if (upsetScoreDiff && upsetScoreDiff > 0.3) {
                patternsFound.push("PAT_C_HIGH_UPSET_SCORE_DIFF");
            }

            // [수정] 오버언더 vs 예측 불일치
            if (ouPrediction && ouPrediction !== hybridPrediction) {
                patternsFound.push("PAT_D_OU_PREDICTION_DIFFERENT");
            }

            // [수정] BTTS 패턴 불일치
            if (bttsPrediction && bttsPrediction !== hybridPrediction) {
                patternsFound.push("PAT_E_BTTS_DIFFERENT");
            }

            return patternsFound;
        } catch (error) {
            console.error('❌ _classifyPatterns 오류:', error.message);
            return []; // 안전한 기본값
        }
    }

    /**
     * ✅ [개선] 각 행 처리 (예외 격리)
     */
    function _processRow(row, rowIndex) {
        try {
            const parsed = _parseRowDataWithMissCheck(row);
            if (!parsed) return null;

            const patterns = _classifyPatterns(parsed);
            if (patterns.length === 0) return null;

            // 각 패턴 카운트
            patterns.forEach(patternName => {
                try {
                    if (!warningRules[patternName]) {
                        warningRules[patternName] = { count: 0, details: [] };
                    }
                    warningRules[patternName].count = (warningRules[patternName].count || 0) + 1;
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
                console.log('🔨 PatternDB 구축 시작...');
                
                // 기존 데이터 초기화
                warningRules = {};
                isReady = false;

                // 테이블에서 모든 행 추출
                const resultsBody = document.getElementById('results-body');
                if (!resultsBody) {
                    throw new Error('#results-body 요소를 찾을 수 없습니다');
                }

                const rows = resultsBody.querySelectorAll('tr');
                console.log(`📊 총 ${rows.length}개의 경기 데이터 분석 중...`);

                let processedCount = 0;
                let failureCount = 0;
                const failedRows = [];

                // 각 행 안전하게 처리
                rows.forEach((row, idx) => {
                    try {
                        const result = _processRow(row, idx);
                        if (result) {
                            processedCount++;
                        }
                    } catch (err) {
                        failureCount++;
                        failedRows.push({ index: idx, error: err.message });
                        // 계속 진행
                    }
                });

                isReady = true;
                _saveDB();

                // 결과 로깅
                console.log(`✅ PatternDB 구축 완료:`);
                console.log(`   처리된 경기: ${processedCount}개`);
                console.log(`   발견된 패턴: ${Object.keys(warningRules).length}개`);
                console.log(`   실패한 행: ${failureCount}개`);
                
                if (failureCount > 0) {
                    console.warn(`⚠️ 실패한 행 샘플:`, failedRows.slice(0, 3));
                }

                return {
                    success: true,
                    processedCount,
                    failureCount,
                    patternCount: Object.keys(warningRules).length,
                    warningRules
                };
            } catch (error) {
                console.error('❌ PatternDB 구축 실패:', error.message);
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
                    console.warn('⚠️ PatternDB가 준비되지 않았습니다. 먼저 [패턴 DB 구축]을 실행하세요.');
                    return null;
                }

                if (!dataset) {
                    console.warn('⚠️ dataset이 null/undefined');
                    return null;
                }

                const parsed = _parseRowDataWithMissCheck(dataset);
                if (!parsed) {
                    return null;
                }

                const patterns = _classifyPatterns(parsed);
                if (patterns.length === 0) {
                    return null;
                }

                return `⚠️ Pattern Warning: ${patterns.join(', ')}`;
            } catch (error) {
                console.error('❌ PatternDB.verify 오류:', error.message);
                return null; // 안전한 기본값
            }
        },

        getWarningRules: function() {
            try {
                return { ...warningRules };
            } catch (error) {
                console.error('❌ getWarningRules 오류:', error.message);
                return {};
            }
        },

        isReady: function() {
            return isReady;
        }
    };
})();

// 초기화
console.log('✅ PatternAnalyzer (v5) 로드 완료 - 예외 처리 강화됨');

// ✅ [신규] 초기 로드 시도
try {
    if (typeof patternDB !== 'undefined' && patternDB.isReady) {
        console.log('🔄 PatternDB 초기화...');
        // 이미 로드되어 있음
    }
} catch (e) {
    console.warn('⚠️ PatternDB 초기화 중 경고:', e.message);
}