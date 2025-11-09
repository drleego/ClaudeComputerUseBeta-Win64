/**
 * ========================================
 * 축구 AI 예측 앱 - 통합 수정 버전
 * ========================================
 * 
 * 수정 내용:
 * 1. showMessage() 함수 추가
 * 2. 데이터 검증 함수 추가
 * 3. 에러 처리 강화
 * 4. API 호출 개선
 * 5. 글로벌 에러 핸들러 추가
 * 
 * 원본 코드는 모두 유지되며, 추가 코드만 삽입됨
 * ========================================
 */

// ========================================
// 🔧 추가 수정 코드 (원본 app_logic.js 앞에 삽입)
// ========================================

// ====== 1. 글로벌 메시지 함수 ======
/**
 * 사용자에게 알림 메시지를 표시합니다
 * @param {string} message - 표시할 메시지
 * @param {string} type - 'error', 'success', 'warning', 'info'
 * @param {number} duration - 자동 숨김 시간(밀리초, 0=비활성)
 */
function showMessage(message, type = 'error', duration = 6000) {
    const messageBox = document.getElementById('message-box');
    
    if (!messageBox) {
        console.warn('[showMessage] #message-box 요소를 찾을 수 없습니다');
        alert(message); // 대체용
        return;
    }
    
    messageBox.innerHTML = message;
    messageBox.className = `message message-${type}`;
    messageBox.style.display = 'block';
    messageBox.style.visibility = 'visible';
    messageBox.style.opacity = '1';
    
    if (duration > 0) {
        setTimeout(() => {
            messageBox.style.display = 'none';
        }, duration);
    }
}

console.log('[AppInit] showMessage 함수 로드됨');

// ====== 2. 데이터 검증 함수들 ======

/**
 * 결과 형식이 "X-Y"인지 확인 (예: "2-1")
 */
function isValidResultFormat(result) {
    if (!result || typeof result !== 'string') return false;
    const parts = result.split('-').map(s => s.trim());
    if (parts.length !== 2) return false;
    const [home, away] = parts;
    return !isNaN(parseInt(home)) && !isNaN(parseInt(away));
}

/**
 * 결과 문자열을 객체로 변환
 */
function parseResult(resultString) {
    if (!isValidResultFormat(resultString)) return null;
    const [home, away] = resultString.split('-').map(Number);
    let outcome = '무';
    if (home > away) outcome = '홈 승';
    else if (home < away) outcome = '원정 승';
    return { home, away, outcome, total: home + away };
}

/**
 * 팀 이름이 유효한지 확인
 */
function isValidTeamName(name) {
    return name && typeof name === 'string' && name.trim().length > 0;
}

/**
 * 경기 행이 필요한 모든 데이터를 가지고 있는지 확인
 */
function isValidFixtureRow(row) {
    return row &&
           row.dataset.fixtureId &&
           isValidTeamName(row.dataset.homeTeam) &&
           isValidTeamName(row.dataset.awayTeam) &&
           isValidResultFormat(row.dataset.finalResult);
}

/**
 * 전체 테이블 데이터 검증
 */
function validateTableData() {
    const resultsBody = document.getElementById('results-body');
    const issues = [];
    
    if (!resultsBody) {
        return { 
            valid: false, 
            error: '테이블을 찾을 수 없습니다', 
            issues: ['#results-body 없음'] 
        };
    }
    
    const rows = resultsBody.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        if (!row.dataset.fixtureId) issues.push(`행 ${idx+1}: ID 없음`);
        if (!isValidTeamName(row.dataset.homeTeam)) issues.push(`행 ${idx+1}: 홈팀 잘못됨`);
        if (!isValidTeamName(row.dataset.awayTeam)) issues.push(`행 ${idx+1}: 원정팀 잘못됨`);
        if (!isValidResultFormat(row.dataset.finalResult)) issues.push(`행 ${idx+1}: 결과 형식 잘못됨`);
    });
    
    return {
        valid: issues.length === 0,
        total: rows.length,
        valid_count: rows.length - issues.length,
        issues: issues
    };
}

console.log('[AppInit] 검증 함수들 로드됨');

// ====== 3. 글로벌 에러 핸들러 ======

/**
 * 처리되지 않은 에러를 감시합니다
 */
window.addEventListener('error', (event) => {
    console.error('[Global Error Handler]', event.error);
    if (typeof showMessage === 'function') {
        showMessage(`시스템 에러: ${event.error?.message || '알 수 없는 오류'}`, 'error');
    }
});

/**
 * 처리되지 않은 Promise 거부를 감시합니다
 */
window.addEventListener('unhandledrejection', (event) => {
    console.error('[Unhandled Promise Rejection]', event.reason);
    if (typeof showMessage === 'function') {
        showMessage(`요청 실패: ${event.reason?.message || '알 수 없는 오류'}`, 'error');
    }
});

console.log('[AppInit] 글로벌 에러 핸들러 설정 완료');

// ========================================
// 🔥 이하 원본 app_logic.js 코드 (모두 유지)
// ========================================

// ===================================================================================
// ===== CORE SCRIPT (DOM, Calculations, UI Updates) =====
// ===================================================================================

// [Phase 5] API 인증 토큰 및 URL 정의 (api-sports.io 기준으로 변경)
const API_TOKEN = '0d09086e96b498fb7a496ba4e0c0a8b4';
const API_BASE_URL = 'https://v3.football.api-sports.io';
const DEFAULT_HEADERS = { 
    'x-apisports-key': API_TOKEN
};

// ★★★ [수정] 시즌 변수를 전역 상수로 정의하여 모든 함수에서 접근 가능하게 함 ★★★
const CURRENT_SEASON = 2025; // (2025-2026 시즌을 가정)

// [Phase 1] 재훈련을 위한 학습 데이터를 수집할 전역 배열
// ★★★ [수정 v1] trainingDataExport 구조 명확화 ★★★
// 구조: { id, leagueName, homeName, awayName, features, predictions, finalPrediction, finalResult, isCorrect, timestamp, modelVersion }
let trainingDataExport = [];
let allLeaguesData = {}; // API에서 가져온 모든 리그 데이터(팀, 스탠딩) 저장
let competitionMap = {}; // 리그 ID와 코드 매핑 (e.g., 39: 'Premier League')
let manualFixtures = []; // ★★★ [신규] 수동 입력된 경기 정보를 저장할 배열 ★★★

