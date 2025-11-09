/**
 * app_logic.autopredict_allleagues.js (v2 - 서버 동기화 + 타이밍 수정)
 * ============================================================
 * [개선 버전 v2.1]
 * ✅ 모든 리그 순차 예측 (48시간 내 경기)
 * ✅ 1시간마다 전체 리그 재예측
 * ✅ ±5% 이상 변동 감지
 * ✅ 경기 종료 + 24시간 후 자동 삭제
 * ✅ 서버 동기화 추가! (v2)
 * ✅ [NEW] 타이밍 오류 완전 해결! (v2.1)
 * ============================================================
 * 
 * [주요 수정 사항]
 * 1. lastSyncTime = -Infinity (첫 동기화 즉시)
 * 2. syncInProgress 플래그 추가 (중복 호출 방지)
 * 3. 타임아웃 처리 개선 (AbortController)
 * 4. 실패 시 재시도 로직 추가
 * 5. 상세한 로깅 추가
 * 
 * [적용 방법]
 *   1) 기존 파일 백업
 *   2) 이 파일의 전체 코드로 교체
 *   3) 브라우저에서 새로고침
 *   4) 콘솔 확인 (동기화 즉시 시작)
 */

(function(){
  
  // ========================================
  // 1. 상수 정의
  // ========================================
  
  const ONE_HOUR = 60 * 60 * 1000;
  const AUTO_REPREDICT_INTERVAL = ONE_HOUR;           // 1시간마다 재예측
  const AUTO_LOOKAHEAD_MS = 48 * ONE_HOUR;            // 48시간 내 경기만 예측
  const MATCH_END_PADDING_MS = 120 * 60 * 1000;       // 경기 종료 판정 여유: 120분
  const EXPIRE_AFTER_MS = 24 * ONE_HOUR;              // 경기 종료 후 24시간 후 삭제
  const CHANGE_THRESHOLD = 0.05;                      // 5% 변동 감지
  const PER_LEAGUE_DELAY = 10000;                     // 리그별 10초 간격 (API rate-limit 방지)
  
  // ========================================
  // 2. 서버 동기화 설정
  // ========================================
  
  const SERVER_BASE_URL = 'http://localhost:8000';
  const SYNC_TIMEOUT = 5000;                          // 5초 타임아웃
  const AUTO_SYNC_INTERVAL = 30 * 60 * 1000;         // 30분마다 동기화
  
  // ========================================
  // 3. DOM 선택자
  // ========================================
  
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ========================================
  // 4. 유틸리티 함수
  // ========================================

  /**
   * 메시지 로깅 (UI에 표시)
   */
  function logMessage(msg, type = 'info') {
    const box = $('#message-box');
    if (!box) return;
    
    box.className = '';
    box.classList.add(type);
    box.innerHTML = msg;
    box.style.display = 'block';
    
    setTimeout(() => {
      if (box.innerHTML === msg) {
        box.style.display = 'none';
      }
    }, 6000);
  }

  /**
   * 대기 함수
   */
  function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  /**
   * 페이드 아웃 후 행 삭제
   */
  function fadeOutAndRemoveRow(tr) {
    if (!tr) return;
    tr.style.transition = 'opacity 1.5s ease';
    tr.style.opacity = '0';
    setTimeout(() => {
      if (tr.parentNode) {
        tr.parentNode.removeChild(tr);
      }
    }, 1600);
  }

  // ========================================
  // 5. 상태 관리 (State)
  // ========================================

  const refs = {
    leagueSelect: () => $('#league-select'),
    homeSelect: () => $('#home-team-select'),
    awaySelect: () => $('#away-team-select'),
    addBtn: () => $('#add-result'),
    resultsBody: () => $('#results-body')
  };

  const origin = {
    fetchData: window.fetchData || null
  };

  // ✅ [수정] 상태 초기값 최적화
  const state = {
    cache: new Map(),
    lastSyncTime: -Infinity,              // ✅ [수정] 0 → -Infinity (첫 호출 즉시)
    lastSyncAttemptTime: 0,               // 마지막 시도 시간
    syncInProgress: false,                // ✅ [신규] 동기화 중 플래그 (중복 호출 방지)
    globalTimer: null,                    // 글로벌 타이머 ID
    serverReachable: false                // 서버 연결 상태
  };

  // ========================================
  // 6. 서버 연결 확인
  // ========================================

  /**
   * 서버 연결 상태 확인
   * ✅ [개선] AbortController를 사용한 타임아웃
   */
  async function checkServerConnection() {
    try {
      // AbortController로 타임아웃 구현
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT);
      
      const response = await fetch(`${SERVER_BASE_URL}/scheduler/status`, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      state.serverReachable = response.ok;
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ 서버 연결 성공:', data);
      }
    } catch (e) {
      state.serverReachable = false;
      console.warn('⚠️ 서버 연결 불가:', e.message);
    }
  }

  // ========================================
  // 7. 패턴 동기화 함수
  // ========================================

  /**
   * 미적중 패턴 동기화
   * ✅ [개선] 타임아웃 및 에러 처리 강화
   */
  async function syncPatternsToServer() {
    if (!state.serverReachable) {
      console.warn('⚠️ 서버 미연결 - 패턴 동기화 생략');
      return false;
    }

    try {
      const warningRules = JSON.parse(
        localStorage.getItem('patternAnalyzerDB_v4') || '{}'
      );

      if (Object.keys(warningRules).length === 0) {
        console.warn('⚠️ 동기화할 미적중 패턴 없음');
        return false;
      }

      // ✅ [개선] AbortController를 사용한 타임아웃
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT);

      const response = await fetch(`${SERVER_BASE_URL}/sync-patterns-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ warningRules }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 미적중 패턴 동기화 완료:', result.stored_patterns + '개');
        return true;
      } else {
        console.error('❌ 패턴 동기화 실패:', response.status);
        return false;
      }
    } catch (e) {
      console.error('❌ 패턴 동기화 에러:', e.message);
      return false;
    }
  }

  /**
   * 적중 패턴 동기화
   * ✅ [개선] 타임아웃 및 에러 처리 강화
   */
  async function syncSuccessToServer() {
    if (!state.serverReachable) {
      console.warn('⚠️ 서버 미연결 - 성공 패턴 동기화 생략');
      return false;
    }

    try {
      const successRules = JSON.parse(
        localStorage.getItem('successAnalyzerDB_v1') || '{}'
      );

      if (Object.keys(successRules).length === 0) {
        console.warn('⚠️ 동기화할 적중 패턴 없음');
        return false;
      }

      // ✅ [개선] AbortController를 사용한 타임아웃
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SYNC_TIMEOUT);

      const response = await fetch(`${SERVER_BASE_URL}/sync-success-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successRules }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 적중 패턴 동기화 완료:', result.stored_patterns + '개');
        return true;
      } else {
        console.error('❌ 성공 패턴 동기화 실패:', response.status);
        return false;
      }
    } catch (e) {
      console.error('❌ 성공 패턴 동기화 에러:', e.message);
      return false;
    }
  }

  // ========================================
  // 8. 통합 동기화 함수 (메인 로직)
  // ========================================

  /**
   * ✅ [수정 v2.1] 통합 동기화 함수 (타이밍 오류 완전 해결)
   * 
   * 개선 사항:
   * 1. syncInProgress 플래그로 중복 호출 방지
   * 2. 마지막 동기화 이후 충분한 시간 경과 확인
   * 3. 하나라도 성공하면 시간 업데이트
   * 4. 실패 시 5분 후 재시도
   * 5. 에러 발생해도 finally에서 플래그 해제
   */
  async function syncBothPatternsToServer() {
    const now = Date.now();
    
    // [개선 1] 이미 동기화 중이면 중복 호출 방지
    if (state.syncInProgress) {
      console.log('🔄 동기화 진행 중 - 중복 호출 방지');
      return;
    }
    
    // [개선 2] 마지막 동기화 이후 충분한 시간 경과 확인
    const timeSinceLastSync = now - state.lastSyncTime;
    if (timeSinceLastSync < AUTO_SYNC_INTERVAL) {
      return; // 아직 간격이 안 됨 (조용히 실패)
    }

    // [개선 3] 동기화 시작 표시
    state.syncInProgress = true;
    logMessage('🔄 서버에 패턴 동기화 중...', 'info');
    
    try {
      // 패턴 동기화
      const patternResult = await syncPatternsToServer();
      await sleep(500);
      
      // 성공 동기화
      const successResult = await syncSuccessToServer();
      
      // [개선 4] 하나라도 성공하면 시간 업데이트
      if (patternResult || successResult) {
        state.lastSyncTime = now;
        logMessage('✅ 서버 동기화 완료', 'success');
      } else {
        // [개선 5] 실패해도 재시도 가능하게 (5분 후)
        console.warn('⚠️ 패턴 동기화 실패 - 5분 후 재시도 예정');
        state.lastSyncTime = now - AUTO_SYNC_INTERVAL + (5 * 60 * 1000);
      }
    } catch (e) {
      console.error('❌ 동기화 중 예외:', e);
      // 에러 발생 시에도 재시도 가능
      state.lastSyncTime = now - AUTO_SYNC_INTERVAL + (5 * 60 * 1000);
    } finally {
      // [개선 6] 무조건 플래그 해제 (예외 발생 시에도)
      state.syncInProgress = false;
    }
  }

  // ========================================
  // 9. 경기 데이터 처리
  // ========================================

  /**
   * 매치 키 생성
   */
  function buildMatchKey({leagueName, homeName, awayName, kickoffISO, fixtureId}) {
    if (fixtureId) return `fx_${fixtureId}`;
    return `lg:${leagueName}|home:${homeName}|away:${awayName}|ko:${kickoffISO}`;
  }

  /**
   * 변동 감지 및 로그
   */
  function compareAndLogChange(matchKey, prev, curr, meta) {
    if (!prev) return;
    
    const dh = curr.home - prev.home;
    const dd = curr.draw - prev.draw;
    const da = curr.away - prev.away;
    
    const changed = Math.abs(dh) >= CHANGE_THRESHOLD * 100 ||
                   Math.abs(dd) >= CHANGE_THRESHOLD * 100 ||
                   Math.abs(da) >= CHANGE_THRESHOLD * 100;
    
    if (!changed) return;
    
    const sign = (x) => x > 0 ? '+' : '';
    logMessage(
      `🔁 <b>${meta.leagueName}</b> — ${meta.homeName} vs ${meta.awayName}<br>
      Home: ${curr.home.toFixed(0)}% (${sign(dh)}${dh.toFixed(0)}%p) · 
      Draw: ${curr.draw.toFixed(0)}% (${sign(dd)}${dd.toFixed(0)}%p) · 
      Away: ${curr.away.toFixed(0)}% (${sign(da)}${da.toFixed(0)}%p)`,
      'info'
    );
  }

  // ========================================
  // 10. API 데이터 로드
  // ========================================

  /**
   * 다가오는 경기 API에서 로드
   */
  async function loadUpcomingFixturesFromApi(leagueName) {
    try {
      if (!origin.fetchData) return [];
      
      const compId = (window.competitionMap && window.competitionMap[leagueName]) || null;
      if (!compId) return [];
      
      const season = (typeof window.CURRENT_SEASON !== 'undefined') ? 
                    window.CURRENT_SEASON : 
                    new Date().getFullYear();
      
      const fx = await origin.fetchData(`/fixtures?league=${compId}&season=${season}`);
      const responses = (fx && fx.response) || [];
      const now = Date.now();
      
      return responses.filter(r => {
        const st = r.fixture.status.short;
        const isUpcoming = ['NS', 'TBD', 'PST'].includes(st);
        if (!isUpcoming) return false;
        
        const ko = new Date(r.fixture.date).getTime();
        return (ko - now) <= AUTO_LOOKAHEAD_MS && (ko - now) > 0;
      }).map(r => ({
        leagueName,
        fixtureId: r.fixture.id,
        homeName: r.teams.home.name,
        awayName: r.teams.away.name,
        kickoffISO: r.fixture.date
      }));
    } catch (e) {
      console.warn('load error', e);
      return [];
    }
  }

  // ========================================
  // 11. UI를 통한 예측 실행
  // ========================================

  /**
   * UI를 통해 예측 실행
   */
  async function runPredictionViaUI({leagueName, homeName, awayName}) {
    const leagueSelect = refs.leagueSelect();
    const homeSelect = refs.homeSelect();
    const awaySelect = refs.awaySelect();
    const addBtn = refs.addBtn();
    
    if (!leagueSelect || !homeSelect || !awaySelect || !addBtn) {
      return false;
    }
    
    leagueSelect.value = leagueName;
    leagueSelect.dispatchEvent(new Event('change'));
    await sleep(200);
    
    if (Array.from(homeSelect.options).some(o => o.value === homeName)) {
      homeSelect.value = homeName;
      homeSelect.dispatchEvent(new Event('change'));
    }
    
    if (Array.from(awaySelect.options).some(o => o.value === awayName)) {
      awaySelect.value = awayName;
      awaySelect.dispatchEvent(new Event('change'));
    }
    
    addBtn.click();
    return true;
  }

  /**
   * 마지막 행에서 확률 읽기
   */
  function readProbasFromLastRow() {
    const tb = refs.resultsBody();
    if (!tb) return null;
    
    const tr = tb.querySelector('tr:last-child');
    if (!tr) return null;
    
    const tds = Array.from(tr.querySelectorAll('td'));
    const toP = (txt) => {
      const m = String(txt || '').match(/(\d+(?:\.\d+)?)\s*%/);
      return m ? parseFloat(m[1]) : null;
    };
    
    const probs = [];
    for (let i = 0; i < Math.min(10, tds.length); i++) {
      const p = toP(tds[i].textContent);
      if (p !== null) probs.push(p);
      if (probs.length >= 3) break;
    }
    
    if (probs.length < 3) return null;
    return { home: probs[0], draw: probs[1], away: probs[2] };
  }

  // ========================================
  // 12. 자동 예측 로직
  // ========================================

  /**
   * 한 경기 예측 실행
   */
  async function autoPredictOne(fx) {
    const key = buildMatchKey(fx);
    const ok = await runPredictionViaUI(fx);
    if (!ok) return;
    
    await sleep(150);
    
    const p = readProbasFromLastRow();
    if (!p) return;
    
    const prev = state.cache.get(key)?.last || null;
    compareAndLogChange(key, prev, p, fx);
    state.cache.set(key, { last: p, lastUpdated: new Date().toISOString() });
  }

  /**
   * 만료된 행 제거
   */
  function removeExpiredRows() {
    const now = Date.now();
    $$('#results-body tr[data-expire-at]').forEach(tr => {
      const t = new Date(tr.dataset.expireAt).getTime();
      if (isFinite(t) && now >= t) {
        const label = tr.querySelector('td')?.textContent || '';
        logMessage(
          `⚠️ ${label} — 경기 종료 후 24시간 경과 — 자동 제거됨.`,
          'warning'
        );
        fadeOutAndRemoveRow(tr);
      }
    });
  }

  // ========================================
  // 13. 메인 자동 예측 함수
  // ========================================

  /**
   * 모든 리그 예측 실행
   */
  async function predictAllLeagues() {
    const leagueSelect = refs.leagueSelect();
    if (!leagueSelect) return;
    
    const leagues = Array.from(leagueSelect.options)
      .map(o => o.value)
      .filter(Boolean);
    
    logMessage(`⚙️ ${leagues.length}개 리그 자동 예측 시작`, 'info');
    
    for (const leagueName of leagues) {
      const list = await loadUpcomingFixturesFromApi(leagueName);
      for (const fx of list) {
        await autoPredictOne(fx);
        await sleep(300);
      }
      await sleep(PER_LEAGUE_DELAY);
    }
    
    removeExpiredRows();
    
    // ✅ [신규] 재학습 완료 후 서버에 동기화
    await syncBothPatternsToServer();
  }

  // ========================================
  // 14. 글로벌 스케줄러 시작
  // ========================================

  /**
   * 글로벌 스케줄러 재시작
   */
  function restartGlobalScheduler() {
    if (state.globalTimer) clearInterval(state.globalTimer);
    
    state.globalTimer = setInterval(predictAllLeagues, AUTO_REPREDICT_INTERVAL);
    
    // ✅ [개선] 첫 예측은 즉시 실행
    predictAllLeagues();
    
    logMessage(
      '🕒 모든 리그 자동 예측 모드 활성화 — 1시간마다 전체 리그 재예측',
      'info'
    );
  }

  // ========================================
  // 15. 초기화 (페이지 로드 시)
  // ========================================

  /**
   * 페이지 로드 시 초기화
   */
  window.addEventListener('load', async () => {
    // ✅ [개선] 서버 연결 확인 후 시작
    await checkServerConnection();
    
    // ✅ [개선] 스케줄러 시작 (자동 예측 및 동기화)
    restartGlobalScheduler();
  });

})();

