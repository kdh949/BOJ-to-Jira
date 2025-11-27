async function getConfig() {
    const cfg = await chrome.storage.sync.get({
      jiraBaseUrl: '',
      jiraVersion: 'dc',
      projectKey: '',
      issueTypeName: 'Task',
      authUser: '',
      authToken: '',
      customFieldId: '',
      defaultLabels: 'baekjoon',
      customFieldId_Level: ''
    });
    return cfg;
  }
  
  function buildIssuePayload(cfg, problem) {
    //Solved.ac 티어 매핑
    const tierMap = {
      1: '브론즈 V', 2: '브론즈 IV', 3: '브론즈 III', 4: '브론즈 II', 5: '브론즈 I',
      6: '실버 V', 7: '실버 IV', 8: '실버 III', 9: '실버 II', 10: '실버 I',
      11: '골드 V', 12: '골드 IV', 13: '골드 III', 14: '골드 II', 15: '골드 I',
      16: '플래티넘 V', 17: '플래티넘 IV', 18: '플래티넘 III', 19: '플래티넘 II', 20: '플래티넘 I',
      21: '다이아몬드 V', 22: '다이아몬드 IV', 23: '다이아몬드 III', 24: '다이아몬드 II', 25: '다이아몬드 I',
      26: '루비 V', 27: '루비 IV', 28: '루비 III', 29: '루비 II', 30: '루비 I',
    };
    const tierName = tierMap[problem.tier];

    const summary = `[BOJ ${problem.number}][${tierName}] ${problem.title}`;
    const descriptionLines = [
      `* *문제 링크*: ${problem.url}`,
    ];
    if (tierName) {
      descriptionLines.push(`* *Solved.ac 난이도*: ${tierName}`);
    }
    descriptionLines.push(
      '',
      'h2. *설명*',
      problem.description ? `{panel}\n${problem.description}\n{panel}` : '(없음)',
      '',
      'h2. *입력*',
      problem.input ? `{panel}\n${problem.input}\n{panel}` : '(없음)',
      '',
      'h2. *출력*',
      problem.output ? `{panel}\n${problem.output}\n{panel}` : '(없음)',
      '',
      'h2. *제한*',
      problem.limit ? `{panel}\n${problem.limit}\n{panel}` : '(없음)',
    );
    if (problem.samples?.length) {
      const s = problem.samples[0];
      descriptionLines.push('', '*샘플 입력 1*', '{code:none}', s.in || '', '{code}', '', '*샘플 출력 1*', '{code:none}', s.out || '', '{code}');
    }
  
    const defaultLabels = (cfg.defaultLabels || 'baekjoon').split(',').map(s => s.trim()).filter(Boolean);
    const problemTags = (problem.tags || []).map(tag => tag.replace(/\s/g, '_'));
    // Set으로 중복 제거 후 배열로 변환
    const finalLabels = [...new Set([...defaultLabels, ...problemTags])];

    const fields = {
      project: { key: cfg.projectKey },
      summary,
      issuetype: { name: cfg.issueTypeName },
      labels: finalLabels,
      description: descriptionLines.join('\n')
    };
  
    // 커스텀 필드에 문제번호 저장
    if (cfg.customFieldId) {
      fields[cfg.customFieldId] = problem.number || '';
    }
  
    // 난이도 커스텀 필드 (드롭다운)
    if (cfg.customFieldId_Level && tierName) {
      // 드롭다운 필드는 보통 { "value": "옵션이름" } 형식
      fields[cfg.customFieldId_Level] = { value: tierName };
    }
    
    return { fields };
  }
  
  async function createIssue(cfg, problem) {
    const endpoint = cfg.jiraVersion === 'cloud'
      ? `${cfg.jiraBaseUrl}/rest/api/3/issue` //클라우드
      : `${cfg.jiraBaseUrl}/rest/api/2/issue`; //데이터센터
  
    const body = buildIssuePayload(cfg, problem);
    let authHeader;
    if (cfg.jiraVersion === 'dc') {
      authHeader = `Bearer ${cfg.authToken}`; // DC는 PAT (Bearer 토큰) 사용
    } else {
      authHeader = 'Basic ' + btoa(`${cfg.authUser}:${cfg.authToken}`); // Cloud는 email:APIToken (Basic)
    }
  
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira API 오류 (${res.status}): ${text}`);
    }
  
    const data = await res.json();
    // Cloud/DC 모두 응답에 key/self 등이 포함됨
    return { key: data.key, url: `${cfg.jiraBaseUrl}/browse/${data.key}` };
  }
  
  async function searchIssueByProblemNumber(cfg, problemNumber) {
    const endpoint = cfg.jiraVersion === 'cloud'
      ? `${cfg.jiraBaseUrl}/rest/api/3/search`
      : `${cfg.jiraBaseUrl}/rest/api/2/search`;
  
    // JQL 쿼리: project, issuetype, 문제 번호가 저장된 커스텀 필드, 생성자를 기준으로 검색
    const jql = `project = "${cfg.projectKey}" AND issuetype = "${cfg.issueTypeName}" AND cf[10402] ~ "${problemNumber}" AND reporter = currentUser() ORDER BY created DESC`;
  
    let authHeader;
    if (cfg.jiraVersion === 'dc') {
      authHeader = `Bearer ${cfg.authToken}`;
    } else {
      authHeader = 'Basic ' + btoa(`${cfg.authUser}:${cfg.authToken}`);
    }
  
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ jql, maxResults: 1, fields: ["key"] })
    });
  
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Jira 검색 API 오류 (${res.status}): ${text}`);
    }
  
    const data = await res.json();
    if (data.issues && data.issues.length > 0) {
      const issue = data.issues[0];
      return { 
        key: issue.key, 
        url: `${cfg.jiraBaseUrl}/browse/${issue.key}`,
        existed: true 
      };
    }
    return null; // 찾지 못함
  }
  
  async function findOrCreateIssue(cfg, problem) {
    if (!cfg.jiraBaseUrl || !cfg.projectKey || !cfg.issueTypeName || !cfg.authToken) {
      throw new Error('설정이 불완전합니다. 옵션 페이지에서 Jira 연결 정보를 채워주세요.');
    }
    // 중복 이슈를 찾으려면 '문제 번호 커스텀 필드'가 반드시 설정되어 있어야 함
    if (cfg.customFieldId && problem.number) {
      const existingIssue = await searchIssueByProblemNumber(cfg, problem.number);
      if (existingIssue) {
        return existingIssue; // 찾았으면 기존 이슈 정보 반환
      }
    }
    // 기존 이슈가 없거나, 검색할 수 없는 조건이면 새로 생성
    const newIssue = await createIssue(cfg, problem);
    return { ...newIssue, existed: false };
  }
  
  chrome.runtime.onInstalled.addListener(() => {
    // 컨텍스트 메뉴: 백준 문제 페이지에서만 보이도록
    chrome.contextMenus.create({
      id: 'create-jira-from-boj',
      title: '이 문제를 Jira 이슈로 만들기',
      contexts: ['page'],
      documentUrlPatterns: ['https://www.acmicpc.net/problem/*']
    });
  });
  
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === 'create-jira-from-boj') {
      // content-script로 파싱 요청
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'SCRAPE_BAEKJOON' });
      const cfg = await getConfig();
      try {
        const out = await findOrCreateIssue(cfg, res.problem);
        // 새 탭으로 이슈 페이지 열기
        chrome.notifications?.create({
          type: 'basic',
          title: out.existed ? 'Jira 이슈 찾음' : 'Jira 이슈 생성 완료',
          message: `${out.key} 이슈를 새 탭으로 엽니다.`
        });
        chrome.tabs.create({ url: out.url });

      } catch (e) {
        console.error(e);
        chrome.notifications?.create({
          type: 'basic',
          title: 'Jira 이슈 생성 실패',
          message: e.message
        });
      }
    }
  });
  
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    (async () => {
      if (msg?.type === 'CREATE_JIRA_ISSUE') {
        try {
          const cfg = await getConfig();
          const out = await findOrCreateIssue(cfg, msg.problem);
          sendResponse({ ok: true, key: out.key, url: out.url, existed: out.existed });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      }
    })();
    return true; // async
  });
  