// [Phase 5] API 호출 비동기 함수 (에러 및 재시도 처리 포함)
async function fetchData(endpoint) {
    const url = `${API_BASE_URL}${endpoint}`;
    // api-sports.io는 1분 10회 제한 (즉, 6초당 1회)
    // 3회 재시도로 설정 (약 30초 이상 소요될 수 있음)
    const MAX_RETRIES = 3; 
    let lastError = null;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(url, { headers: DEFAULT_HEADERS });

            // api-sports.io는 429 대신 400 또는 500 에러 코드에 "rate limit" 메시지를 포함할 수 있음
            if (response.status === 429 || response.status === 400 || response.status === 500) {
                let errorBody;
                try {
                    // 응답이 JSON 형식일 경우를 대비
                    errorBody = await response.json();
                } catch(e) {
                    // JSON이 아닐 경우 텍스트로 읽기
                    errorBody = await response.text();
                }

                const errorMessage = JSON.stringify(errorBody);
                
                // "rate limit" 또는 "RateLimit" (대소문자 무관) 포함 시
                if (errorMessage.includes("rate limit") || errorMessage.includes("RateLimit") || errorMessage.includes("requests limit")) {
                    const retryAfter = response.headers.get('Retry-After') || 10; // 10초 대기
                    console.warn(`Rate limit hit. Retrying after ${retryAfter} seconds... (Attempt ${i + 1})`);
                    
                    // 지수 백오프 대신, API가 지정한 Retry-After 시간 또는 최소 10초 대기
                    await new Promise(resolve => setTimeout(resolve, Math.max(10, parseInt(retryAfter)) * 1000));
                    lastError = new Error(`Rate Limit Exceeded. Retrying... (Attempt ${i + 1})`);
                    continue; 
                }
            }
            
            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`API Error ${response.status} for ${endpoint}: ${errorBody.substring(0, 100)}`);
            }
            return await response.json();

        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed for ${url}:`, error);
            lastError = error;
            if (i < MAX_RETRIES - 1) {
                // Exponential Backoff (1s, 2s, 4s)
                const delay = Math.pow(2, i) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    // 모든 재시도 실패 시 에러 throw
    throw new Error(`API call failed after ${MAX_RETRIES} attempts. Last error: ${lastError.message}`);
}

// [Phase 5] 로딩 오버레이 제어 함수
function showLoadingOverlay(show, message = "API에서 데이터 로드 중...") {
    const overlay = document.getElementById('loading-overlay');
    const mainContent = document.getElementById('main-content');
    
    // ✅ 요소가 없으면 스킵
    if (!overlay || !mainContent) {
        console.log('[showLoadingOverlay] 요소 없음 - 스킵');
        return;
    }
    
    if (show) {
        overlay.querySelector('p:first-of-type').textContent = message;
        overlay.style.opacity = '1';
        overlay.style.display = 'flex';
        mainContent.style.opacity = '0';
    } else {
        overlay.style.opacity = '0';
        setTimeout(() => { 
            overlay.style.display = 'none';
            mainContent.style.opacity = '1';
        }, 500);
    }
}

// [신규] 팀 이름으로 팀 ID 가져오기 헬퍼 함수
function getTeamId(leagueName, teamName) {
    const leagueData = allLeaguesData[leagueName];
    if (!leagueData || !leagueData.teams) {
        return null;
    }
    
    const team = leagueData.teams.find(t => t.name === teamName);
    return team ? team.id : null;
}

// [신규] 배당 정보를 가져와 자동 입력하는 함수
async function fetchAndFillOdds(leagueName, homeTeamName, awayTeamName) {
    const homeOddsInput = document.getElementById('home-odds');
    const drawOddsInput = document.getElementById('draw-odds');
    const awayOddsInput = document.getElementById('away-odds');
    
    try {
        // 배당 입력 필드에 로딩 표시
        const originalHomeValue = homeOddsInput.value;
        const originalDrawValue = drawOddsInput.value;
        const originalAwayValue = awayOddsInput.value;
        
        homeOddsInput.value = '...';
        drawOddsInput.value = '...';
        awayOddsInput.value = '...';
        homeOddsInput.disabled = true;
        drawOddsInput.disabled = true;
        awayOddsInput.disabled = true;
        
        // 1. 리그 ID 가져오기
        const leagueId = competitionMap[leagueName];
        if (!leagueId) {
            throw new Error(`리그 ID를 찾을 수 없습니다: ${leagueName}`);
        }
        
        // 2. 홈팀 ID 가져오기
        const homeTeamId = getTeamId(leagueName, homeTeamName);
        if (!homeTeamId) {
            throw new Error(`팀 ID를 찾을 수 없습니다: ${homeTeamName}`);
        }
        
        // 3. 해당 리그의 현재 시즌 경기 목록 가져오기 (홈팀 기준)
        const fixturesEndpoint = `/fixtures?league=${leagueId}&season=${CURRENT_SEASON}&team=${homeTeamId}`;
        const fixturesData = await fetchData(fixturesEndpoint);
        
        if (!fixturesData || !fixturesData.response || fixturesData.response.length === 0) {
            throw new Error('해당 팀의 경기를 찾을 수 없습니다.');
        }
        
        // 4. 선택한 두 팀이 맞대결하는 경기 찾기 (아직 시작하지 않은 경기 우선)
        const targetFixture = fixturesData.response.find(fixture => {
            const homeTeam = fixture.teams.home.name;
            const awayTeam = fixture.teams.away.name;
            const status = fixture.fixture.status.short;
            
            // NS (Not Started), TBD (To Be Determined), 또는 PST (Postponed) 상태의 경기
            const isUpcoming = ['NS', 'TBD', 'PST'].includes(status);
            
            return (homeTeam === homeTeamName && awayTeam === awayTeamName && isUpcoming);
        });
        
        if (!targetFixture) {
            throw new Error(`${homeTeamName} vs ${awayTeamName}의 예정된 경기를 찾을 수 없습니다.`);
        }
        
        const fixtureId = targetFixture.fixture.id;
        console.log(`경기 ID ${fixtureId}의 배당 정보를 가져오는 중...`);
        
        // 5. Odds API 호출 (bet=1은 Match Winner)
        // 여러 북메이커를 시도하여 배당 정보 가져오기
        const bookmakers = [6, 8, 5, 11, 1, 3]; // Bet365, Betway, William Hill, 888sport, 1xBet, Pinnacle 등
        let oddsFound = false;
        
        for (const bookmakerId of bookmakers) {
            try {
                // bookmaker 파라미터 없이 전체 배당 가져오기 (더 안정적)
                const oddsEndpoint = `/odds?fixture=${fixtureId}&bet=1`;
                const oddsData = await fetchData(oddsEndpoint);
                
                if (oddsData && oddsData.response && oddsData.response.length > 0) {
                    const matchOdds = oddsData.response[0];
                    
                    // bookmakers 배열에서 배당 정보 추출
                    if (matchOdds.bookmakers && matchOdds.bookmakers.length > 0) {
                        // 원하는 북메이커를 찾거나 첫 번째 북메이커 사용
                        let bookmaker = matchOdds.bookmakers.find(b => b.id === bookmakerId);
                        if (!bookmaker) {
                            bookmaker = matchOdds.bookmakers[0]; // 첫 번째 북메이커 사용
                        }
                        
                        const bets = bookmaker.bets;
                        
                        // bet_id=1은 Match Winner (홈/무승부/원정)
                        const matchWinnerBet = bets.find(bet => bet.id === 1);
                        
                        if (matchWinnerBet && matchWinnerBet.values) {
                            const homeOdds = matchWinnerBet.values.find(v => v.value === 'Home')?.odd;
                            const drawOdds = matchWinnerBet.values.find(v => v.value === 'Draw')?.odd;
                            const awayOdds = matchWinnerBet.values.find(v => v.value === 'Away')?.odd;
                            
                            if (homeOdds && drawOdds && awayOdds) {
                                homeOddsInput.value = homeOdds;
                                drawOddsInput.value = drawOdds;
                                awayOddsInput.value = awayOdds;
                                
                                oddsFound = true;
                                showMessage(`배당이 자동으로 입력되었습니다. (출처: ${bookmaker.name})`, 'success');
                                console.log(`배당 정보: 홈=${homeOdds}, 무=${drawOdds}, 원정=${awayOdds}`);
                                break;
                            }
                        }
                    }
                }
                
                // 첫 번째 시도에서 찾았으면 중단
                if (oddsFound) break;
                
            } catch (e) {
                console.warn(`배당 정보를 가져오는 중 오류 발생:`, e);
                // 계속 진행 (오류 메시지는 마지막에 표시)
            }
            
            // API 속도 제한 준수 (다음 북메이커 시도 전 대기)
            if (!oddsFound) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        if (!oddsFound) {
            // 원래 값 복원
            homeOddsInput.value = originalHomeValue;
            drawOddsInput.value = originalDrawValue;
            awayOddsInput.value = originalAwayValue;
            throw new Error('배당 정보를 찾을 수 없습니다. 수동으로 입력해주세요.');
        }
        
    } catch (error) {
        console.error('배당 자동 입력 실패:', error);
        showMessage(`배당 자동 입력 실패: ${error.message}`, 'warning');
        
        // 입력 필드 초기화 (사용자가 수동으로 입력할 수 있도록)
        homeOddsInput.value = '';
        drawOddsInput.value = '';
        awayOddsInput.value = '';
    } finally {
        // 입력 필드 활성화
        homeOddsInput.disabled = false;
        drawOddsInput.disabled = false;
        awayOddsInput.disabled = false;
    }
}

// [Phase 5] 애플리케이션 초기화 (api-sports.io 기준으로 변경)
async function initApp() {
    showLoadingOverlay(true, "주요 리그 목록 로드 중...");

    const leagueSelect = document.getElementById('league-select');

    // ✅ [신규] 요소가 없으면 조기 리턴
    if (!leagueSelect) {
        console.warn('[initApp] league-select 요소가 없어 초기화를 건너뜁니다.');
        showLoadingOverlay(false);
        return;
    }

    leagueSelect.innerHTML = '<option value="" disabled selected>리그 선택</option>';
    
    // ★★★ [수정] 주요 리그 ID (api-sports.io 기준) ★★★
    // 국내리그: PL:39, Championship:40, LaLiga:140, SerieA:135, Bundesliga:78, Ligue1:61, Eredivisie:88 | 유럽컵: UCL:2, UEL:3 | 아시아: AFC:419 | 한국: K1:292, K2:293 | 일본: J1:98, J2:99
    const MAJOR_LEAGUE_IDS = [2, 3, 39, 40, 140, 135, 78, 61, 88, 419, 292, 293, 98, 99];

    allLeaguesData = {};
    competitionMap = {};

    try {
        // 1. 각 주요 리그의 상세 데이터(팀, 순위) 순차적(Sequential) 로드
        for (const compId of MAJOR_LEAGUE_IDS) {
            
            showLoadingOverlay(true, `리그 ID ${compId} 순위 데이터 로드 중...`);
            try {
                // Competition ID와 Season을 기반으로 순위 가져오기 (api-sports.io 엔드포인트)
                const standingsResponse = await fetchData(`/standings?league=${compId}&season=${CURRENT_SEASON}`);
                
                if (!standingsResponse.response || standingsResponse.response.length === 0) {
                    throw new Error(`No standings data returned for league ID ${compId} and season ${CURRENT_SEASON}.`);
                }

                // api-sports.io는 응답 [0]에 리그 정보를 포함
                const leagueData = standingsResponse.response[0].league;
                const compName = leagueData.name;
                
                // 이미 로드된 데이터인지 확인 (이론상 중복 ID가 없으므로 불필요하지만 안전장치)
                if (allLeaguesData[compName]) continue;

                // 순위 데이터를 팀 목록으로 변환 및 기본 스탯 초기화
                const teams = [];
                let leagueAvgXGTotal = 1.5; // 임시 기본값 (api-sports.io는 xG를 제공하지 않음)

                if (leagueData.standings && leagueData.standings.length > 0) {
                    // leagueData.standings[0]은 리그의 메인 순위 테이블(배열)
                    leagueData.standings[0].forEach(row => {
                         const teamName = row.team.name;
                         
                         // ★★★ [수정된 로직] api-sports.io Standing Row에서 안전하게 데이터 추출 ★★★
                         const playedGamesTotal = row.all.played;
                         const pointsTotal = row.points;
                         const formL5 = row.form || "";
                         
                         // 홈/원정 데이터 (null 체크 추가)
                         const homeStats = row.home || { played: 0, points: 0, goals: { for: 0, against: 0 } };
                         const awayStats = row.away || { played: 0, points: 0, goals: { for: 0, against: 0 } };
                         
                         const ppgTotal = playedGamesTotal > 0 ? pointsTotal / playedGamesTotal : 0;
                         
                         // ★★★ [수정] 홈/어웨이 PPG 계산 시, 경기가 0이면 전체 PPG를 사용하지 않고 0으로 설정 (더 정확한 초기값) ★★★
                         const homePpgCalc = homeStats.played > 0 ? homeStats.points / homeStats.played : 0;
                         const awayPpgCalc = awayStats.played > 0 ? awayStats.points / awayStats.played : 0;
                         
                         const initialTeamData = {
                             name: teamName,
                             id: row.team.id,
                             ppg: ppgTotal, // API 제공 TOTAL PPG
                             gf: row.all.goals.for,
                             ga: row.all.goals.against,
                             form_l5: formL5, // API 제공 Form
                             elo: 1500 + pointsTotal * 5, // 임시 ELO 계산 (포인트 기반)
                             prevPpg: [ppgTotal],
                             
                             // 커스텀 모델에 필요한 통계 (로컬에서 임시 초기화)
                             latentAttack: 0, latentDefense: 0, drawPercent: 25,
                             homePpg: homePpgCalc, // 홈 경기 PPG
                             awayPpg: awayPpgCalc, // 원정 경기 PPG
                             
                             // xG 통계는 없으므로 임시로 PPG를 기반으로 설정 (평균 득점/실점 사용)
                             // [수정] 0 나누기 방지
                             xg_for_home: homeStats.played > 0 ? homeStats.goals.for / homeStats.played : 1.5,
                             xg_against_home: homeStats.played > 0 ? homeStats.goals.against / homeStats.played : 1.5,
                             xg_for_away: awayStats.played > 0 ? awayStats.goals.for / awayStats.played : 1.5, 
                             xg_against_away: awayStats.played > 0 ? awayStats.goals.against / awayStats.played : 1.5,
                             
                             // O/U, BTTS에 필요한 추가 통계 (로컬 기본값)
                             clean_sheet_pct_home: 0.3, clean_sheet_pct_away: 0.3,
                             failed_to_score_pct_home: 0.3, failed_to_score_pct_away: 0.3,
                             btts_pct_home: 0.5, btts_pct_away: 0.5,
                             over_2_5_pct_home: 0.5, over_2_5_pct_away: 0.5
                         };
                         teams.push(initialTeamData);
                    });
                }

                // 리그 컨텍스트 설정
                const leagueContext = {
                    id: compId,
                    code: leagueData.country.code, // api-sports.io는 리그 코드가 아닌 국가 코드를 제공
                    drawRate: 0.25, // 임시
                    avgGoalsHome: 1.5, // 임시
                    avgGoalsAway: 1.2, // 임시
                    currentMatchesPlayed: teams.length > 0 ? leagueData.standings[0].reduce((sum, row) => sum + row.all.played, 0) / teams.length : 0,
                    league_avg_xg_total: leagueAvgXGTotal, 
                };

                allLeaguesData[compName] = { 
                    teams: teams, 
                    leagueContext: leagueContext 
                };
                competitionMap[compId] = compName; // ID -> 이름 맵핑
                competitionMap[compName] = compId; // 이름 -> ID 맵핑

                leagueSelect.add(new Option(compName, compName));

            } catch (e) {
                console.error(`Error loading standings for League ID ${compId}:`, e);
                // 개별 리그 로드 실패는 앱을 중단시키지 않지만, 메시지를 표시합니다.
                showMessage(`리그 ID ${compId}의 데이터를 로드하지 못했습니다. (API 오류)`, 'warning');
            }
            
            // ★★★ [수정] API 속도 제한 준수를 위한 강제 지연 (1000ms) ★★★
            // 10개 리그 로드 시 약 10초 소요 (1분 10회 제한 준수)
            await new Promise(resolve => setTimeout(resolve, 1000));
        } // End of for...of loop (Sequential loading)
        
        // 기타 리그 옵션 추가 (수동 입력용)
        leagueSelect.add(new Option('기타 리그 (직접 입력)', 'other'));

        // 초기 선택값 설정
        if (leagueSelect.options.length > 1) {
            // API 로드된 첫 번째 리그를 기본값으로 설정
            leagueSelect.value = leagueSelect.options[1].value; 
            leagueSelect.dispatchEvent(new Event('change'));
        }

    } catch (e) {
        console.error("Critical API initialization error:", e);
        showMessage(`API 초기화 실패: ${e.message}. 리그 목록을 로드하지 못했습니다. (토큰 확인 필요)`, 'error');
        // 실패 시 '기타 리그'만이라도 표시되도록 합니다.
        if (leagueSelect.options.length === 0) {
             leagueSelect.add(new Option('기타 리그 (직접 입력)', 'other'));
        }
    } finally {
        showLoadingOverlay(false);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // ✅ [신규] 필수 요소 체크 - 없으면 조기 리턴
    const requiredElements = ['league-select', 'results-body', 'summary-grid'];
    const missingElements = requiredElements.filter(id => !document.getElementById(id));

    if (missingElements.length > 0) {
        console.info('[app_logic.js] 일부 필수 요소가 없어 초기화를 건너뜁니다:', missingElements);
        console.info('[app_logic.js] 이 페이지는 app_logic.js의 전체 기능을 사용하지 않는 것으로 보입니다.');
        return; // 조기 리턴
    }

    // --- Element Selectors ---
    const leagueSelect = document.getElementById('league-select');
    const homeTeamSelect = document.getElementById('home-team-select');
    const awayTeamSelect = document.getElementById('away-team-select');
    const homeTeamInput = document.getElementById('home-team-input');
    const awayTeamInput = document.getElementById('away-team-input');
    const homePpgInput = document.getElementById('home-ppg');
    const awayPpgInput = document.getElementById('away-ppg');
    const homeEloInput = document.getElementById('home-elo');
    const awayEloInput = document.getElementById('away-elo');
    const homeFormInput = document.getElementById('home-form');
    const awayFormInput = document.getElementById('away-form');
    const addResultBtn = document.getElementById('add-result');
    const clearInputsBtn = document.getElementById('clear-inputs');
    const resultsBody = document.getElementById('results-body');
    const sortBtn = document.getElementById('sort-by-score-btn');
    const summaryGrid = document.getElementById('summary-grid');
    const messageBox = document.getElementById('message-box');
    const resultModal = document.getElementById('resultModal');
    const closeResultModalBtn = document.getElementById('close-result-modal');
    const resultForm = document.getElementById('result-form');
    const fixtureList = document.getElementById('fixture-list');
    const modelPerformanceSummary = document.getElementById('model-performance-summary');
    const fuzzyTrainingStatus = document.getElementById('fuzzy-training-status');
    const saveResultsBtn = document.getElementById('save-results-btn');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    // ## MODIFIED ##: Synergy Table Elements
    const synergyBody = document.getElementById('synergy-body');
    const synergyHeaderRow = document.getElementById('synergy-header-row');
    // [Phase 1] 학습 데이터 다운로드 버튼 (신규 추가)
    const exportDataBtn = document.getElementById('export-data-btn');

    // --- Recommended Picks Elements ---
    const recommendHomeWinBtn = document.getElementById('recommend-home-win');
    const recommendDrawBtn = document.getElementById('recommend-draw');
    const recommendAwayWinBtn = document.getElementById('recommend-away-win');
    const recommendedPicksBody = document.getElementById('recommended-picks-body');

    // --- Backtesting Elements ---
    const backtestLeagueSelect = document.getElementById('backtest-league-select');
    const backtestAllCheckbox = document.getElementById('backtest-all-checkbox');
    const backtestSpinner = document.getElementById('backtest-spinner');

    // [신규] 편향 리포트 컨테이너가 없으면 생성 (modelPerformanceSummary 아래)
    (function ensureBiasReportContainer(){
        try{
            const containerId = 'bias-report';
            if(!document.getElementById(containerId)){
                const div = document.createElement('div');
                div.id = containerId;
                div.style.marginTop = '8px';
                const anchor = modelPerformanceSummary || messageBox || summaryGrid;
                if (anchor && anchor.parentNode) {
                    anchor.parentNode.insertBefore(div, anchor.nextSibling);
                } else {
                    document.body.appendChild(div);
                }
            }
        }catch(e){ console.warn('ensureBiasReportContainer error:', e); }
    })();

    // --- State Variables ---
    let currentRowToUpdate = null;
    let parsedFixtures = {}; // API Match Data (for Backtesting)
    let teamUpsetStats = {};
    let backtestingData = {}; // Team data that gets updated during backtesting
    let fuzzyCoefficients = null; // To store trained fuzzy regression coefficients

    // [Phase 5] API에서 데이터 로드 후 앱 초기화 시작
    initApp().then(() => {
        // API 로드 및 드롭다운 채우기가 완료된 후, 초기 모델 훈련 시작
        try {
            // 초기 훈련은 데이터가 없을 수 있으므로 try...catch로 감쌉니다.
            trainFuzzyRegression(true);
        } catch (e) {
            console.error("Error during initial fuzzy training:", e);
        renderBiasReport();
        }
    });

    // --- Onload Data Hydration (Removed old hardcoded data loading) ---
    // 기존에 localStorage나 window.savedAnalysisData 로드하는 로직은 API 연동 후로 이동하거나 삭제합니다.
    if (window.savedAnalysisData && Array.isArray(window.savedAnalysisData)) {
         try {
             window.savedAnalysisData.forEach(data => addAnalysisRow(data));
         } catch (e) {
             console.error("Error loading saved data:", e);
             showMessage("Failed to load saved data.", "error");
         }
    }


     // --- Tab Functionality ---
    window.openTab = (evt, tabName) => {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
        document.getElementById(tabName).classList.add('active');
        evt.currentTarget.classList.add('active');
        // ## MODIFIED ##: Recalculate synergy/accuracy table when auto-analysis tab is opened
        if (tabName === 'auto-analysis' || tabName === 'main-analysis') { // Also update when main analysis tab is clicked
            updateSynergyAnalysis();
        }
        // [Phase 5] 백테스팅 탭이 열리면 백테스팅 리그 목록을 새로고침
        if (tabName === 'auto-analysis') {
            populateBacktestLeagues();
        }
    }

    // --- Calculation Functions ---
    const calculateOSL = (homePPG, awayPPG, homePoints, awayPoints) => {
        const diff = (Math.abs(homePPG - homePoints) + Math.abs(awayPPG - awayPoints)) / 2;
        return (diff / 3) * 100;
    };
    // Kept for consistency, although only coreScore uses OSL
    const getOslAnalysis = (homePPG, awayPPG, osls) => {
        const oslValues = [
            { outcome: '홈 승', value: osls.homeOsl },
            { outcome: '무승부', value: osls.drawOsl },
            { outcome: '원정 승', value: osls.awayOsl }
        ].sort((a,b) => a.value - b.value);
        const secondMinOsl = oslValues[1].value;
        const minOsl = oslValues[0].value;
        const deviation = secondMinOsl - minOsl;
        return { deviation };
    };
    const calculateCoreScore = (osl, odds) => {
        if (!odds || odds < 1.0) return 0;
        return (100 / (osl + 1)) * (1 / odds);
    };
    const factorial = (n) => { if (n < 0) return Infinity; if (n === 0 || n === 1) return 1; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
    const poissonProbability = (k, lambda) => (Math.pow(lambda, k) * Math.exp(-lambda)) / factorial(k);

    // ==================================================================
    // [전략 2.1단계 적용] HPL (Hierarchical Poisson Log-linear) Model
    // 'latent' 값 대신 'xG' 데이터를 사용하도록 전면 개편
    // ==================================================================
    const getPoissonAnalysis = (homeTeam, awayTeam, leagueContext) => {
        // 리그 평균 xG 값 (기본값 1.5)
        const league_avg_xg = leagueContext?.league_avg_xg_total || 1.5;

        // xG 데이터가 API에서 제공되지 않으므로, 로컬에서 초기화된 기본값 사용
        // API 연동 시 xG 통계는 1.5로 초기화되지만, 향후 외부 데이터로 대체 가능
        const home_xg_for = homeTeam.xg_for_home || 1.5;
        const home_xg_against = homeTeam.xg_against_home || 1.5;
        const away_xg_for = awayTeam.xg_for_away || 1.5;
        const away_xg_against = awayTeam.xg_against_away || 1.5;

        // 전략 문서 2.1단계의 새로운 Lambda 계산 로직 적용
        const homeLambda = (home_xg_for * away_xg_against) / league_avg_xg;
        const awayLambda = (away_xg_for * home_xg_against) / league_avg_xg;

        let homeWinProb = 0, drawProb = 0, awayWinProb = 0;
        // 최대 7골까지 계산 (성능을 위해)
        for (let i = 0; i <= 7; i++) {
            for (let j = 0; j <= 7; j++) {
                const prob = poissonProbability(i, homeLambda) * poissonProbability(j, awayLambda);
                if (i > j) homeWinProb += prob; else if (i === j) drawProb += prob; else awayWinProb += prob;
            }
        }
        const totalProb = homeWinProb + drawProb + awayWinProb;
        if (totalProb > 0) {
            homeWinProb = (homeWinProb / totalProb) * 100;
            drawProb = (drawProb / totalProb) * 100;
            awayWinProb = (awayWinProb / totalProb) * 100;
        }

        let primaryPrediction = 'N/A';
        const maxOutcomeProb = Math.max(homeWinProb, drawProb, awayWinProb);
        if (maxOutcomeProb > 0) {
            if (homeWinProb === maxOutcomeProb) primaryPrediction = '홈 승';
            else if (drawProb === maxOutcomeProb) primaryPrediction = '무승부';
            else primaryPrediction = '원정 승';
        }

        // [전략 3단계]를 위해 계산된 Lambda 값을 반환
        return { homeWinProb, drawProb, awayWinProb, primaryPrediction, homeLambda, awayLambda };
    };

    // ==================================================================
    // [전략 3단계 신규 기능] Over/Under 2.5 예측
    // xG 푸아송 모델의 Lambda 값을 사용
    // ==================================================================
    const calculateOverUnder = (homeLambda, awayLambda) => {
        // 두 팀의 기대 득점 합계를 기반으로 총 골 기대값(totalLambda) 계산
        const totalLambda = homeLambda + awayLambda;

        // 푸아송 분포를 사용하여 0, 1, 2골이 나올 확률 계산
        const p0 = poissonProbability(0, totalLambda);
        const p1 = poissonProbability(1, totalLambda);
        const p2 = poissonProbability(2, totalLambda);

        // P(Under 2.5) = P(0) + P(1) + P(2)
        const probUnder2_5 = p0 + p1 + p2;
        const probOver2_5 = 1 - probUnder2_5;

        return {
            over_2_5_prob: probOver2_5 * 100,
            under_2_5_prob: probUnder2_5 * 100
        };
    };
    // ==================================================================
    // [전략 3단계 신규 기능] BTTS (Both Teams To Score) 예측
    // xG 푸아송 모델의 Lambda 값을 사용
    // ==================================================================
    const calculateBTTS = (homeLambda, awayLambda) => {
        // 1. 각 팀이 0골을 넣을 확률 계산
        const pHomeNoScore = poissonProbability(0, homeLambda);
        const pAwayNoScore = poissonProbability(0, awayLambda);

        // 2. BTTS=No일 확률 계산 (P(A=0) or P(B=0))
        // P(A or B) = P(A) + P(B) - P(A and B)
        // P(A and B) = P(A) * P(B) (두 사건은 독립)
        const probBttsNo = pHomeNoScore + pAwayNoScore - (pHomeNoScore * pAwayNoScore);

        // 3. BTTS=Yes일 확률 (1 - P(BTTS=No))
        const probBttsYes = 1 - probBttsNo;

        return {
            btts_yes_prob: probBttsYes * 100,
            btts_no_prob: probBttsNo * 100
        };
    };

    
    // ==================================================================
    // [신규] 홈 vs 원정 편향 추적/리포트 모듈
    // ==================================================================
    const biasTracker = {
        windowSize: 200,
        fifo: [],
        counts: { home: 0, draw: 0, away: 0 },
        byLeague: {}
    };

    function recordPredictionPick({ leagueName, pick }) {
        try {
            const now = Date.now();
            const league = leagueName || 'Unknown';
            biasTracker.fifo.push({ ts: now, league, pick });
            biasTracker.counts[pick] = (biasTracker.counts[pick] || 0) + 1;

            if (!biasTracker.byLeague[league]) {
                biasTracker.byLeague[league] = { home: 0, draw: 0, away: 0, total: 0 };
            }
            biasTracker.byLeague[league][pick] += 1;
            biasTracker.byLeague[league].total += 1;

            while (biasTracker.fifo.length > biasTracker.windowSize) {
                const old = biasTracker.fifo.shift();
                biasTracker.counts[old.pick] -= 1;
                if (biasTracker.byLeague[old.league]) {
                    biasTracker.byLeague[old.league][old.pick] -= 1;
                    biasTracker.byLeague[old.league].total -= 1;
                }
            }
        } catch (e) {
            console.warn('recordPredictionPick error:', e);
        }
    }

    function getBiasMetrics() {
        const n = biasTracker.fifo.length || 1;
        const pHome = (biasTracker.counts.home || 0) / n;
        const pDraw = (biasTracker.counts.draw || 0) / n;
        const pAway = (biasTracker.counts.away || 0) / n;
        const biasScore = Math.abs(pHome - pAway);
        const WARN = 0.20;

        const leagueRows = Object.entries(biasTracker.byLeague)
            .filter(([, v]) => (v.total || 0) >= 20)
            .map(([name, v]) => {
                const ph = v.home / v.total;
                const pd = v.draw / v.total;
                const pa = v.away / v.total;
                return { name, ph, pd, pa, gap: Math.abs(ph - pa), total: v.total };
            })
            .sort((a, b) => b.gap - a.gap)
            .slice(0, 5);

        return { n, pHome, pDraw, pAway, biasScore, WARN, leagueRows };
    }

    function renderBiasReport() {
        try {
            let el = document.getElementById('bias-report');
            if (!el) return; // HTML에 컨테이너가 없으면 조용히 스킵

            const { n, pHome, pDraw, pAway, biasScore, WARN, leagueRows } = getBiasMetrics();
            const pct = x => (x * 100).toFixed(0) + '%';
            const flag = biasScore >= WARN ? '⚠️' : '✅';

            const leagueTable = (leagueRows || []).map(r => (
                `<tr>
                    <td class="px-2 py-1">${r.name}</td>
                    <td class="px-2 py-1 text-center">${pct(r.ph)}</td>
                    <td class="px-2 py-1 text-center">${pct(r.pd)}</td>
                    <td class="px-2 py-1 text-center">${pct(r.pa)}</td>
                    <td class="px-2 py-1 text-center">${pct(r.gap)}</td>
                    <td class="px-2 py-1 text-center">${r.total}</td>
                </tr>`
            )).join('');

            el.innerHTML = `
                <div class="${biasScore >= WARN ? 'warning' : 'success'}" style="padding:.75rem;border-radius:.375rem;margin-top:.5rem;">
                  <strong>홈 vs 원정 편향 리포트</strong> ${flag}
                  <div style="margin-top:.25rem;font-size:.9em;">
                    최근 ${n}경기 기준 — Home ${pct(pHome)}, Draw ${pct(pDraw)}, Away ${pct(pAway)} (불균형: ${pct(biasScore)})
                    ${biasScore >= WARN ? '<br>→ 최근 예측이 홈/원정 중 한쪽으로 쏠려 있습니다.' : ''}
                  </div>
                </div>
                <div style="margin-top:.5rem;">
                  <table class="min-w-full text-sm border">
                    <thead>
                      <tr class="bg-gray-50">
                        <th class="px-2 py-1 text-left">리그</th>
                        <th class="px-2 py-1">Home</th>
                        <th class="px-2 py-1">Draw</th>
                        <th class="px-2 py-1">Away</th>
                        <th class="px-2 py-1">불균형</th>
                        <th class="px-2 py-1">표본</th>
                      </tr>
                    </thead>
                    <tbody>${leagueTable || '<tr><td class="px-2 py-2" colspan="6">표본 부족</td></tr>'}</tbody>
                  </table>
                </div>`;
        } catch (e) {
            console.warn('renderBiasReport error:', e);
        }
    }
// ==================================================================
    // [Phase 1] 재훈련용 데이터 수집 헬퍼 함수
    // ==================================================================
    const collectTrainingData = (data, actualResult) => {
        try {
            // 이 함수는 재훈련에 사용할 "예측 변수(Features)"와 "결과(Label)"를 수집합니다.
            // 전략 2.2, 2.3에 따라 xG 관련 변수를 추가해야 합니다.

            // 1. 실제 결과 (Label)
            const resultLabel = actualResult === '홈 승' ? 0 : (actualResult === '무승부' ? 1 : 2); // 0: Home, 1: Draw, 2: Away

            // 2. 예측 변수 (Features)
            const features = {
                // 기존 변수
                eloDiff: data.homeElo - data.awayElo,
                ppgDiff: data.homePpg - data.awayPpg,
                homeOsl: data.osls.homeOsl,
                drawOsl: data.osls.drawOsl,
                awayOsl: data.osls.awayOsl,
                poissonHomeProb: data.poissonAnalysis.homeWinProb,
                avgDrawPercent: data.avgDrawPercent,
                upsetScoreDiff: (data.homeUpsetScore || 0) - (data.awayUpsetScore || 0),

                // [전략 2.2] 신규 xG 변수 (데이터 구조가 업데이트 되었다고 가정)
                // xg_for/against은 getCurrentTeamsData에서 1.5로 초기화됨
                xgHomeFor: data.homeTeam.xg_for_home,
                xgAwayFor: data.awayTeam.xg_for_away,
                xgHomeAgainst: data.homeTeam.xg_against_home,
                xgAwayAgainst: data.awayTeam.xg_against_away,
            };

            // ★★★ [수정 v1] trainingDataExport 구조 명확화 ★★★
            // 모든 예측 정보를 포함하는 완전한 학습 데이터
            trainingDataExport.push({
                id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                leagueName: data.leagueName || 'Unknown',
                homeName: data.homeTeam?.name || 'Home',
                awayName: data.awayTeam?.name || 'Away',
                
                // 12개 특성 벡터
                features: features,
                
                // 6개 모델의 예측 결과 (나중에 채워짐)
                predictions: {
                    hpl: null,      // Poisson 확률
                    bt: null,       // Bradley-Terry
                    osl: null,      // OSL 점수
                    regression: null, // 회귀 분석
                    handicap: null,  // 핸디캡
                    fuzzy: null      // 퍼지 로직
                },
                
                // 종합 예측
                finalPrediction: null,  // "홈 승", "무승보", "원정 승"
                finalPredictionConfidence: null, // 0-100
                
                // 실제 결과 (나중에 추가)
                finalResult: null,  // "홈 승", "무승보", "원정 승"
                isCorrect: null,    // true/false
                
                // 메타데이터
                timestamp: new Date().toISOString(),
                modelVersion: '8.5'
            });

        } catch (e) {
            console.error("Error collecting training data:", e, data);
        }
    };
    
    // --- Advanced Features ---
    // Bradley-Terry (BT) Model
    const calculateBradleyTerryPrediction = (data) => {
        // [Phase 3] 재훈련된 계수를 이 함수에 붙여넣어야 합니다. (현재는 임시 계수)
        const coeffs = {
            intercept: 0.05,
            home_adv: 0.25,
            elo_diff: 0.002,
            ppg_diff: 0.2,
            form_points_diff: 0.05,
            upset_score_diff: -0.001
        };
        const { homeElo, awayElo, homePpg, awayPpg, homeForm, awayForm, homeUpsetScore, awayUpsetScore } = data;

        const formToPoints = (form) => !form ? 0 : (form.match(/W/g) || []).length * 3 + (form.match(/D/g) || []).length * 1;

        const homeStrength =
            coeffs.home_adv +
            (coeffs.elo_diff * (homeElo - awayElo)) +
            (coeffs.ppg_diff * (homePpg - awayPpg)) +
            (coeffs.form_points_diff * (formToPoints(homeForm) - formToPoints(awayForm))) +
            (coeffs.upset_score_diff * (homeUpsetScore - awayUpsetScore));
            
        const awayStrength = 0; // Baseline

        const drawParam = 1.2;
        const pi_home = Math.exp(homeStrength);
        const pi_away = Math.exp(awayStrength);

        const denominator = pi_home + pi_away + (drawParam * Math.sqrt(pi_home * pi_away));

        const homeProb = pi_home / denominator;
        const awayProb = pi_away / denominator;
        const drawProb = 1 - homeProb - awayProb;

        return { home: homeProb * 100, draw: drawProb * 100, away: awayProb * 100 };
    };

    // ==================================================================
    // ★★★ [수정] 이변 지수 로직 전면 수정 ★★★
    // (모멘텀 + 무승부 이변 + 상대적 배당률 + 점수 차 보너스)
    // ==================================================================
    const calculateAllUpsetScores = () => {
        // 1. 상수 정의
        const POINTS_MULTIPLIER = 5; // 이변 배당률에 곱해지는 기본 점수
        const RECENT_GAME_COUNT = 10; // 모멘텀을 계산할 최근 경기 수
        const UPSET_RATIO_THRESHOLD = 1.8; // 상대 배당률이 1.8배 이상 차이날 때 이변으로 간주
        const MOMENTUM_POINTS = 1.5; // 승/패 시 기본적으로 얻거나 잃는 모멘텀 점수
        const DRAW_PENALTY_MULTIPLIER = 0.5; // 무승부 이변 시 페널티/보너스 가중치

        // 2. 데이터 준비 및 정렬
        teamUpsetStats = {}; // 점수판 초기화
        let teamGameCount = {}; // 팀별 처리된 경기 수를 추적

        let allFixtures = [
            ...Object.values(parsedFixtures).flat(), 
            ...manualFixtures 
        ];

        // 모든 경기를 날짜순으로 정렬 (최신 경기가 0번 인덱스)
        // 'date' 필드는 populateFixturesForLeague와 addResultBtn에서 추가되어야 함
        allFixtures.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 3. 모멘텀 계산 (최신 10경기)
        for (const fixture of allFixtures) {
            const { homeTeamName, awayTeamName, homeOdds, awayOdds, homeScore, awayScore, date } = fixture;
            
            // 필수 데이터 확인 (결과가 있어야 함)
            if (!homeTeamName || !awayTeamName || typeof homeScore !== 'number' || !homeOdds || !awayOdds || !date) continue;

            // 팀 점수 및 카운트 초기화
            if (!teamUpsetStats[homeTeamName]) { teamUpsetStats[homeTeamName] = 0; teamGameCount[homeTeamName] = 0; }
            if (!teamUpsetStats[awayTeamName]) { teamUpsetStats[awayTeamName] = 0; teamGameCount[awayTeamName] = 0; }

            // 상대적 배당률 계산
            const homeOddsRatio = homeOdds / awayOdds; // 높을수록 홈이 언더독
            const awayOddsRatio = awayOdds / homeOdds; // 높을수록 원정이 언더독

            let homePoints = 0;
            let awayPoints = 0;

            // --- 홈 팀 모멘텀 계산 ---
            if (teamGameCount[homeTeamName] < RECENT_GAME_COUNT) {
                if (homeScore > awayScore) { // 홈 승리
                    homePoints = MOMENTUM_POINTS; // 기본 승리 점수
                    // 이변 승리 (Enhancement 4: 상대적 배당률)
                    if (homeOddsRatio > UPSET_RATIO_THRESHOLD) {
                        // (Enhancement 3: 점수 차 보너스)
                        const marginBonus = 1 + (Math.abs(homeScore - awayScore) * 0.1);
                        homePoints += (homeOddsRatio * POINTS_MULTIPLIER) * marginBonus;
                    }
                } else if (homeScore < awayScore) { // 홈 패배
                    homePoints = -MOMENTUM_POINTS; // 기본 패배 점수
                    // 이변 패배 (상대가 이변을 일으킴)
                    if (awayOddsRatio > UPSET_RATIO_THRESHOLD) {
                        homePoints -= (awayOddsRatio * POINTS_MULTIPLIER / 2); // 페널티
                    }
                } else { // 무승부
                    // (Enhancement 1: 무승부 이변)
                    if (awayOddsRatio > UPSET_RATIO_THRESHOLD) { // 홈이 강팀인데 비김
                        homePoints = -MOMENTUM_POINTS * DRAW_PENALTY_MULTIPLIER; // 페널티
                    } else if (homeOddsRatio > UPSET_RATIO_THRESHOLD) { // 홈이 약팀인데 비김
                        homePoints = (homeOddsRatio * POINTS_MULTIPLIER) * DRAW_PENALTY_MULTIPLIER; // 보너스
                    }
                    // else: 비슷한 배당끼리 비기면 0점
                }
                
                teamUpsetStats[homeTeamName] += homePoints;
                teamGameCount[homeTeamName]++;
            }

            // --- 원정 팀 모멘텀 계산 ---
            if (teamGameCount[awayTeamName] < RECENT_GAME_COUNT) {
                 if (homeScore < awayScore) { // 원정 승리
                    awayPoints = MOMENTUM_POINTS; // 기본 승리 점수
                    // 이변 승리 (Enhancement 4: 상대적 배당률)
                    if (awayOddsRatio > UPSET_RATIO_THRESHOLD) {
                        // (Enhancement 3: 점수 차 보너스)
                        const marginBonus = 1 + (Math.abs(homeScore - awayScore) * 0.1);
                        awayPoints += (awayOddsRatio * POINTS_MULTIPLIER) * marginBonus;
                    }
                } else if (homeScore > awayScore) { // 원정 패배
                    awayPoints = -MOMENTUM_POINTS; // 기본 패배 점수
                    // 이변 패배 (상대가 이변을 일으킴)
                    if (homeOddsRatio > UPSET_RATIO_THRESHOLD) {
                        awayPoints -= (homeOddsRatio * POINTS_MULTIPLIER / 2); // 페널티
                    }
                } else { // 무승부
                    // (Enhancement 1: 무승부 이변)
                    if (homeOddsRatio > UPSET_RATIO_THRESHOLD) { // 원정이 강팀인데 비김
                        awayPoints = -MOMENTUM_POINTS * DRAW_PENALTY_MULTIPLIER; // 페널티
                    } else if (awayOddsRatio > UPSET_RATIO_THRESHOLD) { // 원정이 약팀인데 비김
                        awayPoints = (awayOddsRatio * POINTS_MULTIPLIER) * DRAW_PENALTY_MULTIPLIER; // 보너스
                    }
                    // else: 비슷한 배당끼리 비기면 0점
                }
                
                teamUpsetStats[awayTeamName] += awayPoints;
                teamGameCount[awayTeamName]++;
            }
        }
    };


    const softmax = (logits) => {
        const maxLogit = Math.max(...logits);
        const exps = logits.map(logit => Math.exp(logit - maxLogit));
        const sumExps = exps.reduce((a, b) => a + b);
        return exps.map(exp => exp / sumExps);
    };

    // ==================================================================
    // [전략 2.2 적용 예정] Regression Model
    // [Phase 3] 재훈련된 계수를 이 함수에 붙여넣어야 합니다.
    // ==================================================================
    const calculateRegressionPrediction = (data) => {
        // --- 현재 계수 (임시) ---
        // xG 변수가 추가되면 이 계수 구조가 변경되어야 합니다.
        const coeffs = {
            intercept: { home: 0.2, draw: 0.1, away: -0.2 },
            eloDiff:   { home: 0.005, draw: -0.001, away: -0.005 },
            ppgDiff:   { home: 0.4, draw: -0.2, away: -0.4 },
            homeOsl:   { home: -0.03, draw: 0.01, away: 0.02 },
            drawOsl:   { home: 0.01, draw: -0.05, away: 0.01 },
            awayOsl:   { home: 0.02, draw: 0.01, away: -0.03 },
            poissonHome: { home: 0.01, draw: -0.005, away: -0.01 },
            drawTend:  { home: -0.01, draw: 0.02, away: -0.01 }
        };

        const { homeElo, awayElo, homePpg, awayPpg, osls, poissonAnalysis, avgDrawPercent } = data;
        const eloDifference = homeElo - awayElo;
        const ppgDifference = homePpg - awayPpg;

        // [Phase 3]에서 Python 재훈련 모델과 *동일한* 변수(Features)를 사용해야 합니다.
        const homeLogit = coeffs.intercept.home + (coeffs.eloDiff.home*eloDifference) + (coeffs.ppgDiff.home*ppgDifference) + (coeffs.homeOsl.home*osls.homeOsl) + (coeffs.drawOsl.home*osls.drawOsl) + (coeffs.awayOsl.home*osls.awayOsl) + (coeffs.poissonHome.home*poissonAnalysis.homeWinProb) + (coeffs.drawTend.home*avgDrawPercent);
        const drawLogit = coeffs.intercept.draw + (coeffs.eloDiff.draw*eloDifference) + (coeffs.ppgDiff.draw*ppgDifference) + (coeffs.homeOsl.draw*osls.homeOsl) + (coeffs.drawOsl.draw*osls.drawOsl) + (coeffs.awayOsl.draw*osls.awayOsl) + (coeffs.poissonHome.draw*poissonAnalysis.homeWinProb) + (coeffs.drawTend.draw*avgDrawPercent);
        const awayLogit = coeffs.intercept.away + (coeffs.eloDiff.away*eloDifference) + (coeffs.ppgDiff.away*ppgDifference) + (coeffs.homeOsl.away*osls.homeOsl) + (coeffs.drawOsl.away*osls.drawOsl) + (coeffs.awayOsl.away*osls.awayOsl) + (coeffs.poissonHome.away*poissonAnalysis.homeWinProb) + (coeffs.drawTend.away*avgDrawPercent);

        const [homeProb, drawProb, awayProb] = softmax([homeLogit, drawLogit, awayLogit]);
        return { home: homeProb*100, draw: drawProb*100, away: awayProb*100 };
    };

    // ==================================================================
    // [전략 4단계 적용] Synergy/Consensus scoring
    // xG-HPL 푸아송 모델의 가중치를 가장 높게 재조정
    // ==================================================================
    const calculateSynergyScores = (predictions) => {
        const { osl, regression, poisson, fuzzy, bt, upsetScore } = predictions;
        const modelPredictions = { osl, regression, poisson, fuzzy, bt };

        // [전략 4단계] 가중치 재조정
        const weights = {
            bt: 3.0,        // Strong
            osl: 2.0,       // Downgraded (PPG-based)
            poisson: 3.5,   // UPGRADED: xG-based model, now the strongest predictor
            regression: 0.5,// Weak
            fuzzy: 1.0      // Weak
        };

        let scores = { '홈 승': 0, '무승부': 0, '원정 승': 0 };
        let reasons = { '홈 승': new Set(), '무승부': new Set(), '원정 승': new Set() };

        // Apply base weights
        for (const model in modelPredictions) {
            const prediction = modelPredictions[model];
            if (scores.hasOwnProperty(prediction)) {
                if (weights[model] !== undefined) {
                    scores[prediction] += weights[model];
                    // Only add strong model names as primary reasons
                    if (weights[model] >= 2.0) { // OSL(2.0)도 포함
                        reasons[prediction].add(model.toUpperCase());
                    }
                }
            }
        }

        // --- Model Agreement Bonus (Focus on Top 3: Poisson, BT, OSL) ---
        const topModels = ['poisson', 'bt', 'osl']; // Poisson이 1순위
        const topModelPredictions = topModels.map(m => modelPredictions[m]);
        const agreementCounts = {};
        topModelPredictions.forEach(p => {
            if (p !== 'N/A') agreementCounts[p] = (agreementCounts[p] || 0) + 1;
        });

        for (const outcome in agreementCounts) {
            if (agreementCounts[outcome] === 3) { // All top 3 agree
                scores[outcome] += 2.5; // Strong bonus
                reasons[outcome].add('Top3 일치');
            } else if (agreementCounts[outcome] === 2) { // 2 out of top 3 agree
                scores[outcome] += 1.5; // Moderate bonus
                reasons[outcome].add('Top3 중 2개 일치');
            }
        }
        // --- End Model Agreement Bonus ---

        // ★★★ [수정] 이변 지수 보너스 로직 (새로운 모멘텀 점수 반영) ★★★
        const UPSET_THRESHOLD = 5; // (MOMENTUM_POINTS * 3) 정도 (3연승 이상)
        if (upsetScore > UPSET_THRESHOLD) {
            scores['홈 승'] += 2.5;
            reasons['홈 승'].add('강한 홈 이변지수');
        } else if (upsetScore < -UPSET_THRESHOLD) {
            scores['원정 승'] += 2.5;
            reasons['원정 승'].add('강한 원정 이변지수');
        }

        // Reduce score slightly if weak models contradict strong signals
        const strongModels = ['poisson', 'bt', 'osl']; // Poisson이 1순위
        const weakModels = ['regression', 'fuzzy'];
        strongModels.forEach(strongModel => {
            const strongPrediction = modelPredictions[strongModel];
            if (strongPrediction !== 'N/A') {
                weakModels.forEach(weakModel => {
                    const weakPrediction = modelPredictions[weakModel];
                    if (weakPrediction !== 'N/A' && weakPrediction !== strongPrediction) {
                        // Apply a small penalty if a weak model disagrees with a strong one
                        scores[strongPrediction] -= 0.3; // Small penalty
                    }
                });
            }
        });


        return { scores, reasons };
    };
    
    // ==================================================================
    // [전략 4단계 적용] calculateHybridPrediction
    // O/U, BTTS 신규 예측값을 전달받아 강력한 신호일 경우 텍스트에 추가
    // ==================================================================
    const calculateHybridPrediction = (predictions) => {
        // [전략 4단계] 신규 예측값(ouProbs, bttsProbs)을 전달받음
        const { ouProbs, bttsProbs } = predictions;
        const synergy = calculateSynergyScores(predictions);

        let hybridScores = synergy.scores;
        let finalReasons = synergy.reasons;

        let maxScore = -1;
        let finalPrediction = '⚖️ 분석 보류';
        for (const outcome in hybridScores) {
            if (hybridScores[outcome] > maxScore) {
                maxScore = hybridScores[outcome];
                finalPrediction = outcome;
            }
        }

        const sortedScores = Object.entries(hybridScores).sort((a, b) => b[1] - a[1]);
        // Adjusted contested threshold
        if (sortedScores.length > 1 && (sortedScores[0][1] - sortedScores[1][1] < 1.0)) {
             // [전략 4단계] '데이터 충돌' reason 추가 (xG-OSL이 없으므로 '혼전'으로 표기)
             return { prediction: '⚖️ 분석 보류 (혼전)', reason: '모델 신호 불일치' };
        }

        // [수정] finalReasons[finalPrediction]이 undefined가 아닌지 확인
        let reason = finalReasons[finalPrediction] ? [...finalReasons[finalPrediction]].join(', ') : 'N/A';

        // Adjusted thresholds for labels
        let predictionText = `🎯 ${finalPrediction}`;
        if (maxScore > 10) { // Increased threshold for "strong"
            predictionText = `✅ 강력한 ${finalPrediction}`;
        } else if (maxScore < 5) { // Increased threshold for "weak"
             predictionText = `⚠️ ${finalPrediction} (신호 약함)`;
        }

        // Keep Upset label logic
        // [수정] finalReasons[finalPrediction]이 undefined가 아닌지 확인
        if (finalReasons[finalPrediction] && finalReasons[finalPrediction].has('강한 홈 이변지수')) {
             predictionText = `🔥 ${finalPrediction} (이변)`;
        }
        if (finalReasons[finalPrediction] && finalReasons[finalPrediction].has('강한 원정 이변지수')) {
             predictionText = `🔥 ${finalPrediction} (이변)`;
        }

        // [전략 4단계] O/U, BTTS 강력 신호 추가
        if (ouProbs) {
            if (ouProbs.over_2_5_prob > 70) {
                predictionText += ' (Over 2.5 유력)';
                reason += ', Over 2.5 70%_UP';
            } else if (ouProbs.under_2_5_prob > 70) {
                predictionText += ' (Under 2.5 유력)';
                reason += ', Under 2.5 70%_UP';
            }
        }
        if (bttsProbs) {
             if (bttsProbs.btts_yes_prob > 65) {
                reason += ', BTTS 65%_UP';
             } else if (bttsProbs.btts_no_prob > 65) {
                 reason += ', BTTS No 65%_UP';
             }
        }


        return { prediction: predictionText, reason: `(${reason})` };
    };


    // Brier Score logic now uses HPL-Poisson probabilities
    function calculateSingleBrierScore(probs, finalResult) {
        if (!probs || !finalResult) return null;
        if (typeof finalResult !== 'string' || !finalResult.includes('-')) return null;
        const scoreParts = finalResult.split('-').map(Number);
        if (scoreParts.length !== 2 || scoreParts.some(isNaN)) return null;
        const [homeScore, awayScore] = scoreParts;


        const pHome = (probs.homeWinProb) / 100;
        const pDraw = (probs.drawProb) / 100;
        const pAway = (probs.awayWinProb) / 100;

        if (isNaN(pHome) || isNaN(pDraw) || isNaN(pAway)) return null;

        const oHome = homeScore > awayScore ? 1 : 0;
        const oDraw = homeScore === awayScore ? 1 : 0;
        const oAway = homeScore < awayScore ? 1 : 0;

        return Math.pow(pHome - oHome, 2) + Math.pow(pDraw - oDraw, 2) + Math.pow(pAway - oAway, 2);
    }

    // Brier Score logic now uses 'poissonProbs' dataset
    const calculateBrierScore = () => {
        const rows = Array.from(resultsBody.querySelectorAll('tr'));
        const completedMatches = rows.filter(row => row.dataset.finalResult && row.dataset.poissonProbs);

        if (completedMatches.length === 0) {
            modelPerformanceSummary.innerHTML = `<h4>🤖 HPL xG-푸아송 모델 성능</h4><p><strong>브라이어 점수 (Brier Score):</strong> N/A (결과 입력 필요)</p><p style="font-size: 0.85em; color: #555;">* 브라이어 점수는 예측 확률의 정확도를 나타내며, 0에 가까울수록 좋습니다. (무작위 예측 기준: ~0.67)</p>`;
            return;
        }

        let totalBrierScore = 0;
        completedMatches.forEach(row => {
             try {
                const probs = JSON.parse(row.dataset.poissonProbs);
                const score = calculateSingleBrierScore(probs, row.dataset.finalResult);
                if(score !== null) totalBrierScore += score;
            } catch (e) {
                console.error("Error parsing poissonProbs or calculating Brier for row:", row, e);
            }
        });

        const avgBrierScore = totalBrierScore / completedMatches.length;
        // [수정] 모델 이름 변경 (HPL -> HPL xG-푸아송)
        modelPerformanceSummary.innerHTML = `<h4>🤖 HPL xG-푸아송 모델 성능</h4><p><strong>브라이어 점수 (Brier Score):</strong> <strong>${avgBrierScore.toFixed(3)}</strong> (총 ${completedMatches.length} 경기 기준)</p><p style="font-size: 0.85em; color: #555;">* 브라이어 점수는 예측 확률의 정확도를 나타내며, 0에 가까울수록 좋습니다. (무작위 예측 기준: ~0.67)</p>`;

        // ## ADDED ##: Recalculate synergy table when Brier Score updates
        updateSynergyAnalysis();
    };

    const getFlexibleHandicapPrediction = (data) => {
        const { regressionProbs, eloDiff, poissonAnalysis, finalPrediction, homeUpsetScore, awayUpsetScore, fuzzyPrediction } = data;
        if (!regressionProbs) return "핸디캡 계산 불가";
        const probDiff = regressionProbs.home - regressionProbs.away;
        const isHomeFav = probDiff > 0;
        // [수정] poissonAnalysis의 homeWinProb/awayWinProb은 이제 xG 기반이므로 핸디캡 로직에 더욱 강력하게 작용
        const cleanFinalPrediction = finalPrediction.replace(/🔥 |🎯 |🤝 | \(상승세\)|✅ |⚠️ |⚖️ | \(Over.*\)| \(Under.*\)/g, '').trim();
        let handicapValue = null;
        const fuzzyCenter = fuzzyPrediction && typeof fuzzyPrediction.center === 'number' ? fuzzyPrediction.center : null;

        if (
            (isHomeFav && probDiff > 60 && eloDiff > 300 && poissonAnalysis.homeWinProb > 80 && fuzzyCenter > 2.0) ||
            (!isHomeFav && probDiff < -60 && eloDiff < -300 && poissonAnalysis.awayWinProb > 80 && fuzzyCenter < -2.0)
        ) {
            handicapValue = -2.5;
        }
        else if (
            // [수정] xG-Poisson 확률(e.g., 70%)을 핸디캡 조건에 추가하여 신뢰도 향상
            (isHomeFav && probDiff > 45 && eloDiff > 200 && poissonAnalysis.homeWinProb > 70 && fuzzyCenter > 1.25) ||
            (!isHomeFav && probDiff < -45 && eloDiff < -200 && poissonAnalysis.awayWinProb > 70 && fuzzyCenter < -1.25)
        ) {
            handicapValue = -1.5;
        }
        else if (
            (isHomeFav && (probDiff > 30 || (eloDiff > 150 && cleanFinalPrediction.includes('홈 승')) || poissonAnalysis.homeWinProb > 60)) ||
            (!isHomeFav && (probDiff < -30 || (eloDiff < -150 && cleanFinalPrediction.includes('원정 승')) || poissonAnalysis.awayWinProb > 60))
        ) {
            handicapValue = -0.5;
        }

        if (handicapValue !== null) {
            // ★★★ [수정] 이변 지수 임계값 (새로운 모멘텀 점수 기준) ★★★
            const UPSET_ADJUSTMENT_THRESHOLD = 5; 
            const opponentUpsetScore = isHomeFav ? awayUpsetScore : homeUpsetScore;
            if (opponentUpsetScore > UPSET_ADJUSTMENT_THRESHOLD) {
                if (handicapValue === -2.5) handicapValue = -1.5;
                else if (handicapValue === -1.5) handicapValue = -0.5;
                else if (handicapValue === -0.5) handicapValue = null;
            }
        }

        if (handicapValue !== null && fuzzyPrediction && typeof fuzzyPrediction.spread === 'number') {
            const SPREAD_ADJUSTMENT_THRESHOLD = 3.0;
            if (fuzzyPrediction.spread > SPREAD_ADJUSTMENT_THRESHOLD) {
                 if (handicapValue === -2.5) handicapValue = -1.5;
                 else if (handicapValue === -1.5) handicapValue = -0.5;
                 // ★★★ [수정] 가장 약한 핸디캡(-0.5)은 불확실성이 높아도 취소하지 않도록 주석 처리
                 // else if (handicapValue === -0.5) handicapValue = null; 
            }
        }

        if (handicapValue === null) return "핸디캡 없음";
        const finalHandicapValue = isHomeFav ? handicapValue : -handicapValue;
        return `홈 팀 ${finalHandicapValue > 0 ? `+${finalHandicapValue}` : `${finalHandicapValue}`} 핸디캡 승`;
    };

    // --- Fuzzy Regression Implementation ---
    const predictWithFuzzyModel = (features) => {
        if (!fuzzyCoefficients) {
            return { center: 'N/A', spread: 'N/A' };
        }
        const { a_coeffs, c_coeffs } = fuzzyCoefficients;
        let center = 0;
        let spread = 0;
        for (let i = 0; i < features.length; i++) {
            center += a_coeffs[i] * features[i];
            spread += c_coeffs[i] * Math.abs(features[i]);
        }
        return { center, spread };
    };

    const trainFuzzyRegression = (initialTraining = false) => {
        try {
            if (typeof solver === 'undefined' || typeof solver.Solve !== 'function') {
                throw new Error("LP Solver library (solver.js) is not loaded or invalid.");
            }

            const trainingData = [];

            // [참고] 현재 4-feature 모델을 유지합니다. [1, eloDiff, ppgDiff, upsetScoreDiff]
            const numFeatures = 4; 

            if (initialTraining) {
                // API 연동 후 초기 훈련 데이터는 로컬 저장된 데이터로 대체됩니다.
                // API 데이터는 순위만 제공하므로, 초기 훈련은 로컬 데이터를 사용하거나, 
                // 빈 데이터로 시작하여 수동/백테스팅 데이터를 수집하게 합니다.
                // 여기서는 초기 훈련 시 로컬 데이터가 없다고 가정하고, 앱 구동 후
                // 백테스팅/수동 데이터를 통해 훈련되도록 로직을 수정했습니다.
                // 기존 로컬 파일 로직은 제거하고, 빈 데이터로 시작합니다.
                
                // ★★★ [수정] 초기 훈련 시 parsedFixtures는 비어있을 수 있으므로, 
                // 훈련이 가능한지 확인하고 건너뜁니다.
                const allFixtures = Object.values(parsedFixtures).flat();
                if (allFixtures.length === 0) {
                     fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: orange;">! 모델 훈련 대기 중 (최소 5경기 필요). 백테스팅을 실행하거나 수동으로 결과를 입력하세요.</p>`;
                     return;
                }
                
                for (const fixture of allFixtures) {
                    const leagueName = fixture.leagueName; // 이 속성이 API 응답에 없으므로, populateFixturesForLeague에서 추가해야 함. (추가됨)
                    const teamsData = getCurrentTeamsData(leagueName, fixture.homeTeamName, fixture.awayTeamName, allLeaguesData);

                    if (teamsData && teamsData.homeTeam && teamsData.awayTeam && typeof fixture.homeScore === 'number') {
                        const { homeTeam, awayTeam } = teamsData;
                        const eloDiff = homeTeam.elo - awayTeam.elo;
                        const ppgDiff = homeTeam.ppg - awayTeam.ppg;
                        
                        // Upset Score는 모든 fixture를 처리한 후 생성되어야 하므로, 
                        // initialTraining에서는 임시로 0을 사용하고, 
                        // 실제 훈련 시 (false)에만 calculateAllUpsetScores 후의 값을 사용합니다.
                        const upsetScoreDiff = 0; // 초기 훈련 시 임시 0
                        
                        const goalDiff = fixture.homeScore - fixture.awayScore;
                        trainingData.push({
                            features: [1, eloDiff, ppgDiff, upsetScoreDiff],
                            y: goalDiff
                        });
                    }
                }
            } else { // Re-training from the table (manual or backtest results)
                const completedRows = Array.from(resultsBody.querySelectorAll('tr'));
                // 훈련 전, 모든 fixture를 기반으로 Upset Score를 다시 계산 (가장 최신 결과 반영)
                calculateAllUpsetScores(); 
                
                for (const row of completedRows) {
                    if (row.dataset.finalResult && row.dataset.analysis) {
                         try { // Add try-catch for parsing row data
                             const analysisData = JSON.parse(row.dataset.analysis);
                             const [homeScore, awayScore] = row.dataset.finalResult.split('-').map(Number);
                             const goalDiff = homeScore - awayScore;

                             const { homeElo, awayElo, homePpg, awayPpg } = analysisData;
                             const eloDiff = homeElo - awayElo;
                             const ppgDiff = homePpg - awayPpg;
                             // Upset Score는 calculateAllUpsetScores()를 통해 업데이트된 전역 변수 teamUpsetStats에서 가져옵니다.
                             // FIXED: Handle cases where homeTeam/awayTeam might not be objects
                             const homeTeamName = (analysisData.homeTeam && typeof analysisData.homeTeam === 'object') 
                                 ? analysisData.homeTeam.name 
                                 : (analysisData.homeTeamName || '');
                             const awayTeamName = (analysisData.awayTeam && typeof analysisData.awayTeam === 'object') 
                                 ? analysisData.awayTeam.name 
                                 : (analysisData.awayTeamName || '');
                             const homeUpsetScore = teamUpsetStats[homeTeamName] || 0;
                             const awayUpsetScore = teamUpsetStats[awayTeamName] || 0;
                             const upsetScoreDiff = homeUpsetScore - awayUpsetScore;

                             trainingData.push({
                                 features: [1, eloDiff, ppgDiff, upsetScoreDiff],
                                 y: goalDiff
                             });
                         } catch (e) {
                             console.error("Error processing row for fuzzy training:", row.dataset.analysis, row.dataset.finalResult, e);
                         }
                    }
                }
            }

            if (trainingData.length < 5) {
                // 초기 로드 시에는 경고만 표시하고 훈련을 건너니다.
                if (initialTraining) {
                    fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: orange;">! 모델 훈련 대기 중 (최소 5경기 필요). 백테스팅을 실행하거나 수동으로 결과를 입력하세요.</p>`;
                    return; 
                }
                throw new Error("모델 훈련에 필요한 경기 결과 데이터가 부족합니다 (최소 5경기).");
            }

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

            const results = solver.Solve(model);

            if (results.feasible) {
                fuzzyCoefficients = {
                    a_coeffs: Array(numFeatures).fill(0).map((_, i) => results[`a${i}`] || 0),
                    c_coeffs: Array(numFeatures).fill(0).map((_, i) => results[`c${i}`] || 0),
                };
                console.log("Fuzzy Regression Training Successful:", fuzzyCoefficients);
                fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: green;">✓ 모델 훈련 완료 (${trainingData.length} 경기 데이터 사용). 예측이 활성화되었습니다.</p>`;
            } else {
                 throw new Error(`LP Solver did not find a feasible solution. The model might be infeasible.`);
            }

        } catch (e) {
            console.error("Fuzzy Regression Training Failed:", e);
            fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: red;">✗ 모델 훈련 실패. 예측을 사용할 수 없습니다. (${e.message})</p>`;
            fuzzyCoefficients = null;
        }
    };


    // --- UI Update & Helper Functions ---
    const showMessage = (text, type = 'error', targetId = 'message-box') => {
        const box = document.getElementById(targetId);
        if (!box) {
            console.warn(`Message box with ID "${targetId}" not found.`);
            return;
        }
        box.textContent = text;
        box.className = type;
        box.style.display = 'block';
        setTimeout(() => { box.style.display = 'none'; }, 4000);
    };
    const formatFormString = (form) => !form ? 'N/A' : form.toUpperCase().split('').map(res => `<span class="form-icon ${res}">${res}</span>`).join('');
    const updateSummary = () => {
        const includedRows = Array.from(resultsBody.querySelectorAll('tr')).filter(row => !row.querySelector('.select-row-checkbox').checked);
        const totalMatches = includedRows.length;
        const avgScore = totalMatches > 0 ? includedRows.reduce((sum, row) => sum + parseFloat(row.dataset.coreScore), 0) / totalMatches : 0;
        let oslPredWins = includedRows.filter(row => row.dataset.oslPred !== '무승부').length;
        let poissonPredWins = includedRows.filter(row => row.dataset.poissonPred !== '무승부' && row.dataset.poissonPred !== 'N/A').length;
        summaryGrid.innerHTML = `
            <div class="summary-item"><h3>총 분석 경기 수</h3><p>${totalMatches} 경기</p></div>
            <div class="summary-item"><h3>평균 핵심 점수</h3><p>${avgScore.toFixed(2)} 점</p></div>
            <div class="summary-item"><h3>OSL 승/패 예측 비율</h3><p>${oslPredWins} / ${totalMatches - oslPredWins}</p></div>
             <div class="summary-item"><h3>HPL xG-푸아송 승/패 예측 비율</h3><p>${poissonPredWins} / ${totalMatches - poissonPredWins}</p></div>
        `;
    };
    
    // ==================================================================
    // [전략 1단계 적용] getCurrentTeamsData
    // team_data.js가 아닌 API 데이터를 기반으로 팀 정보 획득 및 초기화
    // ==================================================================
    const getCurrentTeamsData = (leagueName, homeTeamName, awayTeamName, sourceData = allLeaguesData) => {
        const leagueData = sourceData[leagueName];

        if (!leagueData || !leagueData.teams) {
            // 'other' 리그 또는 로드 실패 시 기본값
            const defaultOtherStats = {
                id: null, name: 'N/A', ppg: 0, gf: 0, ga: 0, form_l5: "", elo: 1500, prevPpg: [0],
                latentAttack: 0, latentDefense: 0, drawPercent: 25, homePpg: 0, awayPpg: 0,
                xg_for_home: 1.5, xg_against_home: 1.5, xg_for_away: 1.5, xg_against_away: 1.5,
                clean_sheet_pct_home: 0.3, clean_sheet_pct_away: 0.3,
                failed_to_score_pct_home: 0.3, failed_to_score_pct_away: 0.3,
                btts_pct_home: 0.5, btts_pct_away: 0.5,
                over_2_5_pct_home: 0.5, over_2_5_pct_away: 0.5
            };
            return {
                homeTeam: { name: homeTeamName, ...defaultOtherStats },
                awayTeam: { name: awayTeamName, ...defaultOtherStats }
            };
        }
        
        const teams = leagueData.teams;
        const findTeam = (name) => teams.find(t => t.name.trim().toLowerCase() === name.trim().toLowerCase());
        const homeTeam = findTeam(homeTeamName);
        const awayTeam = findTeam(awayTeamName);

        if (homeTeam && awayTeam) {
            // API에서 제공되지 않는 커스텀 스탯이 누락된 경우, 초기화 로직을 다시 적용
            const enrichTeamData = (team) => {
                 return {
                     ...team,
                     // 누락된 필드에 대한 안전한 기본값 설정 (API 데이터는 PPG, ELO, GF, GA 등 기본값을 포함함)
                     homePpg: team.homePpg || team.ppg,
                     awayPpg: team.awayPpg || team.ppg,
                     elo: team.elo || 1500,
                     form_l5: team.form_l5 || "",
                     prevPpg: team.prevPpg || [team.ppg],
                     // xG 및 확률 통계 기본값 (API에서 가져올 수 없음)
                     xg_for_home: team.xg_for_home || 1.5,
                     xg_against_home: team.xg_against_home || 1.5, 
                     xg_for_away: team.xg_for_away || 1.5,
                     xg_against_away: team.xg_against_away || 1.5,
                     clean_sheet_pct_home: team.clean_sheet_pct_home || 0.3,
                     btts_pct_home: team.btts_pct_home || 0.5,
                     over_2_5_pct_home: team.over_2_5_pct_home || 0.5
                 };
            };
            
            return {
                homeTeam: enrichTeamData(homeTeam),
                awayTeam: enrichTeamData(awayTeam)
            };
        }
        
        // 팀을 찾을 수 없는 경우에도 'other'처럼 기본 스탯을 가진 객체 반환
        return getCurrentTeamsData('other', homeTeamName, awayTeamName, sourceData); 
    };

    // ## MODIFIED FUNCTION ##: Calculates model cross-accuracy/synergy table data
    // ## Now filters for manually added rows ##
    const calculateSynergyData = () => {
        // Filter rows: Must have a final result AND be manually added (not backtested)
        const rows = Array.from(resultsBody.querySelectorAll('tr')).filter(row => row.dataset.finalResult && row.dataset.analysisSource === 'manual');
        const totalMatchesAnalyzed = rows.length; // Store the count of filtered rows

        if (rows.length === 0) return null;

        // ## MODIFIED: OSL breakdown added as independent models
        const modelKeys = {
            '종합 예측': 'finalPred',
            'BT 모델': 'btPred',
            'OSL': 'oslPred',
            'HPL xG-푸아송': 'poissonPred', // [수정] 모델 이름 변경
            '회귀': 'regressionPred',
            '퍼지': 'fuzzyPredText',
            '홈 OSL': 'homeOsl', // New independent model based on the cell highlight
            '무 OSL': 'drawOsl', // New independent model based on the cell highlight
            '원 OSL': 'awayOsl'  // New independent model based on the cell highlight
        };
        const modelNames = Object.keys(modelKeys);

        // Structure to hold total predictions and successful cross-predictions
        const totals = {};
        const successes = {};

        modelNames.forEach(name1 => {
            totals[name1] = 0;
            successes[name1] = {};
            modelNames.forEach(name2 => {
                successes[name1][name2] = 0;
            });
        });

        rows.forEach(row => {
            const resultParts = row.dataset.finalResult.split('-').map(Number);
            const actualResult = resultParts[0] > resultParts[1] ? '홈 승' : (resultParts[0] < resultParts[1] ? '원정 승' : '무승부');

            const modelResults = {};
            modelNames.forEach(name => {
                const key = modelKeys[name];
                let prediction = row.dataset[key];

                // --- Cleaning Logic ---
                if (name === '종합 예측' && prediction) {
                    // [수정] O/U 텍스트 제거
                    prediction = prediction.replace(/🔥 |🎯 |🤝 | \(상승세\)|✅ |⚠️ |⚖️ | \(Over.*\)| \(Under.*\)/g, '').trim();
                    if (prediction.includes('홈 승')) prediction = '홈 승';
                    else if (prediction.includes('원정 승')) prediction = '원정 승';
                    else if (prediction.includes('무승부') || prediction.includes('(무)')) prediction = '무승부';
                    else prediction = 'N/A';
                }
                if (prediction && prediction.includes('2+ 승')) prediction = prediction.replace('2+ 승', '1골 승');
                if (prediction === '홈 1골 승') prediction = '홈 승';
                if (prediction === '원정 1골 승') prediction = '원정 승';

                // OSL breakdown model logic: Check if the actual result matches the OSL type
                if (name === '홈 OSL') prediction = (actualResult === '홈 승') ? '홈 승' : 'N/A_Loss';
                if (name === '무 OSL') prediction = (actualResult === '무승부') ? '무승부' : 'N/A_Loss';
                if (name === '원 OSL') prediction = (actualResult === '원정 승') ? '원정 승' : 'N/A_Loss';

                // --- End Cleaning Logic ---

                modelResults[name] = prediction;
            });

            // Step 1: Determine which models were correct in this match
            const correctModels = [];
            modelNames.forEach(name => {
                const prediction = modelResults[name];

                // For regular models: check if prediction matches actual result
                if (name !== '홈 OSL' && name !== '무 OSL' && name !== '원 OSL') {
                    if (prediction === actualResult) {
                        correctModels.push(name);
                    }
                }
                // For OSL breakdown models: they are only considered 'successful' (denominator)
                // when the actual result matches the OSL type.
                // We use the actual result as the "prediction" for the OSL breakdown models
                // to generate the correct base data for conditional probability.
                else {
                    if (modelResults[name] !== 'N/A_Loss') {
                         correctModels.push(name);
                    }
                }
            });

            // Step 2: Update totals (Denominator)
            // Model 1 is the 'Criteria Model' (row)
            correctModels.forEach(name1 => {
                // If Model 1 was correct (or, for OSL breakdown, if the result matched the OSL type), increment its total count
                totals[name1]++;

                // Step 3: Update successes (Numerator)
                // Model 2 is the 'Comparison Model' (column)
                correctModels.forEach(name2 => {
                    // If Model 1 was correct, AND Model 2 was correct, increment the cross-success
                    successes[name1][name2]++;
                });
            });
        });

        // Step 4: Calculate percentages and format result
        const synergyMatrix = {};
        modelNames.forEach(name1 => {
            synergyMatrix[name1] = {};
            modelNames.forEach(name2 => {
                const total = totals[name1];
                const success = successes[name1][name2];

                if (total === 0) {
                    synergyMatrix[name1][name2] = { value: 'N/A', count: '(0/0)', isDiagonal: name1 === name2 };
                } else {
                    const percentage = (success / total) * 100;
                    synergyMatrix[name1][name2] = {
                        value: percentage.toFixed(1) + '%',
                        count: `(${success}/${total})`,
                        isDiagonal: name1 === name2
                    };
                }
            });
        });

        // Return the matrix, names, and the count of analyzed matches
        return { matrix: synergyMatrix, names: modelNames, totalMatchesAnalyzed };
    };

    // ## MODIFIED FUNCTION ##: Renders the synergy table
    // ## Updates title based on filtered data count ##
    const updateSynergyAnalysis = () => {
        const synergyData = calculateSynergyData();

        if (!synergyData) {
            // [수정] O/U, BTTS 열이 추가되었는지 여부에 관계없이 colspan 동적 계산
            // 현재 9개 모델 + 1 헤더 = 10
            const colspan = (synergyHeaderRow.cells.length || 10);
            synergyBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align: center;">분석할 직접 추가된 경기 결과가 없습니다.</td></tr>`;
            document.querySelector('#accuracy-analysis-container h2').innerHTML = `모델 상호 적중률 분석 (직접 추가된 경기만)`;
            return;
        }

        const { matrix, names, totalMatchesAnalyzed } = synergyData;

        // Update header row
        synergyHeaderRow.innerHTML = '<th>기준 모델 (적중 시)</th>';
        names.forEach(name => {
            // Add data-label for mobile view
            synergyHeaderRow.innerHTML += `<th data-label="${name}">${name}</th>`;
        });

        let bodyHTML = '';
        names.forEach(rowName => {
            let rowHTML = `<tr><td style="font-weight: bold;">${rowName}</td>`;
            names.forEach(colName => {
                // [수정] data가 undefined일 경우를 대비한 방어 코드
                const data = matrix[rowName]?.[colName] || { value: 'N/A', count: '(0/0)', isDiagonal: rowName === colName };
                let className = '';

                if (data.isDiagonal) {
                    className = 'diagonal-cell';
                } else if (data.value !== 'N/A') {
                    const percentage = parseFloat(data.value.replace('%', ''));
                    // Thresholds for highlighting cross-synergy (High synergy > 90%, Low synergy < 80%)
                    if (percentage >= 90) {
                        className = 'high-synergy';
                    } else if (percentage < 80) {
                        className = 'low-synergy';
                    }
                }

                // Add data-label for mobile view based on column name
                rowHTML += `<td class="${className}" title="적중 횟수: ${data.count}" data-label="${colName}">${data.value}<br><span style="font-size:0.8em; font-weight: normal;">${data.count}</span></td>`;
            });
            rowHTML += `</tr>`;
            bodyHTML += rowHTML; // [수정] 템플릿 리터럴이 아닌 변수 추가
        });

        synergyBody.innerHTML = bodyHTML;
        // Update the title with the filtered match count
        document.querySelector('#accuracy-analysis-container h2').innerHTML = `모델 상호 적중률 분석 (직접 추가된 ${totalMatchesAnalyzed} 경기만)`;
    };
    // ## END MODIFIED FUNCTION ##

    // ★★★ [신규] 이변 지수 UI 갱신 헬퍼 함수 ★★★
    function updateAllVisibleUpsetScores() {
        const allRows = resultsBody.querySelectorAll('tr');
        allRows.forEach(row => {
            try {
                const analysisData = JSON.parse(row.dataset.analysis || '{}');
                if (!analysisData.homeTeam || !analysisData.awayTeam) return;

                const homeName = analysisData.homeTeam.name;
                const awayName = analysisData.awayTeam.name;

                const homeUpsetScore = teamUpsetStats[homeName] || 0;
                const awayUpsetScore = teamUpsetStats[awayName] || 0;

                // ★★★ [수정] 이변 지수 임계값 (새로운 모멘텀 점수 기준) ★★★
                const UPSET_HIGHLIGHT_THRESHOLD = 5; 
                let homeUpsetDisplay = homeUpsetScore.toFixed(0);
                let awayUpsetDisplay = awayUpsetScore.toFixed(0);
                if (homeUpsetScore > UPSET_HIGHLIGHT_THRESHOLD) homeUpsetDisplay = `⚠️ ${homeUpsetDisplay}`;
                if (awayUpsetScore > UPSET_HIGHLIGHT_THRESHOLD) awayUpsetDisplay = `⚠️ ${awayUpsetDisplay}`;

                const upsetCell = row.cells[3]; // 4번째 셀 (index 3)
                if (upsetCell) {
                    upsetCell.innerHTML = `<span>${homeUpsetDisplay}</span><br><span>${awayUpsetDisplay}</span>`;
                }
            } catch (e) {
                console.error("Error updating upset score UI for row:", row.dataset.analysis, e);
            }
        });
    }


    // --- Initial Setup & Event Listeners ---
    // [Phase 5] API에서 데이터 로드 후 초기화 로직은 initApp으로 이동
    // 여기서는 로드된 데이터를 기반으로 팀 드롭다운을 채우는 로직만 유지합니다.

    // 초기 로딩 시 이 로직이 실행되지만, initApp이 완료될 때까지 빈 상태로 시작합니다.
    updateSummary();
    updateSynergyAnalysis(); // 초기 로드 시 빈 테이블로 시작

    
    // [Phase 5] 리그 선택 변경 시 팀 드롭다운 업데이트 및 API 호출 (Standings 대신 Teams API 사용)
    leagueSelect.addEventListener('change', async (e) => {
        const leagueName = e.target.value;
        const isOtherLeague = leagueName === 'other';

        homeTeamSelect.style.display = isOtherLeague ? 'none' : 'block';
        awayTeamSelect.style.display = isOtherLeague ? 'none' : 'block';
        homeTeamInput.style.display = isOtherLeague ? 'block' : 'none';
        awayTeamInput.style.display = isOtherLeague ? 'block' : 'none';

        ['home-ppg', 'away-ppg', 'home-form', 'away-form', 'home-elo', 'away-elo'].forEach(id => document.getElementById(id).value = '');

        if (isOtherLeague) {
            homeTeamSelect.disabled = true;
            awayTeamSelect.disabled = true;
            homeTeamInput.value = ''; awayTeamInput.value = '';
            homeTeamInput.focus();
        } else {
            homeTeamInput.value = ''; awayTeamInput.value = '';
            
            // ★★★ [수정] allLeaguesData[leagueName]이 유효한지 확인 ★★★
            const leagueData = allLeaguesData[leagueName];
            if (!leagueData || !leagueData.teams) {
                 showMessage(`선택한 리그의 팀 데이터를 찾을 수 없습니다. API 로드 오류일 수 있습니다.`, 'error');
                 // 드롭다운을 비웁니다.
                 homeTeamSelect.innerHTML = '<option value="" disabled selected>홈팀 선택</option>';
                 awayTeamSelect.innerHTML = '<option value="" disabled selected>원정팀 선택</option>';
                 return;
            }
            
            homeTeamSelect.disabled = false;
            awayTeamSelect.disabled = false;
            homeTeamSelect.innerHTML = '<option value="" disabled selected>홈팀 선택</option>';
            awayTeamSelect.innerHTML = '<option value="" disabled selected>원정팀 선택</option>';
            
            const teams = leagueData.teams.sort((a, b) => a.name.localeCompare(b.name));
            teams.forEach(team => {
                homeTeamSelect.add(new Option(team.name, team.name));
                awayTeamSelect.add(new Option(team.name, team.name));
            });
        }
        
        // Clear Brier score on league change
        document.getElementById('team-brier-score-display').innerHTML = '<p>팀을 선택하면 최근 맞대결 또는 각 팀의 최근 경기 브라이어 점수를 표시합니다.</p>';
    });

    
    // [Phase 5] 팀 선택 시 데이터 자동 입력 및 Brier Score 업데이트
    const teamSelectHandler = () => {
        const leagueName = leagueSelect.value;
        const isOtherLeague = leagueName === 'other';
        const homeTeamName = isOtherLeague ? homeTeamInput.value.trim() : homeTeamSelect.value;
        const awayTeamName = isOtherLeague ? awayTeamInput.value.trim() : awayTeamSelect.value;

        if (homeTeamName && awayTeamName) {
            // ★★★ [수정] 팀 데이터 가져오기 로직 (allLeaguesData 사용) ★★★
            const teamsData = getCurrentTeamsData(leagueName, homeTeamName, awayTeamName, allLeaguesData);
            
            if (!teamsData || !teamsData.homeTeam || !teamsData.awayTeam) { 
                showMessage("팀 데이터를 가져오는 중 오류 발생", "error");
                return; 
            }
            const { homeTeam, awayTeam } = teamsData;

            // 1. Populate basic team data (using enriched data with default xG/ELO/PPG/Form)
            // .toFixed(2)로 소수점 2자리까지 표시
            homePpgInput.value = (homeTeam?.homePpg ?? homeTeam.ppg).toFixed(2);
            awayPpgInput.value = (awayTeam?.awayPpg ?? awayTeam.ppg).toFixed(2);
            homeFormInput.value = homeTeam.form_l5 || '';
            homeEloInput.value = homeTeam.elo || '';
            awayEloInput.value = awayTeam.elo || '';
            awayFormInput.value = awayTeam.form_l5 || '';
            
            // 2. Brier Score Logic (Hybrid Approach)
            const brierDisplay = document.getElementById('team-brier-score-display');
            const allRows = Array.from(resultsBody.querySelectorAll('tr'));
            let headToHeadFound = false;
            let headToHeadBrier = 'N/A';

            for (let i = allRows.length - 1; i >= 0; i--) {
                const row = allRows[i];
                if (row.dataset.analysis && row.dataset.poissonProbs && row.dataset.finalResult) {
                     try {
                        const analysisData = JSON.parse(row.dataset.analysis);
                        const rowHome = analysisData.homeTeam.name;
                        const rowAway = analysisData.awayTeam.name;

                        // Check if the row matches the selected teams (in either order)
                        if ((rowHome === homeTeamName && rowAway === awayTeamName) || (rowHome === awayTeamName && rowAway === homeTeamName)) {
                            const probs = JSON.parse(row.dataset.poissonProbs);
                            const finalResult = row.dataset.finalResult;
                            const singleBrierScore = calculateSingleBrierScore(probs, finalResult);
                            if (singleBrierScore !== null) {
                                headToHeadBrier = singleBrierScore.toFixed(3);
                                headToHeadFound = true;
                            }
                            break; // Found the most recent head-to-head
                        }
                    } catch (e) {
                         console.error("Error processing row for head-to-head Brier:", e);
                    }
                }
            }

            if (headToHeadFound) {
                 brierDisplay.innerHTML = `
                    <p>
                        <strong>${homeTeamName} vs ${awayTeamName} 최근 맞대결 Brier (HPL xG):</strong>
                        <span style="font-weight: bold; color: var(--primary-color);">${headToHeadBrier}</span>
                    </p>`;
            } else {
                // Fallback: Find the latest completed match for each team individually
                let homeBrierText = 'N/A';
                let awayBrierText = 'N/A';
                let homeFound = false;
                let awayFound = false;

                for (let i = allRows.length - 1; i >= 0 && (!homeFound || !awayFound); i--) {
                    const row = allRows[i];
                    if (row.dataset.analysis && row.dataset.poissonProbs && row.dataset.finalResult) {
                        try {
                            const analysisData = JSON.parse(row.dataset.analysis);
                            const probs = JSON.parse(row.dataset.poissonProbs);
                            const finalResult = row.dataset.finalResult;
                            const singleBrierScore = calculateSingleBrierScore(probs, finalResult);

                            if (!homeFound && (analysisData.homeTeam.name === homeTeamName || analysisData.awayTeam.name === homeTeamName)) {
                                if (singleBrierScore !== null) { homeBrierText = singleBrierScore.toFixed(3); }
                                homeFound = true;
                            }
                            if (!awayFound && (analysisData.homeTeam.name === awayTeamName || analysisData.awayTeam.name === awayTeamName)) {
                                if (singleBrierScore !== null) { awayBrierText = singleBrierScore.toFixed(3); }
                                awayFound = true;
                            }
                        } catch (e) {
                             console.error("Error processing row for individual Brier:", e);
                        }
                    }
                }

                // Update the display area with individual scores
                brierDisplay.innerHTML = `
                    <p>(최근 맞대결 기록 없음)</p>
                    <p>
                        <strong>${homeTeamName} 최근 경기 Brier (HPL xG):</strong>
                        <span style="font-weight: bold; color: var(--info-color);">${homeBrierText}</span>
                        |
                        <strong>${awayTeamName} 최근 경기 Brier (HPL xG):</strong>
                        <span style="font-weight: bold; color: var(--info-color);">${awayBrierText}</span>
                    </p>`;
            }
        } else {
             // Clear Brier score if not both teams are selected
             document.getElementById('team-brier-score-display').innerHTML = '<p>팀을 선택하면 최근 맞대결 또는 각 팀의 최근 경기 브라이어 점수를 표시합니다.</p>';
        }
    };
    
    // [수정] 배당 자동 입력 기능 추가
    homeTeamSelect.addEventListener('change', async () => {
        teamSelectHandler();
        // 두 팀이 모두 선택된 경우 배당 자동 입력
        const leagueName = leagueSelect.value;
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;
        
        if (leagueName && leagueName !== 'other' && homeTeamName && awayTeamName) {
            await fetchAndFillOdds(leagueName, homeTeamName, awayTeamName);
        }
    });
    
    awayTeamSelect.addEventListener('change', async () => {
        teamSelectHandler();
        // 두 팀이 모두 선택된 경우 배당 자동 입력
        const leagueName = leagueSelect.value;
        const homeTeamName = homeTeamSelect.value;
        const awayTeamName = awayTeamSelect.value;
        
        if (leagueName && leagueName !== 'other' && homeTeamName && awayTeamName) {
            await fetchAndFillOdds(leagueName, homeTeamName, awayTeamName);
        }
    });
    
    homeTeamInput.addEventListener('change', teamSelectHandler);
    awayTeamInput.addEventListener('change', teamSelectHandler);


    sortBtn.addEventListener('click', () => {
        let rows = Array.from(resultsBody.querySelectorAll('tr'));
         // Maintain selection state during sort
         const selectionState = {};
         rows.forEach(row => {
             const checkbox = row.querySelector('.select-row-checkbox');
             if (checkbox) selectionState[row.dataset.rowKey] = checkbox.checked;
         });

        // Separate rows based on selection
        let selectedRows = rows.filter(row => row.querySelector('.select-row-checkbox')?.checked);
        let unselectedRows = rows.filter(row => !row.querySelector('.select-row-checkbox')?.checked);

        // [수정] 새로운 정렬 기준 함수
        const sortCriteria = (a, b) => {
            // 1. 'manual' (수동)이 'manual'이 아닌 것(백테스팅)보다 우선
            if (a.dataset.analysisSource === 'manual' && b.dataset.analysisSource !== 'manual') {
                return -1; // a가 위로
            }
            if (a.dataset.analysisSource !== 'manual' && b.dataset.analysisSource === 'manual') {
                return 1; // b가 위로
            }
            // 2. analysisSource가 같으면 핵심 점수(내림차순)로 정렬
            return parseFloat(b.dataset.coreScore) - parseFloat(a.dataset.coreScore);
        };

        // Sort each group independently using the new criteria
        selectedRows.sort(sortCriteria);
        unselectedRows.sort(sortCriteria);

        resultsBody.innerHTML = '';
        // Append selected rows first, then unselected rows
        [...selectedRows, ...unselectedRows].forEach(row => resultsBody.appendChild(row));

         // Reapply selection state after sorting
         resultsBody.querySelectorAll('tr').forEach(row => {
             const checkbox = row.querySelector('.select-row-checkbox');
             if (checkbox && selectionState[row.dataset.rowKey]) {
                 checkbox.checked = true;
             }
         });
    });

    clearInputsBtn.addEventListener('click', () => {
        ['home-odds', 'draw-odds', 'away-odds'].forEach(id => document.getElementById(id).value = '');
    });

    // Moved getMaxProbOutcome function definition before addAnalysisRow
    const getMaxProbOutcome = (probs) => {
        if (!probs || typeof probs.home === 'undefined' || typeof probs.draw === 'undefined' || typeof probs.away === 'undefined') return 'N/A';
        const maxProb = Math.max(probs.home, probs.draw, probs.away);
        if (maxProb === 0) return 'N/A'; // Handle case where all probs are 0
        if (probs.home === maxProb) return '홈 승';
        if (probs.draw === maxProb) return '무승부';
        return '원정 승';
    };

    // ==================================================================
    // [전략 3, 4단계 적용] addAnalysisRow
    // ## MODIFIED: Added analysisSource tracking ##
    // 신규 O/U, BTTS 함수를 호출하고, 그 결과를 테이블(innerHTML)에 추가
    // 신규 결과를 calculateHybridPrediction에 전달
    // ==================================================================
    const addAnalysisRow = (analysisData) => {
        // ★★★ [수정] matchId를 analysisData에서 추출 ★★★
        const { homeTeam, awayTeam, homePpg, awayPpg, homeElo, awayElo, homeForm, awayForm, homeOdds, drawOdds, awayOdds, leagueName, finalResult, analysisSource, matchId } = analysisData; // Added analysisSource and matchId
        const newRow = document.createElement('tr');
        newRow.dataset.analysis = JSON.stringify(analysisData); // Keep original raw data
        newRow.dataset.analysisSource = analysisSource || 'unknown'; // Track if manual or backtest
        
        // ★★★ [수정] matchId를 row dataset에 저장 (결과 입력 시 식별용) ★★★
        if (matchId) {
            newRow.dataset.matchId = matchId;
        }

        if(finalResult) newRow.dataset.finalResult = finalResult;

        const rowKey = `exclude_${homeTeam.name}_vs_${awayTeam.name}_${Date.now()}`;
        newRow.dataset.rowKey = rowKey;

        // Ensure default drawPercent is used if missing
        const avgDrawPercent = ((homeTeam?.drawPercent ?? 25) + (awayTeam?.drawPercent ?? 25)) / 2;
        const osls = { homeOsl: calculateOSL(homePpg, awayPpg, 3, 0), drawOsl: calculateOSL(homePpg, awayPpg, 1, 1), awayOsl: calculateOSL(homePpg, awayPpg, 0, 3) };
        let scores = { home: calculateCoreScore(osls.homeOsl, homeOdds), draw: calculateCoreScore(osls.drawOsl, drawOdds), away: calculateCoreScore(osls.awayOsl, awayOdds) };
        const maxScore = Math.max(scores.home, scores.draw, scores.away);
        const oslBestPick = (maxScore > 0) ? (scores.home === maxScore ? '홈 승' : (scores.draw === maxScore ? '무승부' : '원정 승')) : 'N/A';

        // [수정] 리그 컨텍스트에 'league_avg_xg_total'이 포함될 것을 예상
        const leagueContext = (!allLeaguesData || !allLeaguesData[leagueName]) ?
            { drawRate: 0.25, avgGoalsHome: 1.5, avgGoalsAway: 1.2, currentMatchesPlayed: 10, league_avg_xg_total: 1.5 } :
            allLeaguesData[leagueName]?.leagueContext;

        // ★★★ [수정] 이변 지수 계산 시점: 행이 추가될 때, teamUpsetStats에서 최신 값을 가져옵니다.
        const homeUpsetScore = teamUpsetStats[homeTeam.name] || 0;
        const awayUpsetScore = teamUpsetStats[awayTeam.name] || 0;

        // [전략 2.1단계] xG 기반 푸아송 분석 (lambda 값 포함)
        const poissonAnalysis = getPoissonAnalysis(homeTeam, awayTeam, leagueContext);
        newRow.dataset.poissonProbs = JSON.stringify(poissonAnalysis); // HPL Poisson Probs

        // [전략 3단계] O/U 및 BTTS 계산 (푸아송 lambda 값 사용)
        const ouAnalysis = calculateOverUnder(poissonAnalysis.homeLambda, poissonAnalysis.homeLambda);
        const bttsAnalysis = calculateBTTS(poissonAnalysis.homeLambda, poissonAnalysis.awayLambda);
        newRow.dataset.ouProbs = JSON.stringify(ouAnalysis);
        newRow.dataset.bttsProbs = JSON.stringify(bttsAnalysis);

        const btProbs = calculateBradleyTerryPrediction({ homeElo, awayElo, homePpg, awayPpg, homeForm, awayForm, homeUpsetScore, awayUpsetScore, homeTeam, awayTeam });
        newRow.dataset.btProbs = JSON.stringify(btProbs); // BT Probs
        newRow.dataset.btPred = getMaxProbOutcome(btProbs); // BT Prediction

        const regressionProbs = calculateRegressionPrediction({ homeElo, awayElo, homePpg, awayPpg, osls, poissonAnalysis, avgDrawPercent, homeTeam, awayTeam });
        newRow.dataset.regressionProbs = JSON.stringify(regressionProbs); // Regression Probs
        newRow.dataset.regressionPred = getMaxProbOutcome(regressionProbs); // Regression Prediction

        const eloDiff = homeElo - awayElo;
        const ppgDiff = homePpg - awayPpg;
        const upsetScoreDiff = homeUpsetScore - awayUpsetScore;
        const fuzzyFeatures = [1, eloDiff, ppgDiff, upsetScoreDiff];
        const fuzzyPrediction = predictWithFuzzyModel(fuzzyFeatures);
        newRow.dataset.fuzzyPrediction = JSON.stringify(fuzzyPrediction); // Fuzzy Center/Spread

        const getPpgTrend = (team) => {
            if(!team || !team.prevPpg || team.prevPpg.length < 2) return '';
            if(team.prevPpg[team.prevPpg.length - 1] > team.prevPpg[team.prevPpg.length - 2]) return '📈';
            if(team.prevPpg[team.prevPpg.length - 1] < team.prevPpg[team.prevPpg.length - 2]) return '📉';
            return '';
        }

        let fuzzyDisplay = '훈련 필요';
        let fuzzyPredictionText = 'N/A';
        if (fuzzyPrediction.center !== 'N/A') {
            const center = fuzzyPrediction.center;
            const spread = fuzzyPrediction.spread;
            const lower = center - spread;
            const upper = center + spread;

            if (center > 1.5) fuzzyPredictionText = '홈 2+ 승';
            else if (center > 0.5) fuzzyPredictionText = '홈 1골 승';
            else if (center < -1.5) fuzzyPredictionText = '원정 2+ 승';
            else if (center < -0.5) fuzzyPredictionText = '원정 1골 승';
            else fuzzyPredictionText = '무승부';

            fuzzyDisplay = `<span style="font-weight: bold;">${fuzzyPredictionText}</span><br><span style="font-size:0.9em; color:#555;">(중심: ${center.toFixed(2)})<br>[${lower.toFixed(1)} ~ ${upper.toFixed(1)}]</span>`;
        }
        newRow.dataset.fuzzyPredText = fuzzyPredictionText; // Fuzzy Prediction Label

        let fuzzyInputForHybrid = 'N/A';
        if (fuzzyPredictionText.includes('홈')) fuzzyInputForHybrid = '홈 승';
        else if (fuzzyPredictionText.includes('원정')) fuzzyInputForHybrid = '원정 승';
        else if (fuzzyPredictionText.includes('무승부')) fuzzyInputForHybrid = '무승부';

        // ★★★ [수정] 이변 지수 임계값 (새로운 모멘텀 점수 기준) ★★★
        const UPSET_HIGHLIGHT_THRESHOLD = 5; // (MOMENTUM_POINTS * 3) 정도
        let homeUpsetDisplay = homeUpsetScore.toFixed(0);
        let awayUpsetDisplay = awayUpsetScore.toFixed(0);
        if (homeUpsetScore > UPSET_HIGHLIGHT_THRESHOLD) homeUpsetDisplay = `⚠️ ${homeUpsetDisplay}`;
        if (awayUpsetScore > UPSET_HIGHLIGHT_THRESHOLD) awayUpsetDisplay = `⚠️ ${awayUpsetDisplay}`;

        // [전략 4단계] O/U, BTTS 분석 결과를 종합 예측 함수에 전달
        const { prediction: finalPrediction, reason: consensusReason } = calculateHybridPrediction({
            osl: oslBestPick,
            regression: getMaxProbOutcome(regressionProbs),
            poisson: poissonAnalysis.primaryPrediction,
            bt: getMaxProbOutcome(btProbs),
            fuzzy: fuzzyInputForHybrid,
            upsetScore: homeUpsetScore - awayUpsetScore,
            ouProbs: ouAnalysis, // 신규 전달
            bttsProbs: bttsAnalysis // 신규 전달
        });

        const handicapPrediction = getFlexibleHandicapPrediction({regressionProbs, eloDiff, poissonAnalysis, finalPrediction, homeUpsetScore, awayUpsetScore, fuzzyPrediction});
        const sortedOsl = Object.entries(osls).sort(([,a],[,b]) => a-b);
        const secondLowestOutcomeKey = sortedOsl.length > 1 ? sortedOsl[1][0] : null;
        let cleanFinalPredictionForHighlighting = 'N/A';
        // [수정] O/U 텍스트 제거
        const cleanFinalPredText = finalPrediction.replace(/ \(Over.*\)| \(Under.*\)/g, '').trim();
        if (cleanFinalPredText.includes('홈 승')) cleanFinalPredictionForHighlighting = '홈 승';
        else if (cleanFinalPredText.includes('원정 승')) cleanFinalPredictionForHighlighting = '원정 승';
        else if (cleanFinalPredText.includes('무승부') || cleanFinalPredText.includes('(무)')) cleanFinalPredictionForHighlighting = '무승부';

        // ★★★ [수정 v1] row.dataset 저장 명확화 ★★★
        // 패턴 분석기에서 필요한 모든 필드를 저장
        newRow.dataset.leagueName = leagueName || (leagueContext?.name || 'Unknown');
        newRow.dataset.homeName = homeTeam?.name || 'Home';
        newRow.dataset.awayName = awayTeam?.name || 'Away';
        
        // 예측 결과
        newRow.dataset.finalPredClean = cleanFinalPredictionForHighlighting;  // "홈 승", "무승보", "원정 승"
        newRow.dataset.finalPred = cleanFinalPredictionForHighlighting;       // 호환성
        
        // 6개 모델 예측값 (백분율)
        newRow.dataset.poissonProbs = JSON.stringify({
            home: (poissonAnalysis?.homeWinProb || 0).toFixed(1),
            draw: (poissonAnalysis?.drawProb || 0).toFixed(1),
            away: (poissonAnalysis?.awayWinProb || 0).toFixed(1)
        });
        
        newRow.dataset.btProbs = JSON.stringify({
            home: btProbs?.home?.toFixed(1) || 0,
            draw: btProbs?.draw?.toFixed(1) || 0,
            away: btProbs?.away?.toFixed(1) || 0
        });
        
        newRow.dataset.regressionProbs = JSON.stringify({
            home: regressionProbs?.home?.toFixed(1) || 0,
            draw: regressionProbs?.draw?.toFixed(1) || 0,
            away: regressionProbs?.away?.toFixed(1) || 0
        });
        
        // 기타 필드들
        newRow.dataset.coreScore = maxScore.toFixed(2);
        newRow.dataset.oslPred = oslBestPick;
        newRow.dataset.osls = JSON.stringify(osls);
        newRow.dataset.poissonPred = poissonAnalysis?.primaryPrediction || 'N/A';
        newRow.dataset.handicapPred = handicapPrediction;
        newRow.dataset.btPred = getMaxProbOutcome(btProbs) || 'N/A';
        newRow.dataset.ouPreds = JSON.stringify(ouAnalysis || {});
        newRow.dataset.bttsPreds = JSON.stringify(bttsAnalysis || {});
        
        // 특성 벡터 저장 (PatternAnalyzer에서 필요)
        newRow.dataset.analysis = JSON.stringify({
            homeElo: homeElo || 0,
            awayElo: awayElo || 0,
            homeUpsetScore: homeUpsetScore || 0,
            awayUpsetScore: awayUpsetScore || 0,
            homeTeamName: (homeTeam && typeof homeTeam === 'object') ? homeTeam.name : '',
            awayTeamName: (awayTeam && typeof awayTeam === 'object') ? awayTeam.name : ''
        });
        
        // 경기 결과는 아직 없음
        newRow.dataset.finalResult = null;
        
        // --- [신규] PatternAnalyzer.js 연동 Hook ---
        let warningMessage = ""; // 경고 메시지 변수 초기화

        // PatternAnalyzer.js가 준비되었는지 확인
        if (typeof patternDB !== 'undefined' && patternDB.isReady) {
            try {
                // ✅ [수정] newRow.dataset 대신 newRow (TR 요소) 전달
                warningMessage = patternDB.verify(newRow);
            } catch (e) {
                console.error("PatternDB 검증 중 오류:", e);
            }
        }
        // --- [신규] Hook 종료 ---


        // [전략 3단계] innerHTML에 신규 O/U, BTTS <td> 2개 추가
        // [신규] '종합 예측' <td>에 warningMessage 변수 추가
        
        // [신규] 홈/원정 편향 추적 기록
        (function(){
            try{
                const pickMap = {'홈 승':'home','무승부':'draw','원정 승':'away'};
                const pickKey = pickMap[cleanFinalPredictionForHighlighting];
                if (pickKey) {
                    const leagueName = (typeof leagueSelect !== 'undefined' && leagueSelect) ? leagueSelect.value : (leagueContext?.name || 'Unknown');
                    recordPredictionPick({ leagueName, pick: pickKey });
                    renderBiasReport();
                }
            }catch(e){ console.warn('bias tracking hook error:', e); }
        })();
newRow.innerHTML = `
            <td data-label="관리"><input type="checkbox" class="select-row-checkbox" title="리포트용 선택"><button class="delete-row-btn" title="결과 삭제">삭제</button></td>
            <td data-label="경기 (ELO)">${homeTeam.name} <span class="ppg-trend ${getPpgTrend(homeTeam) === '📈' ? 'ppg-up' : (getPpgTrend(homeTeam) === '📉' ? 'ppg-down' : '')}">${getPpgTrend(homeTeam)}</span> (${homeElo})<br>vs<br>${awayTeam.name} <span class="ppg-trend ${getPpgTrend(awayTeam) === '📈' ? 'ppg-up' : (getPpgTrend(awayTeam) === '📉' ? 'ppg-down' : '')}">${getPpgTrend(awayTeam)}</span> (${awayElo})</td>
            <td data-label="최근 폼">${formatFormString(homeForm)}<br>${formatFormString(awayForm)}</td>
            <td data-label="이변 지수"><span>${homeUpsetDisplay}</span><br><span>${awayUpsetDisplay}</span></td>
            <td data-label="OSL 핵심점수" class="score-cell">${oslBestPick} (${maxScore.toFixed(2)})</td>
            <td data-label="BT 모델">H: ${btProbs.home.toFixed(1)}%<br>D: ${btProbs.draw.toFixed(1)}%<br>A: ${btProbs.away.toFixed(1)}%</td>
            <td data-label="회귀 모델">H: ${regressionProbs.home.toFixed(1)}%<br>D: ${regressionProbs.draw.toFixed(1)}%<br>A: ${regressionProbs.away.toFixed(1)}%</td>
            <td data-label="퍼지 회귀 (골득실)">${fuzzyDisplay}</td>
            <td data-label="종합 예측" class="analysis-cell">
                <span class="consensus-cell">${finalPrediction}</span>
                <span class="consensus-reasoning">${consensusReason}</span>
                <!-- [신규] 경고 메시지가 있을 경우에만 이 span이 생성됨 -->
                ${warningMessage ? `<span style="color: red; font-weight: bold; font-size: 0.9em; display: block; margin-top: 5px; border-top: 1px solid #fdd; padding-top: 5px;">${warningMessage}</span>` : ''}
            </td>
            <td data-label="핸디캡 예측" class="analysis-cell">${handicapPrediction}</td>
            <td data-label="HPL xG-푸아송">H: ${poissonAnalysis.homeWinProb.toFixed(1)}%<br>D: ${poissonAnalysis.drawProb.toFixed(1)}%<br>A: ${poissonAnalysis.awayWinProb.toFixed(1)}%</td>

            <!-- [전략 3단계 신규 셀 1] O/U 2.5 -->
            <td data-label="O/U 2.5 (xG)">
                <span style="color: #3498db; font-weight: bold;">${ouAnalysis.over_2_5_prob > ouAnalysis.under_2_5_prob ? '오버' : '언더'}</span><br>
                (${ouAnalysis.over_2_5_prob.toFixed(1)}%)
            </td>

            <!-- [전략 3단계 신규 셀 2] BTTS -->
            <td data-label="BTTS (xG)">
                <span style="color: ${bttsAnalysis.btts_yes_prob > 50 ? '#27ae60' : '#e74c3c'}; font-weight: bold;">${bttsAnalysis.btts_yes_prob > bttsAnalysis.btts_no_prob ? 'Yes' : 'No'}</span><br>
                (${bttsAnalysis.btts_yes_prob.toFixed(1)}%)
            </td>

            <td data-label="홈 OSL" class="${secondLowestOutcomeKey === 'homeOsl' ? 'second-lowest-osl' : ''}">${osls.homeOsl.toFixed(1)}</td>
            <td data-label="무 OSL" class="${secondLowestOutcomeKey === 'drawOsl' ? 'second-lowest-osl' : ''}">${osls.drawOsl.toFixed(1)}</td>
            <td data-label="원 OSL" class="${secondLowestOutcomeKey === 'awayOsl' ? 'second-lowest-osl' : ''}">${osls.awayOsl.toFixed(1)}</td>
            <td data-label="결과">${finalResult ? finalResult : '<button class="enter-result-btn" style="padding: 4px 8px; font-size: 0.9em; background-color: #9b59b6;">입력</button>'}</td>
        `;
        
        // ★★★ [수정 시작] ★★★
        // [수정] analysisSource에 따라 추가 위치 변경
        if (analysisSource === 'manual') {
            resultsBody.prepend(newRow); // 'manual' (수동 입력)이면 맨 위에 추가
        } else {
            resultsBody.appendChild(newRow); // 그 외(백테스팅)는 맨 아래에 추가
        }
        // ★★★ [수정 종료] ★★★

        const savedState = localStorage.getItem(rowKey);
        const checkbox = newRow.querySelector('.select-row-checkbox');
        
        if (checkbox && savedState === 'true') {
            checkbox.checked = true;
        }

        if(finalResult) {
            const [homeScore, awayScore] = finalResult.split('-').map(Number);
            processAndHighlightResult(newRow, homeScore, awayScore);

            // ==================================================================
            // [Phase 1] 백테스팅 실행 시(finalResult가 있을 때) 데이터 수집
            // ==================================================================
            // 수집에 필요한 모든 데이터를 dataForTraining 객체로 구성
            const dataForTraining = {
                homeElo, awayElo, homePpg, awayPpg, osls, poissonAnalysis, avgDrawPercent,
                homeUpsetScore, awayUpsetScore,
                homeTeam, // xG 변수를 포함한 homeTeam 객체
                awayTeam  // xG 변수를 포함한 awayTeam 객체
            };
            const actualResult = homeScore > awayScore ? '홈 승' : (homeScore < awayScore ? '원정 승' : '무승부');

            // 헬퍼 함수 호출
            collectTrainingData(dataForTraining, actualResult);
        }

        // ✅ [신규] 자동 퍼지 회귀 재훈련
        // 경기 결과가 입력되면 자동으로 5개 단위로 재훈련
        if (finalResult && finalResult !== 'null') {
            const completedRows = Array.from(resultsBody.querySelectorAll('tr'))
                .filter(row => row.dataset.finalResult &&
                              row.dataset.finalResult !== 'null' &&
                              row.dataset.finalResult.includes('-'));

            // 5개 이상 경기 결과가 있고, 5의 배수일 때 자동 재훈련
            if (completedRows.length >= 5 && completedRows.length % 5 === 0) {
                console.log(`🔄 퍼지 모델 자동 재훈련 (${completedRows.length}개 경기 데이터)...`);
                try {
                    trainFuzzyRegression(false);
                } catch (e) {
                    console.error('❌ 자동 재훈련 실패:', e);
                }
            }
        }

        updateSummary();
        calculateBrierScore(); // This also triggers updateSynergyAnalysis
    };

    addResultBtn.addEventListener('click', () => {
        const leagueName = leagueSelect.value;
        const isOtherLeague = leagueName === 'other';
        const homeTeamName = isOtherLeague ? homeTeamInput.value.trim() : homeTeamSelect.value;
        const awayTeamName = isOtherLeague ? awayTeamInput.value.trim() : awayTeamSelect.value;
        if ((isOtherLeague && (homeTeamName === '' || awayTeamName === '')) || (!isOtherLeague && (homeTeamName === "" || awayTeamName === ""))) { showMessage("팀을 선택 또는 입력해주세요."); return; }
        if (homeTeamName === awayTeamName) { showMessage("홈팀과 원정팀은 같을 수 없습니다."); return; }
        const homePpg = parseFloat(homePpgInput.value), awayPpg = parseFloat(awayPpgInput.value);
        const homeElo = parseFloat(homeEloInput.value), awayElo = parseFloat(awayEloInput.value);
        const homeOdds = parseFloat(document.getElementById('home-odds').value), drawOdds = parseFloat(document.getElementById('draw-odds').value), awayOdds = parseFloat(document.getElementById('away-odds').value);
        if ([homePpg, awayPpg, homeElo, awayElo, homeOdds, drawOdds, awayOdds].some(v => isNaN(v) || v < 0)) { showMessage("PPG, ELO, 배당률은 0 이상의 숫자로 입력해야 합니다."); return; }
        const homeForm = homeFormInput.value.toUpperCase(), awayForm = awayFormInput.value.toUpperCase();
        const formRegex = /^[WDL]{0,5}$/;
        if ((homeForm && !formRegex.test(homeForm)) || (awayForm && !formRegex.test(awayForm))) { showMessage("최근 5경기 성적을 'W', 'D', 'L'을 사용하여 5글자 이하로 입력해주세요."); return; }
        
        // [Phase 5] API 데이터로 팀 정보 획득
        const teamsData = getCurrentTeamsData(leagueName, homeTeamName, awayTeamName);
        if (!teamsData) { showMessage("선택한 팀 데이터를 찾을 수 없습니다."); return; }
        
        // ★★★ [수정] matchId 및 date 추가 ★★★
        const matchId = Date.now();
        const matchDate = new Date().toISOString();

        // 1. 경기 정보를 객체로 구성 (수동 입력)
        const newManualFixture = {
            homeTeamName: homeTeamName,
            awayTeamName: awayTeamName,
            homeOdds: homeOdds,
            drawOdds: drawOdds,
            awayOdds: awayOdds,
            homeScore: null, 
            awayScore: null,
            leagueName: leagueName,
            matchId: matchId, // ★★★
            date: matchDate    // ★★★
        };

        // ★★★ [수정] Fix B-1: 행을 추가하기 전에 이변 지수를 먼저 계산합니다. ★★★
        // (결과가 있는 기존 데이터 기준)
        calculateAllUpsetScores();

        // 2. 분석 행 추가 (수동 입력은 결과가 없으므로 finalResult: null)
        // ★★★ [수정] matchId 전달 ★★★
        addAnalysisRow({ 
            ...teamsData, homePpg, awayPpg, homeElo, awayElo, homeForm, awayForm, 
            homeOdds, drawOdds, awayOdds, leagueName, finalResult: null, 
            analysisSource: 'manual', 
            matchId: matchId, // ★★★
            date: matchDate   // ★★★
        });
        
        // ★★★ [수정] manualFixtures에 추가 (unshift로 맨 앞에 추가) ★★★
        manualFixtures.unshift(newManualFixture);

        // 4. ELO/Upset 점수 업데이트 (결과가 없으므로 지금 호출할 필요 없음)
        // calculateAllUpsetScores(); // 결과 입력 시 호출되도록 합니다.
    });

    // Event listener for checkboxes
    resultsBody.addEventListener('click', (e) => {
        // Handle row selection checkboxes
        if (e.target.classList.contains('select-row-checkbox')) {
            const row = e.target.closest('tr');
            const rowKey = row.dataset.rowKey;
             // Update localStorage for selection state
            if (rowKey) {
                 try {
                     localStorage.setItem(rowKey, e.target.checked);
                 } catch (err) {
                     console.error("Error saving selection to localStorage", err);
                 }
            }
             // Update select all checkbox state
            const allCheckboxes = resultsBody.querySelectorAll('.select-row-checkbox');
            const allChecked = Array.from(allCheckboxes).every(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
        }
        // Handle delete button
        else if (e.target.classList.contains('delete-row-btn')) {
            const row = e.target.closest('tr');
            const rowKey = row.dataset.rowKey;
            
            // 수동 입력된 경기는 manualFixtures에서도 제거
            const analysisData = JSON.parse(row.dataset.analysis);
            
            // ★★★ [수정] matchId를 사용하여 manualFixtures에서 제거
            const matchIdToRemove = parseInt(row.dataset.matchId);
            if (analysisData.analysisSource === 'manual' && matchIdToRemove) {
                manualFixtures = manualFixtures.filter(f => f.matchId !== matchIdToRemove);
            }
            
            if (rowKey) {
                try {
                    localStorage.removeItem(rowKey); // Remove selection state on delete
                } catch (err) {
                     console.error("Error removing from localStorage", err);
                }
            }
            row.remove();
            updateSummary();
            calculateBrierScore(); // This also triggers updateSynergyAnalysis
            calculateAllUpsetScores(); // 이변 지수 재계산
             // Update select all checkbox state after deletion
            const allCheckboxes = resultsBody.querySelectorAll('.select-row-checkbox');
            const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
             selectAllCheckbox.checked = allChecked;
        }
        // Handle enter result button
        else if (e.target.classList.contains('enter-result-btn')) {
            currentRowToUpdate = e.target.closest('tr');
            resultModal.style.display = 'block';
            document.getElementById('home-score').focus();
        }
    });
    // Event listener for select all checkbox
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const rowCheckboxes = resultsBody.querySelectorAll('.select-row-checkbox');
        rowCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
            // Update localStorage for each row
            const row = checkbox.closest('tr');
            const rowKey = row.dataset.rowKey;
            if (rowKey) {
                try {
                    localStorage.setItem(rowKey, isChecked);
                } catch (err) {
                     console.error("Error saving selection to localStorage", err);
                }
            }
        });
    });

    function closeResultModal() {
        resultModal.style.display = 'none';
        resultForm.reset();
        currentRowToUpdate = null;
    }
    closeResultModalBtn.onclick = closeResultModal;

    window.onclick = (event) => {
        if (event.target == resultModal) closeResultModal();
    }

    resultForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!currentRowToUpdate) return;
        const homeScore = parseInt(document.getElementById('home-score').value);
        const awayScore = parseInt(document.getElementById('away-score').value);
        if (isNaN(homeScore) || isNaN(awayScore) || homeScore < 0 || awayScore < 0) {
            showMessage("유효한 점수를 입력하세요.", "warning"); return;
        }
        
        const resultText = `${homeScore}-${awayScore}`;
        
        // 1. row 업데이트 및 하이라이트
        currentRowToUpdate.dataset.finalResult = resultText;
        currentRowToUpdate.cells[currentRowToUpdate.cells.length - 1].textContent = resultText; 
        
        let analysisData = JSON.parse(currentRowToUpdate.dataset.analysis);
        analysisData.finalResult = resultText;
        currentRowToUpdate.dataset.analysis = JSON.stringify(analysisData);
        processAndHighlightResult(currentRowToUpdate, homeScore, awayScore);
        
        // 2. 수동 입력 경기 목록(manualFixtures)의 결과 업데이트 및 이변 지수 재계산
        if (analysisData.analysisSource === 'manual') {
            // ★★★ [수정] matchId를 사용하여 정확한 fixture 업데이트
            const matchIdToUpdate = parseInt(currentRowToUpdate.dataset.matchId);
            const index = manualFixtures.findIndex(f => f.matchId === matchIdToUpdate);
            
            if (index !== -1) {
                // 수동 입력 목록에 결과 점수 반영
                manualFixtures[index].homeScore = homeScore;
                manualFixtures[index].awayScore = awayScore;
                // ★★★ [수정] odds도 갱신 (addAnalysisRow 시점의 odds를 사용)
                manualFixtures[index].homeOdds = analysisData.homeOdds;
                manualFixtures[index].drawOdds = analysisData.drawOdds;
                manualFixtures[index].awayOdds = analysisData.awayOdds;
            }
        }
        
        calculateAllUpsetScores(); // 업데이트된 수동 결과를 포함하여 이변 점수 재계산

        // ★★★ [수정] Fix B-2: 갱신된 이변 지수를 테이블 전체에 반영 ★★★
        updateAllVisibleUpsetScores();

        closeResultModal();
        
        // Crucial call to update Brier display and synergy analysis after result is entered
        teamSelectHandler();
        calculateBrierScore(); // Explicitly call to update synergy after manual result entry
    });

    // ==================================================================
    // [전략 3단계 적용] processAndHighlightResult
    // 신규 O/U, BTTS 셀의 예측 결과를 하이라이트
    // OSL 셀 인덱스 수정 (11,12,13 -> 13,14,15)
    // ==================================================================
    function processAndHighlightResult(row, homeScore, awayScore) {
        let actualResult = homeScore > awayScore ? '홈 승' : (homeScore < awayScore ? '원정 승' : '무승부');
        const highlightCell = (cell, predicted, actual) => {
            if (!cell) return; // Add safety check for cell existence
            cell.classList.remove('correct-prediction', 'incorrect-prediction');
            if (!predicted || predicted === 'N/A') return;
            let cleanPredicted = predicted;
            // [수정] O/U 텍스트 제거
            cleanPredicted = cleanPredicted.replace(/🔥 |🎯 |🤝 | \(상승세\)|✅ |⚠️ |⚖️ | \(Over.*\)| \(Under.*\)/g, '').trim();
            if (predicted.includes('홈')) cleanPredicted = '홈 승';
            else if (predicted.includes('원정')) cleanPredicted = '원정 승';
            else if (predicted.includes('무승부')) cleanPredicted = '무승부';
            cell.classList.add(cleanPredicted.includes(actual) ? 'correct-prediction' : 'incorrect-prediction');
        };

        highlightCell(row.cells[4], row.dataset.oslPred, actualResult);
        highlightCell(row.cells[5], row.dataset.btPred, actualResult);
        highlightCell(row.cells[6], row.dataset.regressionPred, actualResult);
        highlightCell(row.cells[7], row.dataset.fuzzyPredText, actualResult);
        highlightCell(row.cells[8], row.dataset.finalPred, actualResult);
        highlightCell(row.cells[10], row.dataset.poissonPred, actualResult);

        // [전략 3단계] O/U, BTTS 하이라이트 추가
        try {
            // O/U 2.5 (Cell 11)
            const ouCell = row.cells[11];
            if (ouCell && row.dataset.ouProbs) {
                const ouProbs = JSON.parse(row.dataset.ouProbs);
                const actualTotalGoals = homeScore + awayScore;
                const predictedOU = ouProbs.over_2_5_prob > ouProbs.under_2_5_prob ? 'Over' : 'Under';
                const actualOU = actualTotalGoals > 2.5 ? 'Over' : 'Under';
                ouCell.classList.add(predictedOU === actualOU ? 'correct-prediction' : 'incorrect-prediction');
            }

            // BTTS (Cell 12)
            const bttsCell = row.cells[12];
            if (bttsCell && row.dataset.bttsProbs) {
                const bttsProbs = JSON.parse(row.dataset.bttsProbs);
                const predictedBTTS = bttsProbs.btts_yes_prob > bttsProbs.btts_no_prob ? 'Yes' : 'No';
                const actualBTTS = homeScore > 0 && awayScore > 0 ? 'Yes' : 'No';
                bttsCell.classList.add(predictedBTTS === actualBTTS ? 'correct-prediction' : 'incorrect-prediction');
            }
        } catch (e) {
            console.error("Error highlighting O/U or BTTS cells:", e);
        }

        // [수정] OSL 셀 인덱스 변경 (11,12,13 -> 13,14,15)
        const homeOslCell = row.cells[13];
        const drawOslCell = row.cells[14];
        const awayOslCell = row.cells[15];
        [homeOslCell, drawOslCell, awayOslCell].forEach(cell => {
             if (cell) cell.classList.remove('correct-prediction', 'incorrect-prediction');
        });
        if (homeOslCell) homeOslCell.classList.add(actualResult === '홈 승' ? 'correct-prediction' : 'incorrect-prediction');
        if (drawOslCell) drawOslCell.classList.add(actualResult === '무승부' ? 'correct-prediction' : 'incorrect-prediction');
        if (awayOslCell) awayOslCell.classList.add(actualResult === '원정 승' ? 'correct-prediction' : 'incorrect-prediction');


        const handicapCell = row.cells[9];
        if (handicapCell) {
            const handicapPred = row.dataset.handicapPred;
            handicapCell.classList.remove('correct-prediction', 'incorrect-prediction');
            if (handicapPred && handicapPred !== '핸디캡 없음') {
                const parts = handicapPred.split(' ');
                // Ensure parts[2] and parts[4] exist before parsing/checking
                if (parts.length > 4) {
                    const handicapValue = parseFloat(parts[2]);
                    if (!isNaN(handicapValue)) { // Check if handicapValue is a valid number
                        const adjustedHomeScore = homeScore + handicapValue;
                        const actualHandicapOutcome = adjustedHomeScore > awayScore ? '승' : '패'; // Simplified: assumes no draw for handicap
                        if (parts[4] === actualHandicapOutcome) {
                            handicapCell.classList.add('correct-prediction');
                        } else {
                            handicapCell.classList.add('incorrect-prediction');
                        }
                    }
                }
            }
        }
        // calculateBrierScore(); // This is called after processing result in the submit handler now
    }

    // ==================================================================
    // [Phase 5] 백테스팅 리그 목록 채우기 (로컬에 로드된 API 리그만)
    // ==================================================================
    function populateBacktestLeagues() {
        backtestLeagueSelect.innerHTML = '<option value="" disabled selected>Select League for Backtesting</option>';
        // API에서 로드된 리그 이름만 가져옴 (other 제외)
        const leagues = Object.keys(allLeaguesData).filter(name => name !== 'other').sort();
        
        if (leagues.length === 0) {
            backtestLeagueSelect.innerHTML = '<option value="" disabled>API에서 로드된 리그 데이터 없음</option>';
            fixtureList.innerHTML = '<p style="text-align: center; color: #888;">백테스팅할 경기 데이터가 없습니다.</p>';
            return;
        }
        leagues.forEach(leagueName => {
            backtestLeagueSelect.add(new Option(leagueName, leagueName));
        });
        
        fixtureList.innerHTML = '<p style="text-align: center; color: #888;">상단에서 리그를 선택하면 경기 목록이 표시됩니다.</p>';
    }

    // ==================================================================
    // [Phase 5] 백테스팅 경기 목록 로드 (API 호출 필요)
    // ==================================================================
    async function populateFixturesForLeague(leagueName) {
        fixtureList.innerHTML = '<p style="text-align: center; color: #888;">경기 데이터 로드 중...</p>';
        const compId = competitionMap[leagueName];
        
        if (!compId) {
            fixtureList.innerHTML = `<p style="text-align: center; color: #888;">리그 ID를 찾을 수 없습니다.</p>`;
            return;
        }
        
        // API 호출 및 매치 파싱 (api-sports.io 기준)
        try {
            // FINISHED 상태의 매치만 로드하여 백테스팅에 사용
            // api-sports.io는 시즌이 필요합니다.
            const matchesResponse = await fetchData(`/fixtures?league=${compId}&season=${CURRENT_SEASON}&status=FT`);
            
            parsedFixtures[leagueName] = [];
            
            if (matchesResponse.response && matchesResponse.response.length > 0) {
                
                // ★★★ [수정] 최신 경기가 상단에 오도록 API 응답을 역순으로 순회 ★★★
                for (let i = matchesResponse.response.length - 1; i >= 0; i--) {
                    const match = matchesResponse.response[i];
                    
                    if (match.fixture.status.short === 'FT' && match.score.fulltime.home !== null) {
                        
                         // api-sports.io는 배당률을 별도 엔드포인트(/odds)로 제공하지만,
                         // 여기서는 백테스팅을 위해 임시 값을 사용합니다. (Odds API 호출은 Rate Limit 소모가 큼)
                        const homeOdds = 2.5, drawOdds = 3.3, awayOdds = 2.8; 
                        
                        parsedFixtures[leagueName].push({
                            homeTeamName: match.teams.home.name,
                            awayTeamName: match.teams.away.name,
                            homeOdds: homeOdds,
                            drawOdds: drawOdds,
                            awayOdds: awayOdds,
                            homeScore: match.score.fulltime.home,
                            awayScore: match.score.fulltime.away,
                            matchId: match.fixture.id, // 추후 Match ID를 활용할 수 있도록 추가
                            leagueName: leagueName, // ★★★ 퍼지 훈련 시 리그 컨텍스트를 알기 위해 추가
                            date: match.fixture.date // ★★★ 이변 지수 시간 정렬을 위해 추가
                        });
                    }
                }
                // ★★★ [수정] 끝 ★★★
            }
            
            // ★★★ [수정] Fix A: 백테스팅 경기 목록 파싱 후 이변 지수 계산 ★★★
            calculateAllUpsetScores();

            // UI에 목록 표시
            fixtureList.innerHTML = ''; // Clear previous list
            const leagueData = parsedFixtures[leagueName];
            
            if (leagueData.length === 0) {
                fixtureList.innerHTML = `<p style="text-align: center; color: #888;">${leagueName}에 대한 완료된 경기 데이터가 없습니다.</p>`;
                return;
            }

            // 백테스팅용 데이터 초기화 (팀 스탯을 리그 시작 상태로 되돌림)
            backtestingData[leagueName] = JSON.parse(JSON.stringify(allLeaguesData[leagueName]));
            
            // ★★★ [수정] leagueData는 이미 최신순이므로, forEach와 appendChild를 그대로 사용 ★★★
            leagueData.forEach(fixture => {
                const item = document.createElement('div');
                item.className = 'fixture-item cursor-pointer p-2 hover:bg-gray-100 rounded flex justify-between items-center';
                item.dataset.matchId = fixture.matchId;
                item.innerHTML = `<span class="fixture-teams">${fixture.homeTeamName} vs ${fixture.awayTeamName}</span><span class="fixture-result text-gray-600">${fixture.homeScore} - ${fixture.awayScore}</span>`;
                item.onclick = () => {
                    // 이미 실행된 경기인지 확인
                    if (item.classList.contains('bg-green-100')) {
                        showMessage("이미 백테스팅을 실행한 경기입니다.", "info", "backtest-message-box");
                        return;
                    }
                    runAutoAnalysis(leagueName, fixture);
                    item.classList.add('bg-green-100'); // Light green flash
                    setTimeout(() => { item.classList.remove('bg-green-100'); }, 1000);
                };
                fixtureList.appendChild(item); // 최신 항목이 먼저 추가됨
            });
            
            showMessage(`${leagueName}의 완료된 ${leagueData.length}경기 로드 완료.`, "success", "backtest-message-box");

        } catch (e) {
            console.error("Error loading fixtures from API:", e);
            showMessage(`경기 목록 로드 실패: ${e.message}`, "error", "backtest-message-box");
            fixtureList.innerHTML = `<p style="text-align: center; color: #888;">경기 목록을 로드하는 중 오류가 발생했습니다.</p>`;
        }
    }


    backtestLeagueSelect.addEventListener('change', (e) => {
        const selectedLeague = e.target.value;
        if (selectedLeague) {
            populateFixturesForLeague(selectedLeague);
        } else {
            fixtureList.innerHTML = '<p style="text-align: center; color: #888;">상단에서 리그를 선택하세요.</p>';
        }
    });
    
    // [Phase 5] 전체 실행 체크박스 리스너
    backtestAllCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;
        const leagueName = backtestLeagueSelect.value;
        
        if (isChecked && leagueName) {
            const leagueFixtures = parsedFixtures[leagueName];
            if (!leagueFixtures || leagueFixtures.length === 0) {
                 showMessage("선택된 리그에 백테스팅할 경기가 없습니다.", "warning", "backtest-message-box");
                 backtestAllCheckbox.checked = false;
                 return;
            }
            
            // [Phase 5] confirm() 대신 custom message 사용
            showMessage("전체 백테스팅을 시작합니다. 완료될 때까지 기다려주세요...", "info", "backtest-message-box");
            
            backtestSpinner.style.display = 'inline-block';
            await runAllAutoAnalysis(leagueName, leagueFixtures);
            backtestSpinner.style.display = 'none';
            showMessage(`${leagueName} 백테스팅 전체 실행 완료.`, "success", "backtest-message-box");
            backtestAllCheckbox.checked = false;
            
        }
    });

    // [Phase 5] 전체 자동 분석 실행 함수
    async function runAllAutoAnalysis(leagueName, fixtures) {
        // 백테스팅 데이터 초기화
        backtestingData[leagueName] = JSON.parse(JSON.stringify(allLeaguesData[leagueName]));
        
        // ★★★ [수정] Fix A (보강): 전체 실행 시 이변 지수가 최신 상태(백테스팅+수동)인지 확인
        calculateAllUpsetScores();

        // UI 리스트의 모든 항목을 가져와서 실행 마크를 초기화
        const fixtureItems = fixtureList.querySelectorAll('.fixture-item');
        fixtureItems.forEach(item => item.classList.remove('bg-green-100'));
        
        for (let i = 0; i < fixtures.length; i++) {
            const fixture = fixtures[i];
            
            // UI에 로딩 상태 표시
            const uiItem = fixtureList.querySelector(`[data-match-id="${fixture.matchId}"]`);
            if (uiItem) {
                 uiItem.style.backgroundColor = '#fdf6e3'; // Yellowish background for processing
            }

            runAutoAnalysis(leagueName, fixture);
            
            // UI 업데이트 및 완료 표시
            if (uiItem) {
                uiItem.style.backgroundColor = ''; // Remove processing background
                uiItem.classList.add('bg-green-100'); // Mark as executed
            }

            // 너무 빠른 속도 방지를 위해 잠시 대기
            await new Promise(resolve => setTimeout(resolve, 50)); 
        }
    }


    const runAutoAnalysis = (leagueName, fixture) => {
        // [수정됨] backtestingData가 없을 수도 있으므로 확인
        if (!backtestingData || !backtestingData[leagueName]) {
             showMessage(`백테스팅 데이터가 초기화되지 않았습니다: ${leagueName}`, "error", "backtest-message-box");
             return;
        }
        
        // 1. 현재 시점의 팀 데이터를 백테스팅 데이터에서 가져옴
        const teamsData = getCurrentTeamsData(leagueName, fixture.homeTeamName, fixture.awayTeamName, backtestingData);
        if (!teamsData) {
            showMessage(`${fixture.homeTeamName} 또는 ${fixture.awayTeamName} 팀 데이터를 찾을 수 없습니다.`, "warning", "backtest-message-box"); return;
        }
        
        const { homeTeam: homeTeamData, awayTeam: awayTeamData } = teamsData;
        
        // 2. 분석 행 추가
        // PPG/ELO/Form은 백테스팅 데이터에서 가져온 '현재 시점'의 값이어야 합니다.
        addAnalysisRow({ 
            homeTeam: homeTeamData, 
            awayTeam: awayTeamData, 
            homePpg: homeTeamData.homePpg, 
            awayPpg: awayTeamData.awayPpg, 
            homeElo: homeTeamData.elo, 
            awayElo: awayTeamData.elo, 
            homeForm: homeTeamData.form_l5, 
            awayForm: awayTeamData.form_l5, 
            homeOdds: fixture.homeOdds, 
            drawOdds: fixture.drawOdds, 
            awayOdds: fixture.awayOdds, 
            leagueName, 
            finalResult: `${fixture.homeScore}-${fixture.awayScore}`, 
            analysisSource: 'backtest',
            matchId: fixture.matchId, // ★★★
            date: fixture.date       // ★★★
        });

        // 3. ELO 및 PPG를 업데이트하여 다음 경기 분석에 반영
        const kFactor = 20;
        let homeActual = fixture.homeScore > fixture.awayScore ? 1 : (fixture.homeScore === fixture.awayScore ? 0.5 : 0);
        const homeExpected = 1 / (1 + Math.pow(10, (awayTeamData.elo - (homeTeamData.elo + 100)) / 400)); // Added home advantage to ELO calculation

        // Find teams in backtesting data to update
        const homeTeamIndex = backtestingData[leagueName].teams.findIndex(t => t.name === homeTeamData.name);
        const awayTeamIndex = backtestingData[leagueName].teams.findIndex(t => t.name === awayTeamData.name);

        if (homeTeamIndex !== -1 && awayTeamIndex !== -1) {
            const currentHomeElo = backtestingData[leagueName].teams[homeTeamIndex].elo;
            const currentAwayElo = backtestingData[leagueName].teams[awayTeamIndex].elo;
            
            // ELO 업데이트
            backtestingData[leagueName].teams[homeTeamIndex].elo = Math.round(currentHomeElo + kFactor * (homeActual - homeExpected));
            backtestingData[leagueName].teams[awayTeamIndex].elo = Math.round(currentAwayElo + kFactor * ((1 - homeActual) - (1 - homeExpected))); // Away ELO calculation corrected

            // PPG 업데이트
            const homePoints = homeActual === 1 ? 3 : (homeActual === 0.5 ? 1 : 0);
            const awayPoints = homeActual === 0 ? 3 : (homeActual === 0.5 ? 1 : 0);
            
            // [수정] PPG 업데이트 시 분모가 0이 되는 것을 방지 (초기 경기가 0일 수 있음)
            const currentHomePpg = backtestingData[leagueName].teams[homeTeamIndex].ppg;
            const currentHomeMatches = allLeaguesData[leagueName].teams[homeTeamIndex].homePpg > 0 ? (currentHomePpg / allLeaguesData[leagueName].teams[homeTeamIndex].homePpg) : 1; // 임시 계산
            
            const currentAwayPpg = backtestingData[leagueName].teams[awayTeamIndex].ppg;
            const currentAwayMatches = allLeaguesData[leagueName].teams[awayTeamIndex].awayPpg > 0 ? (currentAwayPpg / allLeaguesData[leagueName].teams[awayTeamIndex].awayPpg) : 1; // 임시 계산
            
            // [수정] PPG 계산 시 currentMatches가 0이 되지 않도록 1을 최소값으로 설정
            backtestingData[leagueName].teams[homeTeamIndex].ppg = ((currentHomePpg * Math.max(1, currentHomeMatches)) + homePoints) / (Math.max(1, currentHomeMatches) + 1);
            backtestingData[leagueName].teams[awayTeamIndex].ppg = ((currentAwayPpg * Math.max(1, currentAwayMatches)) + awayPoints) / (Math.max(1, currentAwayMatches) + 1);
            
             // Form 업데이트 (최근 5경기)
             const getResultChar = (homeS, awayS) => homeS > awayS ? 'W' : (homeS < awayS ? 'L' : 'D');
             backtestingData[leagueName].teams[homeTeamIndex].form_l5 = (getResultChar(fixture.homeScore, fixture.awayScore) + (backtestingData[leagueName].teams[homeTeamIndex].form_l5 || '')).slice(0, 5);
             backtestingData[leagueName].teams[awayTeamIndex].form_l5 = (getResultChar(fixture.awayScore, fixture.homeScore) + (backtestingData[leagueName].teams[awayTeamIndex].form_l5 || '')).slice(0, 5);
             
             // prevPpg 업데이트 (트렌드 분석용)
             const homePpgArray = backtestingData[leagueName].teams[homeTeamIndex].prevPpg || [];
             homePpgArray.push(backtestingData[leagueName].teams[homeTeamIndex].ppg);
             backtestingData[leagueName].teams[homeTeamIndex].prevPpg = homePpgArray.slice(-10); // 최근 10개 PPG 추적
             
             const awayPpgArray = backtestingData[leagueName].teams[awayTeamIndex].prevPpg || [];
             awayPpgArray.push(backtestingData[leagueName].teams[awayTeamIndex].ppg);
             backtestingData[leagueName].teams[awayTeamIndex].prevPpg = awayPpgArray.slice(-10); // 최근 10개 PPG 추적

        } else {
             console.warn(`Could not find ${homeTeamData.name} or ${awayTeamData.name} in backtesting data for ELO/PPG update.`);
        }
    }


    // ==================================================================
    // [전략 3단계 적용] openComparisonReport
    // 팝업 리포트에 신규 O/U, BTTS 데이터 추가
    // ==================================================================
    function openComparisonReport(selectedRowsData) {
        const reportWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');

        if (reportWindow) {
            let tableContent = '';
            selectedRowsData.forEach(data => {
                const analysis = JSON.parse(data.analysis || '{}');
                const btProbs = JSON.parse(data.btProbs || '{}');
                const regressionProbs = JSON.parse(data.regressionProbs || '{}');
                const poissonProbs = JSON.parse(data.poissonProbs || '{}');
                const fuzzy = JSON.parse(data.fuzzyPrediction || '{}');
                // [전략 3단계] 신규 팝업 데이터
                const ouProbs = JSON.parse(data.ouProbs || '{}');
                const bttsProbs = JSON.parse(data.bttsProbs || '{}');

                const homeTeam = analysis.homeTeam?.name || 'N/A';
                const awayTeam = analysis.awayTeam?.name || 'N/A';

                const points = {
                    btHome: btProbs.home, btDraw: btProbs.draw, btAway: btProbs.away,
                    regHome: regressionProbs.home, regDraw: regressionProbs.draw, regAway: regressionProbs.away,
                    hplHome: poissonProbs.homeWinProb, hplDraw: poissonProbs.drawProb, hplAway: poissonProbs.awayWinProb,
                    oslScore: parseFloat(data.coreScore), // OSL Core Score
                    fuzzyCenter: fuzzy.center, // Fuzzy Center value
                    // [전략 3단계] 신규 팝업 데이터
                    overProb: ouProbs.over_2_5_prob,
                    bttsProb: bttsProbs.btts_yes_prob
                };

                 // Group probabilities for finding min/max
                 const homeProbs = [points.btHome, points.regHome, points.hplHome].filter(v => typeof v === 'number');
                 const drawProbs = [points.btDraw, points.regDraw, points.hplDraw].filter(v => typeof v === 'number');
                 const awayProbs = [points.btAway, points.regAway, points.hplAway].filter(v => typeof v === 'number'); // [수정] hplAway -> hplAway

                 const maxHomeProb = homeProbs.length > 0 ? Math.max(...homeProbs) : -Infinity;
                 const minHomeProb = homeProbs.length > 0 ? Math.min(...homeProbs) : Infinity;
                 const maxDrawProb = drawProbs.length > 0 ? Math.max(...drawProbs) : -Infinity;
                 const minDrawProb = drawProbs.length > 0 ? Math.min(...drawProbs) : Infinity;
                 const maxAwayProb = awayProbs.length > 0 ? Math.max(...awayProbs) : -Infinity;
                 const minAwayProb = awayProbs.length > 0 ? Math.min(...awayProbs) : Infinity;

                 // Function to apply highlighting class
                 const getClass = (value, maxVal, minVal) => {
                     if (typeof value !== 'number') return '';
                     if (value === maxVal && maxVal !== minVal) return 'highlight-max'; // Only highlight if max != min
                     if (value === minVal && maxVal !== minVal) return 'highlight-min';
                     return '';
                 };


                tableContent += `
                    <tr>
                        <td>${homeTeam} vs ${awayTeam}</td>
                        <td class="${getClass(points.btHome, maxHomeProb, minHomeProb)}">${points.btHome?.toFixed(1)}%</td>
                        <td class="${getClass(points.btDraw, maxDrawProb, minDrawProb)}">${points.btDraw?.toFixed(1)}%</td>
                        <td class="${getClass(points.btAway, maxAwayProb, minAwayProb)}">${points.btAway?.toFixed(1)}%</td>
                        <td class="${getClass(points.regHome, maxHomeProb, minHomeProb)}">${points.regHome?.toFixed(1)}%</td>
                        <td class="${getClass(points.regDraw, maxDrawProb, minDrawProb)}">${points.regDraw?.toFixed(1)}%</td>
                        <td class="${getClass(points.regAway, maxAwayProb, minAwayProb)}">${points.regAway?.toFixed(1)}%</td>
                        <td class="${getClass(points.hplHome, maxHomeProb, minHomeProb)}">${points.hplHome?.toFixed(1)}%</td>
                        <td class="${getClass(points.hplDraw, maxDrawProb, minDrawProb)}">${points.hplDraw?.toFixed(1)}%</td>
                        <td class="${getClass(points.hplAway, maxAwayProb, minAwayProb)}">${points.hplAway?.toFixed(1)}%</td>
                        <td>${data.oslPred} (${points.oslScore?.toFixed(2)})</td>
                        <td>${data.fuzzyPredText} (${points.fuzzyCenter?.toFixed(2)})</td>
                        <!-- [전략 3단계] 신규 팝업 셀 -->
                        <td style="background-color: ${points.overProb > 60 ? '#d4edda' : (points.overProb < 40 ? '#f8d7da' : '')}">${points.overProb?.toFixed(1)}%</td>
                        <td style="background-color: ${points.bttsProb > 60 ? '#d4edda' : (points.bttsProb < 40 ? '#f8d7da' : '')}">${points.bttsProb?.toFixed(1)}%</td>
                        <td>${data.finalPred}</td>
                    </tr>
                `;
            });

            const reportContent = `
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <title>모델별 예측 비교 리포트</title>
                    <style>
                        body { font-family: sans-serif; padding: 20px; }
                        h2 { text-align: center; }
                        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 0.9em; }
                        th, td { border: 1px solid #ccc; padding: 8px; text-align: center; }
                        th { background-color: #f2f2f2; }
                        .highlight-max { background-color: #d4edda; color: #155724; font-weight: bold; } /* Green */
                        .highlight-min { background-color: #f8d7da; color: #721c24; font-weight: bold; } /* Red */
                        .print-btn { display: block; width: 150px; margin: 20px auto; padding: 10px; background-color: #2ecc71; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: center; font-size: 1em; }
                         @media print { .print-btn { display: none; } }
                    </style>
                </head>
                <body>
                    <h2>모델별 예측 비교 (${new Date().toLocaleDateString()})</h2>
                    <table>
                        <thead>
                            <tr>
                                <th rowspan="2">경기</th>
                                <th colspan="3">BT 모델 (%)</th>
                                <th colspan="3">회귀 모델 (%)</th>
                                <th colspan="3">HPL xG-푸아송 (%)</th>
                                <th rowspan="2">OSL (점수)</th>
                                <th rowspan="2">퍼지 (중심값)</th>
                                <!-- [전략 3단계] 신규 팝업 헤더 -->
                                <th rowspan="2">O/U 2.5 (Over %)</th>
                                <th rowspan="2">BTTS (Yes %)</th>
                                <th rowspan="2">종합 예측</th>
                            </tr>
                            <tr>
                                <th>홈</th><th>무</th><th>원</th>
                                <th>홈</th><th>무</th><th>원</th>
                                <th>홈</th><th>무</th><th>원</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableContent}
                        </tbody>
                    </table>
                    <button class="print-btn" onclick="window.print()">결과 인쇄</button>
                </body>
                </html>
            `;
            reportWindow.document.write(reportContent);
            reportWindow.document.close();
            reportWindow.focus();
        } else {
             showMessage("팝업 창이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.", "warning");
        }
    }


    // saveResultsBtn listener now checks for selected rows
    saveResultsBtn.addEventListener('click', () => {
        const selectedRows = Array.from(resultsBody.querySelectorAll('tr .select-row-checkbox:checked'));

        if (selectedRows.length > 0) {
            // Checkbox가 하나 이상 선택된 경우: 모델 비교 리포트 표시
            const selectedRowsData = selectedRows.map(checkbox => {
                const row = checkbox.closest('tr');
                // [전략 3단계] 신규 데이터를 리포트에 전달
                return {
                    ...row.dataset,
                    ouProbs: row.dataset.ouProbs,
                    bttsProbs: row.dataset.bttsProbs
                };
            });
            openComparisonReport(selectedRowsData);
        } else {
            // Checkbox가 선택되지 않은 경우: 기존 켈리 리포트 표시
            const allRows = document.querySelectorAll('#results-body tr');
             if (allRows.length === 0) {
                 showMessage('표시할 분석 결과가 없습니다.', 'warning');
                 return;
             }
             openKellyReport(allRows); // Pass all rows to the existing Kelly report function
        }
    });

    // Function to open the existing Kelly Report (extracted logic)
    function openKellyReport(rows) {
        const kellyDataForWindow = [];
        let rowHTMLs = [];

        rows.forEach(row => {
             let rowData = { f_star: 0, pick: 'N/A', reason: '데이터 없음', odds: 0, actualResult: row.dataset.finalResult || null, isExcluded: false };
             try {
                 const analysisData = JSON.parse(row.dataset.analysis);
                 const poissonProbs = JSON.parse(row.dataset.poissonProbs);
                 // [수정] O/U 텍스트 제거
                 const finalPredText = row.querySelector('.consensus-cell')?.innerText.replace(/ \(Over.*\)| \(Under.*\)/g, '').trim() || 'N/A';


                 let pick = 'N/A';
                 if (finalPredText.includes('홈 승')) pick = 'home';
                 else if (finalPredText.includes('원정 승')) pick = 'away';
                 else if (finalPredText.includes('무승부') || finalPredText.includes('(무)')) pick = 'draw';

                 rowData.pick = pick;

                 if (pick !== 'N/A' && poissonProbs && analysisData) {
                     let p = 0, b = 0, q = 0, odds = 0;
                     if (pick === 'home') { p = poissonProbs.homeWinProb / 100.0; odds = analysisData.homeOdds; }
                     else if (pick === 'draw') { p = poissonProbs.drawProb / 100.0; odds = analysisData.drawOdds; } // [오타 수정] poissonProson -> poissonProbs
                     else { p = poissonProbs.awayWinProb / 100.0; odds = analysisData.awayOdds; }

                     rowData.odds = odds;

                     if (!isNaN(p) && p > 0 && !isNaN(odds) && odds > 1.0) {
                         b = odds - 1.0;
                         q = 1.0 - p;
                         const edge = (b * p) - q;

                         if (edge > 0) {
                             rowData.f_star = edge / b;
                             rowData.reason = `f* = ${rowData.f_star.toFixed(4)}`;
                         } else {
                             rowData.reason = "엣지 없음 (베팅 X)";
                         }
                     } else {
                         rowData.reason = "확률/배당 없음";
                     }
                 } else {
                     rowData.reason = "예측/데이터 불일치";
                 }

             } catch (e) {
                 console.error("Kelly calc error:", e, row.dataset.poissonProbs, row.dataset.analysis);
                 rowData.reason = "계산 오류";
             }
             kellyDataForWindow.push(rowData);

             let currentHTML = '';
             for (let i = 1; i < row.cells.length; i++) { // Skip first cell (관리)
                 currentHTML += `<td>${row.cells[i].innerHTML}</td>`;
             }
             rowHTMLs.push(currentHTML);
        });

         const reportWindow = window.open('', '_blank', 'width=1400,height=800,scrollbars=yes,resizable=yes');

        if (reportWindow) {
            const reportContent = `
                <!DOCTYPE html>
                <html lang="ko">
                <head>
                    <meta charset="UTF-8">
                    <title>통계 분석 리포트 (켈리 기준)</title>
                     <style>
                         /* Styles copied from main page for consistency */
                         body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 20px; }
                         .controls { text-align: center; margin-bottom: 20px; padding: 10px; background-color: #f8f9fa; border-radius: 5px; border: 1px solid #dee2e6; }
                         .controls label { font-weight: bold; margin-right: 10px; }
                         .controls input { padding: 5px; width: 100px; text-align: right; }
                         .controls button { padding: 5px 15px; margin-left: 10px; background-color: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
                         h2 { text-align: center; }
                         table { width: 100%; border-collapse: collapse; font-size: 0.9em; table-layout: fixed;}
                         th, td { border: 1px solid #ddd; padding: 8px; text-align: center; word-wrap: break-word; }
                         th { background-color: #f2f2f2; }
                         tfoot tr { background-color: #f0f8ff; font-weight: bold; }
                         .consensus-cell { font-weight: bold; font-size: 1em; }
                         .consensus-reasoning { display: block; font-size: 0.8em; color: #6b7280; font-weight: 400; margin-top: 4px; }
                         .analysis-cell, .score-cell { font-weight: bold; }
                         .form-icon { font-size: 0.8em; margin: 0 1px; }
                         .W { color: #2ecc71; } .D { color: #f1c40f; } .L { color: #e74c3c; }
                         .correct-prediction { font-weight: bold; color: #27ae60; background-color: #e8fadf; }
                         .incorrect-prediction { background-color: #fadbd8; }
                         .second-lowest-osl { background-color: #e0f2fe; font-weight: bold; }
                         .ppg-trend { font-size: 0.9em; margin-left: 4px; }
                         .ppg-up { color: #27ae60; }
                         .ppg-down { color: #c0392b; }
                         #summary-section { margin-top: 30px; padding: 20px; border: 2px solid #3498db; border-radius: 8px; background-color: #f0f8ff; }
                         #summary-section h3 { margin-top: 0; color: #2980b9; }
                         #summary-section p { margin: 5px 0; font-size: 1.1em; }
                         .print-btn { display: block; width: 150px; margin: 20px auto; padding: 10px; background-color: #2ecc71; color: white; border: none; border-radius: 5px; cursor: pointer; text-align: center; font-size: 1em; }
                         @media print { .controls, .print-btn { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="controls">
                        <label for="bankroll-input">총 자본금 ($):</label>
                        <input type="number" id="bankroll-input" value="100" min="1">
                        <button id="recalculate-btn">금액 수정</button>
                    </div>
                    <h2>통계 분석 상세 데이터 (켈리 기준) (${new Date().toLocaleDateString()})</h2>
                    <table id="report-table">
                        <thead></thead>
                        <tbody></tbody>
                        <tfoot></tfoot>
                    </table>
                    <div id="summary-section"></div>
                    <button class="print-btn" onclick="window.print()">결과 인쇄</button>
                    <script>
                        const kellyData = ${JSON.stringify(kellyDataForWindow)};
                        const rowHTMLs = ${JSON.stringify(rowHTMLs)};
                        // [수정] 헤더를 메인 페이지 DOM에서 동적으로 복제
                        const headersHTML = \`${Array.from(document.querySelectorAll('#main-analysis .results-container th')).slice(1).map(th => `<th>${th.innerHTML}</th>`).join('')}<th>켈리 베팅</th>\`;

                        function recalculateAndDisplay(bankroll) {
                             const KELLY_FRACTION = 1.0;
                             const total_f_star = kellyData.reduce((sum, data) => sum + (data.f_star > 0 ? data.f_star : 0), 0);
                             const kellyCells = document.querySelectorAll('.kelly-cell');
                             const tfootCell = document.querySelector('#tfoot-kelly-cell');
                             let totalInvestmentForProfitCalc = 0;
                             let totalReturn = 0;

                             kellyData.forEach((data, index) => {
                                 const cell = kellyCells[index];
                                 if (!isNaN(data.f_star) && data.f_star > 0 && total_f_star > 0) {
                                     const investment = (data.f_star / total_f_star) * bankroll * KELLY_FRACTION;
                                     cell.innerHTML = \`$\${investment.toFixed(2)} <span style="font-size:0.8em; color:#555;">(f*: \${(data.f_star * 100).toFixed(1)}%)</span>\`;
                                     cell.style.fontWeight = 'bold';
                                     cell.style.backgroundColor = '#e8fadf';

                                     if (data.actualResult) {
                                         totalInvestmentForProfitCalc += investment;
                                         let actualOutcome = 'loss';
                                         const scoreParts = data.actualResult.split('-').map(Number);
                                         if (scoreParts.length === 2 && !scoreParts.some(isNaN)) {
                                             const [homeScore, awayScore] = scoreParts;
                                             if (homeScore > awayScore) actualOutcome = 'home';
                                             else if (homeScore === awayScore) actualOutcome = 'draw';
                                             else actualOutcome = 'away';
                                         }
                                         if (data.pick === actualOutcome && !isNaN(data.odds) && data.odds > 0) {
                                             totalReturn += investment * data.odds;
                                         } else {
                                             totalReturn += 0;
                                         }
                                     }
                                 } else {
                                     cell.innerHTML = data.reason;
                                     cell.style.fontWeight = 'normal';
                                     cell.style.backgroundColor = 'transparent';
                                 }
                             });

                             if(tfootCell) {
                                 const fStarSumForCalc = kellyData.reduce((s, d) => s + (!isNaN(d.f_star) && d.f_star > 0 ? d.f_star : 0), 0);
                                 const totalBankrollToBet = total_f_star > 0 ? (bankroll * total_f_star * KELLY_FRACTION) : 0;
                                 tfootCell.innerHTML = \`$\${totalBankrollToBet.toFixed(2)}<br><span style="font-size:0.8em; color:#555; font-weight:normal;">(총 f* = \${isNaN(total_f_star) ? 'N/A' : total_f_star.toFixed(3)})</span>\`;
                             }

                             const summarySection = document.getElementById('summary-section');
                             if (totalInvestmentForProfitCalc > 0.001) {
                                 const netProfit = totalReturn - totalInvestmentForProfitCalc;
                                 const roi = (netProfit / totalInvestmentForProfitCalc) * 100;
                                 summarySection.innerHTML = \`<h3>최종 결과 (결과가 입력된 베팅 대상 경기 기준)</h3><p><strong>총 투자금액:</strong> $\${totalInvestmentForProfitCalc.toFixed(2)}</p><p><strong>총 회수금액:</strong> $\${totalReturn.toFixed(2)} (원금 $\${totalInvestmentForProfitCalc.toFixed(2)} + 순수익 $\${netProfit.toFixed(2)})</p><p><strong>총 순수익:</strong> <span style="color: \${netProfit >= 0 ? 'blue' : 'red'};">\${netProfit.toFixed(2)}</span></p><p><strong>수익률:</strong> <span style="color: \${roi >= 0 ? 'blue' : 'red'};">\${roi.toFixed(1)}%</span></p>\`;
                             } else {
                                 summarySection.innerHTML = '<h3>최종 결과</h3><p>결과가 입력된 베팅 대상 경기가 없어 손익을 계산할 수 없습니다.</p>';
                             }
                        }

                         window.onload = function() {
                             const table = document.getElementById('report-table');
                             table.querySelector('thead').innerHTML = \`<tr>\${headersHTML}</tr>\`;
                             const tbody = table.querySelector('tbody');
                             rowHTMLs.forEach((html, index) => {
                                 const row = tbody.insertRow();
                                 row.innerHTML = html + '<td class="kelly-cell"></td>';
                             });

                             const numHeaders = document.querySelectorAll('#report-table thead th').length;
                             table.querySelector('tfoot').innerHTML = \`<tr><td colspan="\${numHeaders - 1}" style="text-align: right; padding: 10px;">총합:</td><td id="tfoot-kelly-cell"></td></tr>\`;

                             recalculateAndDisplay(100);

                             document.getElementById('recalculate-btn').addEventListener('click', function() {
                                 const newBankroll = parseFloat(document.getElementById('bankroll-input').value);
                                 if (!isNaN(newBankroll) && newBankroll > 0) {
                                     recalculateAndDisplay(newBankroll);
                                 } else {
                                     alert('유효한 금액을 입력하세요.');
                                 }
                             });
                        };
                    <\/script>
                </body>
                </html>
            `;
            reportWindow.document.write(reportContent);
            reportWindow.document.close();
            reportWindow.focus();
        } else {
            showMessage("팝업 창이 차단되었습니다. 팝업 차단을 해제하고 다시 시도해주세요.", "warning");
        }
    }


    const populateRecommendedPicks = (predictionType) => {
        const filteredRows = Array.from(resultsBody.querySelectorAll('tr')).filter(row => row.dataset.finalPred === predictionType);
        filteredRows.sort((a, b) => parseFloat(b.dataset.coreScore) - parseFloat(a.dataset.coreScore));
        recommendedPicksBody.innerHTML = '';
        if (filteredRows.length === 0) {
            // [수정] 신규 열 2개 추가로 colspan 17으로 변경
            recommendedPicksBody.innerHTML = `<tr><td colspan="17" style="text-align:center;padding:20px;">'${predictionType}'으로 예측된 경기가 없습니다.</td></tr>`;
        } else {
            filteredRows.forEach(row => {
                const newRow = row.cloneNode(true);
                if (newRow.cells[0]) newRow.cells[0].innerHTML = '-'; // Replace checkbox/button cell

                // Ensure the '결과' cell displays the result text, not the button, if present
                const resultCellIndex = newRow.cells.length - 1;
                if (newRow.cells[resultCellIndex] && row.dataset.finalResult) {
                     newRow.cells[resultCellIndex].textContent = row.dataset.finalResult;
                } else if (newRow.cells[resultCellIndex] && newRow.cells[resultCellIndex].querySelector('button')) {
                    newRow.cells[resultCellIndex].textContent = '입력 대기'; // Replace button with text
                }

                recommendedPicksBody.appendChild(newRow);
            });
        }
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-link').forEach(link => link.classList.remove('active'));
        document.getElementById('recommended-picks').classList.add('active');
        document.querySelector('button[onclick*="recommended-picks"]').classList.add('active');
    };


    recommendHomeWinBtn.addEventListener('click', () => populateRecommendedPicks('홈 승'));
    recommendDrawBtn.addEventListener('click', () => populateRecommendedPicks('무승부'));
    // [수정됨] '()S =>' 오타 수정 -> '() =>'
    recommendAwayWinBtn.addEventListener('click', () => populateRecommendedPicks('원정 승'));


    const retrainFuzzyBtn = document.getElementById('retrain-fuzzy-btn');
    retrainFuzzyBtn.addEventListener('click', () => {
        fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p>업데이트된 데이터로 모델을 재훈련하는 중...</p>`;
        try {
            trainFuzzyRegression(false);
        } catch(err) {
             console.error("Fuzzy model re-training failed:", err);
             fuzzyTrainingStatus.innerHTML = `<h4>🧠 퍼지 회귀 모델 상태</h4><p style="color: red;">✗ 모델 재훈련 실패. (${err.message})</p>`;
        }
    });

    // ==================================================================
    // [Phase 1] 학습 데이터 다운로드 버튼 이벤트 리스너
    // ==================================================================
    if (exportDataBtn) {
        exportDataBtn.addEventListener('click', () => {
            if (trainingDataExport.length === 0) {
                showMessage("다운로드할 학습 데이터가 없습니다. 먼저 '자동 분석(백테스팅)' 탭에서 경기를 실행하세요.", "warning");
                return;
            }

            try {
                const dataStr = JSON.stringify(trainingDataExport, null, 2);
                const dataBlob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(dataBlob);

                const a = document.createElement('a');
                a.href = url;
                a.download = 'training_data.json';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                showMessage(`학습 데이터 ${trainingDataExport.length}건을 training_data.json으로 다운로드했습니다.`, "success");
            } catch (e) {
                console.error("Failed to download training data:", e);
                showMessage("데이터 다운로드 중 오류 발생.", "error");
            }
        });
    } else {
        console.warn("Element with ID 'export-data-btn' not found. Data export functionality will be unavailable.");
    }

    // --- [신규] PatternAnalyzer.js 버튼 이벤트 리스너 ---
    const buildPatternDbBtn = document.getElementById('build-pattern-db-btn');
    
    // patternDB 객체가 PatternAnalyzer.js에 의해 성공적으로 로드되었는지 확인
    if (buildPatternDbBtn && typeof patternDB !== 'undefined') {
        buildPatternDbBtn.addEventListener('click', () => {
            try {
                // PatternAnalyzer.js의 학습 기능 호출
                patternDB.build(); 
                // 메인 메시지 박스에 성공 알림
                showMessage("전체 경기의 미적중 패턴 학습을 완료했습니다.", "success");
            } catch (e) {
                console.error("PatternDB 학습 중 오류:", e);
                showMessage(`패턴 학습 중 오류 발생: ${e.message}`, "error");
            }
        });
    } else if (!buildPatternDbBtn) {
        console.warn("Pattern DB 빌드 버튼(build-pattern-db-btn)을 찾을 수 없습니다.");
    } else {
        console.warn("patternDB 객체를 찾을 수 없습니다. PatternAnalyzer.js가 올바르게 로드되었는지 확인하세요.");
    }
    // --- [신규] 리스너 종료 ---

    // [Phase 5] 초기 훈련 및 데이터 로드 로직 제거 (initApp에서 처리됨)
    try {
        // initApp이 모든 API 로드 및 초기 설정을 비동기로 처리합니다.
        // 앱 초기 구동 시에는 initApp만 호출합니다.
    } catch (e) {
        console.error("Error during initial data parsing/training:", e);
        showMessage("초기화 중 오류 발생.", "error");
    }

});




/* ===================== MiniPatch: 원본식 리그→팀 플로우 복원 =====================
   - 드롭다운 value=리그이름 유지
   - standings 평탄화 + /teams 백업으로 팀 목록 보장
   - 이벤트 단일 바인딩 (중복 방지)
   - 기존 대형 패치(__leagueTeamSelectionPatched__)가 있으면 실행 생략
=============================================================================== */
(function MiniLeagueTeamPatch(){
  if (window.__leagueTeamSelectionPatched__) { console.info('[MiniPatch] skipped: legacy patch active'); return; }
  if (window.__bindLeagueTeamsOnce__) { console.info('[MiniPatch] already bound'); return; }
  window.__bindLeagueTeamsOnce__ = true;

  const $ = (id) => document.getElementById(id);
  const leagueSel = $('league-select');
  const homeSel   = $('home-team-select');
  const awaySel   = $('away-team-select');
  const homeInp   = $('home-team-input');
  const awayInp   = $('away-team-input');

  function toggleTeamInputs(useManual){
    const show = (el, s) => { if (el) el.style.display = s ? '' : 'none'; };
    show(homeSel, !useManual);
    show(awaySel, !useManual);
    show(homeInp,  useManual);
    show(awayInp,  useManual);
  }

  async function populateTeamsForLeague(leagueName){
    const useManual = (leagueName === 'other' || leagueName === '기타' || leagueName === '기타 리그 (직접 입력)');
    toggleTeamInputs(useManual);
    if (useManual) return;

    const L = (window.allLeaguesData && window.allLeaguesData[leagueName]) || null;
    const compId = window.competitionMap?.[leagueName];
    let teams = [];

    try{
      const raw  = L?.standings?.[0] || [];
      const rows = Array.isArray(raw?.[0]) ? raw.flat() : raw;
      rows.forEach(row => {
        const name = row?.team?.name;
        if (!name) return;
        teams.push({
          name,
          id: row?.team?.id,
          ppg: (row?.points && row?.played) ? (row.points / row.played) : 0,
          form_l5: row?.form || '',
          elo: 1500
        });
      });
    }catch(e){ console.warn('[MiniPatch] standings parse fail', e); }

    if (teams.length === 0 && compId){
      try{
        const r = await (typeof fetchData==='function'
          ? fetchData(`/teams?league=${compId}&season=${window.CURRENT_SEASON}`)
          : Promise.resolve(null));
        (r?.response || []).forEach(item => {
          const name = item?.team?.name;
          if (name) teams.push({ name, id: item?.team?.id, ppg: 0, form_l5: '', elo: 1500 });
        });
      }catch(e){ console.warn('[MiniPatch] teams fallback fail', e); }
    }

    if (!window.allLeaguesData) window.allLeaguesData = {};
    if (!window.allLeaguesData[leagueName]) window.allLeaguesData[leagueName] = {};
    window.allLeaguesData[leagueName].teams = teams;

    const fill = (sel) => {
      if (!sel) return;
      sel.innerHTML = '<option value="" disabled selected>팀 선택</option>';
      teams.sort((a,b)=> (a.name||'').localeCompare(b.name||'', 'ko'))
           .forEach(t => sel.add(new Option(t.name, t.name))); // value=이름
    };
    fill(homeSel); fill(awaySel);
  }

  function teamSelectHandler(){
    const leagueName = leagueSel?.value;
    const useManual = (leagueName === 'other' || leagueName === '기타' || leagueName === '기타 리그 (직접 입력)');
    const home = useManual ? homeInp?.value?.trim() : homeSel?.value;
    const away = useManual ? awayInp?.value?.trim() : awaySel?.value;
    if (!leagueName || !home || !away) return;

    const data = (typeof getCurrentTeamsData === 'function')
      ? getCurrentTeamsData(leagueName, home, away, window.allLeaguesData || {})
      : null;

    const hp = document.getElementById('home-ppg');
    const he = document.getElementById('home-elo');
    const hf = document.getElementById('home-form');
    const ap = document.getElementById('away-ppg');
    const ae = document.getElementById('away-elo');
    const af = document.getElementById('away-form');

    if (data?.homeTeam){
      const ht = data.homeTeam;
      if (hp) hp.value = ( (ht.homePpg ?? ht.ppg ?? 0).toFixed ? (ht.homePpg ?? ht.ppg ?? 0).toFixed(2) : (ht.homePpg ?? ht.ppg ?? 0) );
      if (he) he.value = Math.round(ht.elo ?? 1500);
      if (hf) hf.value = ht.form_l5 || '';
    }
    if (data?.awayTeam){
      const at = data.awayTeam;
      if (ap) ap.value = ( (at.awayPpg ?? at.ppg ?? 0).toFixed ? (at.awayPpg ?? at.ppg ?? 0).toFixed(2) : (at.awayPpg ?? at.ppg ?? 0) );
      if (ae) ae.value = Math.round(at.elo ?? 1500);
      if (af) af.value = at.form_l5 || '';
    }

    if (!useManual && typeof fetchAndFillOdds === 'function'){
      try { fetchAndFillOdds(leagueName, home, away); } catch(e){ console.warn('[MiniPatch] odds fail', e); }
    }
  }

  // 이벤트 단일 바인딩
  leagueSel?.addEventListener('change', (e)=> populateTeamsForLeague(e.target.value));
  homeSel?.addEventListener('change', teamSelectHandler);
  awaySel?.addEventListener('change', teamSelectHandler);
  homeInp?.addEventListener('input',  teamSelectHandler);
  awayInp?.addEventListener('input',  teamSelectHandler);

  // 초기 리그 값이 이미 있다면 즉시 팀 채우기
  if (leagueSel?.value) { populateTeamsForLeague(leagueSel.value); }
})();
/* ===================== End MiniPatch ================================================= */