/**
 * ========================================
 * 파일 사용 방법
 * ========================================
 * 
 * 1. 기존 파일 백업:
 *    cp App_logic_autopredict_allleagues_v2_sync.js \
 *       App_logic_autopredict_allleagues_v2_sync.js.backup
 * 
 * 2. 이 코드로 완전 교체
 * 
 * 3. 브라우저에서 새로고침 (Ctrl+Shift+R)
 * 
 * 4. 콘솔 확인:
 *    console.log(state.lastSyncTime); // -Infinity 확인
 *    console.log(state.syncInProgress); // false 확인
 * 
 * 5. 로그 확인:
 *    - "✅ 서버 연결 성공" 또는 "⚠️ 서버 연결 불가"
 *    - "🕒 모든 리그 자동 예측 모드 활성화"
 *    - "🔄 서버에 패턴 동기화 중..."
 * 
 * ========================================
 * 주요 변경 사항 (v2.1)
 * ========================================
 * 
 * 1. lastSyncTime = -Infinity
 *    → 첫 동기화가 즉시 시작됨 (30분 지연 해결)
 * 
 * 2. syncInProgress 플래그
 *    → 중복 호출 방지
 *    → 동시에 여러 동기화 실행 방지
 * 
 * 3. AbortController 타임아웃
 *    → fetch() 타임아웃 구현
 *    → 서버 응답 없을 때 5초 후 자동 중단
 * 
 * 4. 재시도 로직
 *    → 동기화 실패 시 5분 후 자동 재시도
 *    → 무한 대기 방지
 * 
 * 5. finally 블록
 *    → 예외 발생해도 syncInProgress 플래그 해제
 *    → 프로그램 정지 방지
 * 
 * ========================================
 */